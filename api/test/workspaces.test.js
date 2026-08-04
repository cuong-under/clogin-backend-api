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
    // Fail-hard khi chạy CI hoặc STRICT_TEST=1: PostgreSQL không khả dụng phải
    // throw thay vì silent skip để tránh báo cáo PASS giả trên CI.
    if (process.env.CI || process.env.STRICT_TEST === '1') {
      throw error;
    }
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

// ---- Helpers dùng cho Phase 3-7 (theo plan mục 4.1) ----
async function createWs(name) {
  return fetch(`${base}/v1/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth(ownerToken) },
    body: JSON.stringify({ name })
  });
}
async function syncProfile(profileId, name) {
  return fetch(`${base}/v1/profiles/cloud/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth(ownerToken) },
    body: JSON.stringify({ profile_id: profileId, name, config: { platform: 'generic' }, revision: 1 })
  });
}
async function addProfile(ws, profileId, confirmReuse = false) {
  return fetch(`${base}/v1/workspaces/${ws}/profiles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth(ownerToken) },
    body: JSON.stringify({ profile_id: profileId, confirm_reuse: confirmReuse })
  });
}
async function createTask(ws, overrides = {}) {
  return fetch(`${base}/v1/workspaces/${ws}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth(ownerToken) },
    body: JSON.stringify({ title: 'Task test ' + Date.now(), assignee_type: 'owner', assignee_id: seeded.ownerId, ...overrides })
  });
}
async function setMemberPreset(workerId, presetRole) {
  return fetch(`${base}/v1/workspaces/${wsId}/members/${workerId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...auth(ownerToken) },
    body: JSON.stringify({ preset_role: presetRole })
  });
}

describe('/v1/workspaces/:id — Phase 3 (workspace delete + confirm_name)', () => {
  test('delete workspace với confirm_name sai trả 400 CONFIRM_NAME_MISMATCH', async () => {
    if (!dbAvailable) return;
    const created = await (await createWs('Delete Me WS ' + Date.now())).json();
    const wrong = await fetch(`${base}/v1/workspaces/${created.workspace.id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...auth(ownerToken) },
      body: JSON.stringify({ confirm_name: 'Tên không khớp' })
    });
    assert.strictEqual(wrong.status, 400);
    assert.strictEqual((await wrong.json()).error.code, 'CONFIRM_NAME_MISMATCH');
    await fetch(`${base}/v1/workspaces/${created.workspace.id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...auth(ownerToken) },
      body: JSON.stringify({ confirm_name: created.workspace.name })
    });
  });

  test('xóa workspace không xóa Cloud Profile gốc', async () => {
    if (!dbAvailable) return;
    const created = await (await createWs('Del Profile WS ' + Date.now())).json();
    const delWsId = created.workspace.id;
    const profileId = 'p-del-' + Date.now();
    await syncProfile(profileId, 'Profile giữ lại');
    const add = await addProfile(delWsId, profileId);
    assert.strictEqual(add.status, 201);
    const del = await fetch(`${base}/v1/workspaces/${delWsId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...auth(ownerToken) },
      body: JSON.stringify({ confirm_name: created.workspace.name })
    });
    assert.strictEqual(del.status, 200);
    const reAdd = await addProfile(wsId, profileId);
    assert.strictEqual(reAdd.status, 201, 'Profile cloud vẫn tồn tại sau khi xóa workspace');
  });
});

describe('/v1/workspaces/:id/members — Phase 4 (handoff)', () => {
  test('khóa member có task mở trả 409 TASK_HANDOFF_REQUIRED kèm tasks + assignees', async () => {
    if (!dbAvailable) return;
    await createTask(wsId, { title: 'Handoff deactivate', assignee_type: 'worker', assignee_id: seeded.workerId });
    const res = await fetch(`${base}/v1/workspaces/${wsId}/members/${seeded.workerId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...auth(ownerToken) },
      body: JSON.stringify({ active: false })
    });
    assert.strictEqual(res.status, 409);
    const body = await res.json();
    assert.strictEqual(body.error.code, 'TASK_HANDOFF_REQUIRED');
    assert.ok(Array.isArray(body.error.tasks) && body.error.tasks.length >= 1);
    assert.ok(Array.isArray(body.error.assignees) && body.error.assignees.length >= 1);
  });

  test('khóa member với reassign_to owner: bàn giao task và khóa member', async () => {
    if (!dbAvailable) return;
    const task = await (await createTask(wsId, { title: 'Handoff deactivate ok', assignee_type: 'worker', assignee_id: seeded.workerId })).json();
    const res = await fetch(`${base}/v1/workspaces/${wsId}/members/${seeded.workerId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...auth(ownerToken) },
      body: JSON.stringify({ active: false, reassign_to: { type: 'owner', id: seeded.ownerId } })
    });
    assert.strictEqual(res.status, 200);
    const got = await (await fetch(`${base}/v1/workspaces/${wsId}/tasks/${task.id}`, { headers: auth(ownerToken) })).json();
    assert.strictEqual(got.task.assignee_id, seeded.ownerId);
    const list = await (await fetch(`${base}/v1/workspaces/${wsId}/members`, { headers: auth(ownerToken) })).json();
    assert.strictEqual(list.members.find(m => m.worker_id === seeded.workerId).active, false);
  });

  test('reactivate member để tiếp tục test', async () => {
    if (!dbAvailable) return;
    const res = await fetch(`${base}/v1/workspaces/${wsId}/members/${seeded.workerId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...auth(ownerToken) },
      body: JSON.stringify({ active: true })
    });
    assert.strictEqual(res.status, 200);
  });

  test('xóa member có task mở: 409; với reassign thì xóa được', async () => {
    if (!dbAvailable) return;
    await createTask(wsId, { title: 'Handoff delete', assignee_type: 'worker', assignee_id: seeded.workerId });
    const deny = await fetch(`${base}/v1/workspaces/${wsId}/members/${seeded.workerId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...auth(ownerToken) },
      body: JSON.stringify({})
    });
    assert.strictEqual(deny.status, 409);
    const ok = await fetch(`${base}/v1/workspaces/${wsId}/members/${seeded.workerId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...auth(ownerToken) },
      body: JSON.stringify({ reassign_to: { type: 'owner', id: seeded.ownerId } })
    });
    assert.strictEqual(ok.status, 200);
    const list = await (await fetch(`${base}/v1/workspaces/${wsId}/members`, { headers: auth(ownerToken) })).json();
    assert.strictEqual(list.members.some(m => m.worker_id === seeded.workerId), false);
  });
});

describe('/v1/workspaces/:id/profiles — Phase 5 (rules)', () => {
  test('owner thêm lại worker làm operator', async () => {
    if (!dbAvailable) return;
    const res = await setMemberPreset(seeded.workerId, 'operator');
    assert.strictEqual(res.status, 200);
  });

  test('worker chỉ thấy profile được gán; manager (profiles.assign) thấy tất cả', async () => {
    if (!dbAvailable) return;
    const p1 = 'p-f-' + Date.now();
    const p2 = 'p-f2-' + Date.now();
    await syncProfile(p1, 'Filtered 1');
    await syncProfile(p2, 'Filtered 2');
    const w1 = await (await addProfile(wsId, p1)).json();
    await addProfile(wsId, p2);
    const assign = await fetch(`${base}/v1/workspaces/${wsId}/profiles/assignments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(ownerToken) },
      body: JSON.stringify({ worker_id: seeded.workerId, profile_ids: [w1.workspace_profile_id] })
    });
    assert.strictEqual(assign.status, 200);

    const listW = await (await fetch(`${base}/v1/workspaces/${wsId}/profiles`, { headers: auth(workerToken) })).json();
    const idsW = listW.profiles.map(p => p.profile_id);
    assert.ok(idsW.includes(p1), 'worker thấy profile được gán');
    assert.ok(!idsW.includes(p2), 'worker không thấy profile chưa gán');

    await setMemberPreset(seeded.workerId, 'manager');
    const listM = await (await fetch(`${base}/v1/workspaces/${wsId}/profiles`, { headers: auth(workerToken) })).json();
    const idsM = listM.profiles.map(p => p.profile_id);
    assert.ok(idsM.includes(p1) && idsM.includes(p2), 'manager thấy tất cả');
    await setMemberPreset(seeded.workerId, 'operator');
  });

  test('profile reuse: request đầu 409 kèm workspace liên kết; confirm_reuse=true thì OK', async () => {
    if (!dbAvailable) return;
    const ws2 = (await (await createWs('Reuse WS ' + Date.now())).json()).workspace.id;
    const pid = 'p-reuse-' + Date.now();
    await syncProfile(pid, 'Reuse profile');
    await addProfile(wsId, pid);
    const deny = await addProfile(ws2, pid);
    assert.strictEqual(deny.status, 409);
    const body = await deny.json();
    assert.strictEqual(body.error.code, 'PROFILE_REUSE_CONFIRMATION_REQUIRED');
    assert.ok(Array.isArray(body.error.workspaces) && body.error.workspaces.length >= 1);
    const ok = await addProfile(ws2, pid, true);
    assert.strictEqual(ok.status, 201);
  });

  test('gỡ profile đang gắn task mở bị chặn 409; sau khi task done thì gỡ được', async () => {
    if (!dbAvailable) return;
    const pid = 'p-active-' + Date.now();
    await syncProfile(pid, 'Active task profile');
    const wp = (await (await addProfile(wsId, pid)).json()).workspace_profile_id;
    const task = (await (await createTask(wsId, { title: 'Task dùng profile', profile_ids: [wp] })).json()).id;
    const deny = await fetch(`${base}/v1/workspaces/${wsId}/profiles/${wp}`, { method: 'DELETE', headers: auth(ownerToken) });
    assert.strictEqual(deny.status, 409);
    const body = await deny.json();
    assert.strictEqual(body.error.code, 'PROFILE_IN_ACTIVE_TASK');
    assert.ok(Array.isArray(body.error.tasks) && body.error.tasks.length >= 1);
    await fetch(`${base}/v1/workspaces/${wsId}/tasks/${task}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(ownerToken) },
      body: JSON.stringify({ status: 'done' })
    });
    const ok = await fetch(`${base}/v1/workspaces/${wsId}/profiles/${wp}`, { method: 'DELETE', headers: auth(ownerToken) });
    assert.strictEqual(ok.status, 200);
  });

  test('gỡ assignment (unassign) một profile cho worker', async () => {
    if (!dbAvailable) return;
    const pid = 'p-unassign-' + Date.now();
    await syncProfile(pid, 'Unassign profile');
    const wp = (await (await addProfile(wsId, pid)).json()).workspace_profile_id;
    await fetch(`${base}/v1/workspaces/${wsId}/profiles/assignments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(ownerToken) },
      body: JSON.stringify({ worker_id: seeded.workerId, profile_ids: [wp] })
    });
    const un = await fetch(`${base}/v1/workspaces/${wsId}/profiles/assignments`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...auth(ownerToken) },
      body: JSON.stringify({ worker_id: seeded.workerId, profile_ids: [wp] })
    });
    assert.strictEqual(un.status, 200);
    assert.strictEqual((await un.json()).removed, 1);
  });
});

describe('/v1/workspaces/:id/tasks — Phase 6 (SOP snapshot, update_own, activity)', () => {
  test('task chỉ chọn SOP active; snapshot lấy từ DB', async () => {
    if (!dbAvailable) return;
    const sopName = 'SOP Act ' + Date.now();
    const sop = await (await fetch(`${base}/v1/workspaces/${wsId}/sops`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(ownerToken) },
      body: JSON.stringify({ name: sopName, version: '1.0', content_markdown: '# Bước 1', checklist: [{ done: false, text: 'A' }] })
    })).json();
    assert.strictEqual(sop.is_active, true, 'version đầu tiên auto active');
    const task = await (await createTask(wsId, { title: 'Task SOP snapshot', sop_id: sop.id })).json();
    const got = await (await fetch(`${base}/v1/workspaces/${wsId}/tasks/${task.id}`, { headers: auth(ownerToken) })).json();
    assert.strictEqual(got.task.sop_version, '1.0');
    assert.strictEqual(got.task.sop_snapshot.content_markdown, '# Bước 1');
    assert.strictEqual(got.task.sop_snapshot.checklist.length, 1);

    const sop2 = await (await fetch(`${base}/v1/workspaces/${wsId}/sops`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(ownerToken) },
      body: JSON.stringify({ name: sopName, version: '2.0', content_markdown: '# Bước 2' })
    })).json();
    assert.strictEqual(sop2.is_active, false, 'version mới cùng tên không auto active');
    const bad = await createTask(wsId, { title: 'Task SOP inactive', sop_id: sop2.id });
    assert.strictEqual(bad.status, 400, 'task không chọn được SOP chưa active');
  });

  test('operator không PATCH lén field cấu hình task được giao', async () => {
    if (!dbAvailable) return;
    const task = (await (await createTask(wsId, { title: 'Task update_own', assignee_type: 'worker', assignee_id: seeded.workerId })).json()).id;
    const res = await fetch(`${base}/v1/workspaces/${wsId}/tasks/${task}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...auth(workerToken) },
      body: JSON.stringify({ priority: 'urgent' })
    });
    assert.strictEqual(res.status, 403);
  });

  test('operator được đổi status và thêm note cho task được giao', async () => {
    if (!dbAvailable) return;
    const task = (await (await createTask(wsId, { title: 'Task operator', assignee_type: 'worker', assignee_id: seeded.workerId })).json()).id;
    const st = await fetch(`${base}/v1/workspaces/${wsId}/tasks/${task}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(workerToken) },
      body: JSON.stringify({ status: 'in_progress' })
    });
    assert.strictEqual(st.status, 200);
    const note = await fetch(`${base}/v1/workspaces/${wsId}/tasks/${task}/activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(workerToken) },
      body: JSON.stringify({ message: 'Tiến hành thôi' })
    });
    assert.strictEqual(note.status, 201);
  });

  test('activity timeline đầy đủ và delete giữ history workspace', async () => {
    if (!dbAvailable) return;
    const title = 'Task timeline ' + Date.now();
    const task = (await (await createTask(wsId, { title })).json()).id;
    await fetch(`${base}/v1/workspaces/${wsId}/tasks/${task}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...auth(ownerToken) },
      body: JSON.stringify({ priority: 'high' })
    });
    await fetch(`${base}/v1/workspaces/${wsId}/tasks/${task}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(ownerToken) },
      body: JSON.stringify({ status: 'done' })
    });
    await fetch(`${base}/v1/workspaces/${wsId}/tasks/${task}/reopen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(ownerToken) },
      body: JSON.stringify({ status: 'todo', reason: 'Cần làm lại' })
    });
    await fetch(`${base}/v1/workspaces/${wsId}/tasks/${task}/activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(ownerToken) },
      body: JSON.stringify({ message: 'Ghi chú cuối' })
    });
    const act = await (await fetch(`${base}/v1/workspaces/${wsId}/tasks/${task}/activity`, { headers: auth(ownerToken) })).json();
    const types = act.activities.map(a => a.event_type);
    assert.ok(types.includes('created'));
    assert.ok(types.includes('updated'));
    assert.ok(types.includes('status_changed'));
    assert.ok(types.includes('reopened'));
    assert.ok(types.includes('note_added'));

    await fetch(`${base}/v1/workspaces/${wsId}/tasks/${task}`, { method: 'DELETE', headers: auth(ownerToken) });
    const wsAct = await (await fetch(`${base}/v1/workspaces/${wsId}/task-activity?limit=50`, { headers: auth(ownerToken) })).json();
    const del = wsAct.activities.find(a => a.event_type === 'deleted' && a.task_id === null && a.task_title_snapshot === title);
    assert.ok(del, 'event deleted giữ history cấp workspace sau khi xóa task');
  });
});

describe('/v1/workspaces/:id/tasks/batch — Phase 7 (atomic + max20)', () => {
  test('batch quá 20 task trả 400 BATCH_LIMIT_EXCEEDED', async () => {
    if (!dbAvailable) return;
    const ids = Array.from({ length: 21 }, (_, i) => 't-' + i);
    const res = await fetch(`${base}/v1/workspaces/${wsId}/tasks/batch/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(ownerToken) },
      body: JSON.stringify({ task_ids: ids, status: 'done' })
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual((await res.json()).error.code, 'BATCH_LIMIT_EXCEEDED');
  });

  test('batch status atomic: một item invalid thì không item nào ghi', async () => {
    if (!dbAvailable) return;
    const t1 = (await (await createTask(wsId, { title: 'Batch atomic t1' })).json()).id;
    const t2 = (await (await createTask(wsId, { title: 'Batch atomic t2' })).json()).id;
    await fetch(`${base}/v1/workspaces/${wsId}/tasks/${t1}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(ownerToken) },
      body: JSON.stringify({ status: 'done' })
    });
    const res = await fetch(`${base}/v1/workspaces/${wsId}/tasks/batch/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(ownerToken) },
      body: JSON.stringify({ task_ids: [t1, t2], status: 'done' })
    });
    assert.strictEqual(res.status, 400);
    const got = await (await fetch(`${base}/v1/workspaces/${wsId}/tasks/${t2}`, { headers: auth(ownerToken) })).json();
    assert.strictEqual(got.task.status, 'todo', 'atomic: t2 không bị ghi');
  });

  test('batch status hợp lệ: atomic true và đổi đủ task', async () => {
    if (!dbAvailable) return;
    const t1 = (await (await createTask(wsId, { title: 'Batch ok t1' })).json()).id;
    const t2 = (await (await createTask(wsId, { title: 'Batch ok t2' })).json()).id;
    const res = await fetch(`${base}/v1/workspaces/${wsId}/tasks/batch/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(ownerToken) },
      body: JSON.stringify({ task_ids: [t1, t2], status: 'in_progress' })
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.atomic, true);
    assert.strictEqual(body.results.length, 2);
  });

  test('batch assignment chuyển assignee cho tất cả task', async () => {
    if (!dbAvailable) return;
    const t1 = (await (await createTask(wsId, { title: 'Batch assign t1' })).json()).id;
    const t2 = (await (await createTask(wsId, { title: 'Batch assign t2' })).json()).id;
    const res = await fetch(`${base}/v1/workspaces/${wsId}/tasks/batch/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(ownerToken) },
      body: JSON.stringify({ task_ids: [t1, t2], assignee_type: 'worker', assignee_id: seeded.workerId })
    });
    assert.strictEqual(res.status, 200);
    const got = await (await fetch(`${base}/v1/workspaces/${wsId}/tasks/${t1}`, { headers: auth(ownerToken) })).json();
    assert.strictEqual(got.task.assignee_id, seeded.workerId);
  });

  test('batch note: operator không note được task không phải của mình', async () => {
    if (!dbAvailable) return;
    const t1 = (await (await createTask(wsId, { title: 'Batch note owner' })).json()).id;
    const res = await fetch(`${base}/v1/workspaces/${wsId}/tasks/batch/note`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(workerToken) },
      body: JSON.stringify({ task_ids: [t1], message: 'Xâm phạm task của owner' })
    });
    assert.strictEqual(res.status, 403);
  });
});
