const { test, before, after, describe } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const app = require('../src/index');
const { seedOwner, login, auth, cleanup, assertDatabaseAvailable } = require('./harness');

let server;
let base;
let seeded;
let ownerToken;
let workerToken;
let wsId;
let dbAvailable = false;

before(async () => {
  try {
    await assertDatabaseAvailable();
  } catch (error) {
    console.warn(`[Workspace tests skipped] ${error.message}`);
    return;
  }
  dbAvailable = true;
  server = http.createServer(app);
  await new Promise(r => server.listen(0, r));
  const { port } = server.address();
  base = `http://127.0.0.1:${port}`;

  seeded = await seedOwner('ws');
  ownerToken = await login(base, seeded.ownerEmail, seeded.password);
  workerToken = await login(base, seeded.workerEmail, seeded.password);

  // Create a workspace as owner
  const res = await fetch(`${base}/v1/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth(ownerToken) },
    body: JSON.stringify({ name: 'Ebay Client A' })
  });
  const body = await res.json();
  wsId = body.workspace.id;
});

after(async () => {
  await new Promise(r => server.close(r));
  await cleanup(seeded.ownerId);
});

describe('/v1/workspaces (Phase 1)', () => {
  test('owner can read workspace list', async () => {
    if (!dbAvailable) return;
    const res = await fetch(`${base}/v1/workspaces`, { headers: auth(ownerToken) });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(body.workspaces.some(w => w.name === 'Ebay Client A'));
  });

  test('owner adds worker as an Operator member', async () => {
    if (!dbAvailable) return;
    const res = await fetch(`${base}/v1/workspaces/${wsId}/members/${seeded.workerId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...auth(ownerToken) },
      body: JSON.stringify({ preset_role: 'operator' })
    });
    assert.strictEqual(res.status, 200);
    const list = await (await fetch(`${base}/v1/workspaces/${wsId}/members`, { headers: auth(ownerToken) })).json();
    assert.strictEqual(list.members.length, 1);
    assert.strictEqual(list.members[0].preset_role, 'operator');
  });

  test('worker can read workspace after membership but cannot manage members', async () => {
    if (!dbAvailable) return;
    const read = await fetch(`${base}/v1/workspaces/${wsId}`, { headers: auth(workerToken) });
    assert.strictEqual(read.status, 200);

    const deny = await fetch(`${base}/v1/workspaces/${wsId}/members/${seeded.workerId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...auth(workerToken) },
      body: JSON.stringify({ preset_role: 'manager' })
    });
    assert.strictEqual(deny.status, 403);
  });

  test('Worker cannot create tasks (Operator has no tasks.manage)', async () => {
    if (!dbAvailable) return;
    const res = await fetch(`${base}/v1/workspaces/${wsId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(workerToken) },
      body: JSON.stringify({ title: 'Create 5 profiles', assignee_type: 'owner', assignee_id: seeded.ownerId })
    });
    assert.strictEqual(res.status, 403);
  });

  test('Owner creates task + SOP version', async () => {
    if (!dbAvailable) return;
    const sop = await fetch(`${base}/v1/workspaces/${wsId}/sops`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(ownerToken) },
      body: JSON.stringify({ name: 'Amazon SOP', version: '1.0', content_markdown: '# Steps' })
    });
    assert.strictEqual(sop.status, 201);
    const sopId = (await sop.json()).id;

    const task = await fetch(`${base}/v1/workspaces/${wsId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(ownerToken) },
      body: JSON.stringify({
        title: 'Ta\u0323o 5 profile', priority: 'high',
        assignee_type: 'worker', assignee_id: seeded.workerId,
        sop_id: sopId, sop_version: '1.0',
        due_at: new Date(Date.now() - 86400000).toISOString()
      })
    });
    assert.strictEqual(task.status, 201);
    const taskId = (await task.json()).id;
    assert.ok(taskId);

    const overdue = await fetch(`${base}/v1/workspaces/${wsId}/tasks/overdue`, { headers: auth(ownerToken) });
    const overdueBody = await overdue.json();
    assert.strictEqual(overdue.status, 200);
    assert.ok(overdueBody.tasks.length >= 1);
  });

  test('task status transitions: done cannot regress to in_progress', async () => {
    if (!dbAvailable) return;
    const list = await (await fetch(`${base}/v1/workspaces/${wsId}/tasks`, { headers: auth(ownerToken) })).json();
    const taskId = list.tasks.find(t => t.status === 'todo').id;
    const toDone = await fetch(`${base}/v1/workspaces/${wsId}/tasks/${taskId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(ownerToken) },
      body: JSON.stringify({ status: 'done' })
    });
    assert.strictEqual(toDone.status, 200);

    const regress = await fetch(`${base}/v1/workspaces/${wsId}/tasks/${taskId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(ownerToken) },
      body: JSON.stringify({ status: 'in_progress' })
    });
    assert.strictEqual(regress.status, 400);
  });

  test('audit summary aggregates authorization events', async () => {
    if (!dbAvailable) return;
    const res = await fetch(`${base}/v1/workspaces/${wsId}/audit/summary`, { headers: auth(ownerToken) });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.aggregation));
  });
});

describe('/v1/workspaces/:id/ai (authorize + grant)', () => {
  test('authorize a read tool returns allow without grant', async () => {
    const res = await fetch(`${base}/v1/workspaces/${wsId}/ai/authorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(ownerToken) },
      body: JSON.stringify({ capability: 'profiles.read', tool_name: 'profiles.search', action_class: 'read' })
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.allowed, true);
    assert.strictEqual(body.grant, null);
  });

  test('authorize a worker write without ai.write cap is denied', async () => {
    const res = await fetch(`${base}/v1/workspaces/${wsId}/ai/authorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(workerToken) },
      body: JSON.stringify({ capability: 'workspace.manage', tool_name: 'x', action_class: 'write' })
    });
    const body = await res.json();
    assert.strictEqual(body.allowed, false);
  });

  test('owner write authorize returns a signed grant; verify passes', async () => {
    const res = await fetch(`${base}/v1/workspaces/${wsId}/ai/authorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(ownerToken) },
      body: JSON.stringify({
        capability: 'profiles.manage', tool_name: 'profiles.create_batch', action_class: 'write',
        parameters: { count: 5 }
      })
    });
    const body = await res.json();
    assert.strictEqual(body.allowed, true);
    assert.ok(body.grant);

    const verify = await fetch(`${base}/v1/workspaces/${wsId}/ai/verify-grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(ownerToken) },
      body: JSON.stringify({ grant: body.grant })
    });
    const vbody = await verify.json();
    assert.strictEqual(verify.status, 200);
    assert.strictEqual(vbody.allowed, true);
  });

  test('verify rejects a grant bound to another actor', async () => {
    const res = await fetch(`${base}/v1/workspaces/${wsId}/ai/authorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(ownerToken) },
      body: JSON.stringify({ capability: 'profiles.read', tool_name: 'x', action_class: 'read' })
    });
    // Use a write grant the target actor cannot present.
    const writeRes = await fetch(`${base}/v1/workspaces/${wsId}/ai/authorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(ownerToken) },
      body: JSON.stringify({ capability: 'proxies.use', tool_name: 'x', action_class: 'write', parameters: {} })
    });
    const writeBody = await writeRes.json();
    assert.ok(writeBody.grant);

    const verify = await fetch(`${base}/v1/workspaces/${wsId}/ai/verify-grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(workerToken) },
      body: JSON.stringify({ grant: writeBody.grant })
    });
    assert.strictEqual(verify.status, 403);
  });

  test('tool-started requires a valid grant header', async () => {
    const res = await fetch(`${base}/v1/workspaces/${wsId}/ai/tool-started`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(ownerToken), 'x-grant': 'bad.grant.value' },
      body: JSON.stringify({ correlation_id: 'c-1' })
    });
    assert.strictEqual(res.status, 403);
  });

  test('a worker grant is denied after capability is revoked (fail-closed)', async () => {
    // Operator has profiles.launch_stop, authorize a write grant.
    const au = await fetch(`${base}/v1/workspaces/${wsId}/ai/authorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(workerToken) },
      body: JSON.stringify({ capability: 'profiles.launch_stop', tool_name: 'profiles.launch_batch', action_class: 'write', parameters: { ids: [1] } })
    });
    const auBody = await au.json();
    assert.strictEqual(auBody.allowed, true);
    assert.ok(auBody.grant);

    // Verify works before the policy change.
    const ok = await fetch(`${base}/v1/workspaces/${wsId}/ai/verify-grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(workerToken) },
      body: JSON.stringify({ grant: auBody.grant })
    });
    assert.strictEqual((await ok.json()).allowed, true);

    // Owner trims the capability (bumps policy_revision).
    const trim = await fetch(`${base}/v1/workspaces/${wsId}/members/${seeded.workerId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...auth(ownerToken) },
      body: JSON.stringify({ preset_role: 'operator', capabilities: ['workspace.read'] })
    });
    assert.strictEqual(trim.status, 200);

    // The earlier grant is now invalid (policy changed).
    const after = await fetch(`${base}/v1/workspaces/${wsId}/ai/verify-grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(workerToken) },
      body: JSON.stringify({ grant: auBody.grant })
    });
    assert.strictEqual(after.status, 403);
    assert.strictEqual((await after.json()).reason, 'POLICY_CHANGED');
  });
});

describe('/v1/workspaces/:id/proxy-vault (Phase 2)', () => {
  let vaultId;

  test('owner creates an encrypted vault entry (no plaintext in response)', async () => {
    const res = await fetch(`${base}/v1/workspaces/${wsId}/proxy-vault`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(ownerToken) },
      body: JSON.stringify({
        label: 'US-01', kind: 'http', host: 'us-01.provider.io', port: 8080,
        country: 'US', username: 'proxyuser', password: 'supersecret'
      })
    });
    assert.strictEqual(res.status, 201);
    const body = await res.json();
    assert.ok(body.proxy.id);
    assert.ok(!body.proxy.username && !body.proxy.password && !body.proxy.ciphertext);
    assert.ok(!JSON.stringify(body).includes('supersecret'));
    vaultId = body.proxy.id;
  });

  test('manager worker with proxies.use can resolve the credential; others cannot', async () => {
    // Re-grant the worker the Manager preset (has proxies.read/use/assign).
    const put = await fetch(`${base}/v1/workspaces/${wsId}/members/${seeded.workerId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...auth(ownerToken) },
      body: JSON.stringify({ preset_role: 'manager' })
    });
    assert.strictEqual(put.status, 200);

    const list = await fetch(`${base}/v1/workspaces/${wsId}/proxy-vault`, { headers: auth(workerToken) });
    assert.strictEqual(list.status, 200);
    const listBody = await list.json();
    assert.strictEqual(listBody.proxies.length, 1);
    assert.ok(!JSON.stringify(listBody).includes('supersecret'));

    const resolve = await fetch(`${base}/v1/workspaces/${wsId}/proxy-vault/${vaultId}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(workerToken) },
      body: JSON.stringify({})
    });
    assert.strictEqual(resolve.status, 200);
    assert.strictEqual(resolve.headers.get('cache-control'), 'no-store');
    const resolved = await resolve.json();
    assert.strictEqual(resolved.username, 'proxyuser');
    assert.strictEqual(resolved.password, 'supersecret');
  });

  test('operator worker (no proxies.use) cannot resolve', async () => {
    const put = await fetch(`${base}/v1/workspaces/${wsId}/members/${seeded.workerId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...auth(ownerToken) },
      body: JSON.stringify({ preset_role: 'operator' })
    });
    assert.strictEqual(put.status, 200);

    const resolve = await fetch(`${base}/v1/workspaces/${wsId}/proxy-vault/${vaultId}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(workerToken) },
      body: JSON.stringify({})
    });
    assert.strictEqual(resolve.status, 403);
  });

  test('map a synced profile to the vault proxy', async () => {
    const profileId = `p-vault-${Date.now()}`;
    const created = await fetch(`${base}/v1/profiles/cloud/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(ownerToken) },
      body: JSON.stringify({ profile_id: profileId, name: 'Amazon US 1', config: { platform: 'amazon' }, revision: 1 })
    });
    assert.strictEqual(created.status, 200);

    const add = await fetch(`${base}/v1/workspaces/${wsId}/profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(ownerToken) },
      body: JSON.stringify({ profile_id: profileId })
    });
    assert.strictEqual(add.status, 201);
    const wpId = (await add.json()).workspace_profile_id;

    const map = await fetch(`${base}/v1/workspaces/${wsId}/profiles/${wpId}/assign-vault`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(ownerToken) },
      body: JSON.stringify({ vault_id: vaultId })
    });
    assert.strictEqual(map.status, 200);

    const list = await (await fetch(`${base}/v1/workspaces/${wsId}/profiles`, { headers: auth(ownerToken) })).json();
    const mapped = list.profiles.find(p => p.workspace_profile_id === wpId);
    assert.strictEqual(mapped.vault_proxy_id, vaultId);
  });
});
