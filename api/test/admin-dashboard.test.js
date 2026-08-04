const { test, before, after, describe } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const app = require('../src/index');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { signAdminJwt } = require('../src/utils/jwt');
const { seedOwner, auth, assertDatabaseAvailable } = require('./harness');

let server;
let base;
let dbAvailable = false;
let adminToken;
let viewerToken;
let seeded;
let ownerId;
let workerId;
let profileId;
let wsId;
let baseline;

function adminAuth(token) {
  return { Authorization: `Bearer ${token}` };
}

before(async () => {
  try {
    await assertDatabaseAvailable();
  } catch (error) {
    if (process.env.CI || process.env.STRICT_TEST === '1') throw error;
    console.warn(`[Admin dashboard tests skipped] ${error.message}`);
    return;
  }
  dbAvailable = true;

  adminToken = signAdminJwt({ sub: 'test-super-admin', email: 'admin@test.local', role: 'super_admin' });
  viewerToken = signAdminJwt({ sub: 'test-viewer', email: 'viewer@test.local', role: 'viewer' });

  server = http.createServer(app);
  await new Promise(r => server.listen(0, r));
  const { port } = server.address();
  base = `http://127.0.0.1:${port}`;

  // Baseline trước khi seed (đếm delta thay vì số tuyệt đối)
  const statsRes = await fetch(`${base}/v1/admin/dashboard/stats?range=7d`, { headers: adminAuth(adminToken) });
  baseline = await statsRes.json();

  seeded = await seedOwner('admin-dash');
  ownerId = seeded.ownerId;
  workerId = seeded.workerId;

  // Workspace + member
  const ws = await prisma.workspace.create({
    data: { owner_id: ownerId, name: 'Admin Dash WS' }
  });
  wsId = ws.id;
  await prisma.workspaceMember.create({
    data: {
      workspace_id: wsId,
      worker_id: workerId,
      preset_role: 'manager',
      capabilities: ['profiles.manage', 'tasks.read'],
      active: true
    }
  });

  // Profile + workspace mapping (vault_proxy_id có giá trị)
  const profile = await prisma.cloudProfile.create({
    data: { id: `prof-${Date.now()}`, owner_id: ownerId, name: 'Dash Profile', folder: 'dash' }
  });
  profileId = profile.id;
  await prisma.workspaceProfile.create({
    data: { workspace_id: wsId, profile_id: profileId, vault_proxy_id: 'vault-1' }
  });

  // SOP active
  await prisma.sopTemplate.create({
    data: { workspace_id: wsId, name: 'Dash SOP', version: '1.0', is_active: true }
  });

  // Tasks: 1 todo (active), 1 in_progress overdue, 1 done (không đếm)
  await prisma.workspaceTask.create({
    data: { workspace_id: wsId, title: 'T1', assignee_type: 'worker', assignee_id: workerId, status: 'todo' }
  });
  await prisma.workspaceTask.create({
    data: {
      workspace_id: wsId, title: 'T2', assignee_type: 'worker', assignee_id: workerId,
      status: 'in_progress', due_at: new Date(Date.now() - 86400000)
    }
  });
  await prisma.workspaceTask.create({
    data: { workspace_id: wsId, title: 'T3', assignee_type: 'worker', assignee_id: workerId, status: 'done', completed_at: new Date() }
  });

  // Vault entries x2
  for (let i = 1; i <= 2; i++) {
    await prisma.proxyVaultEntry.create({
      data: {
        workspace_id: wsId,
        label: `proxy-${i}`,
        host: '127.0.0.1',
        port: 8080 + i,
        ciphertext: 'ct',
        nonce: 'nonce',
        tag: 'tag',
        encrypted_dek: 'dek',
        dek_nonce: 'dn',
        dek_tag: 'dt',
        credential_fingerprint: `fp-${Date.now()}-${i}`
      }
    });
  }

  // Workspace audit events: 1 authorized, 1 denied (trong 24h)
  await prisma.workspaceAuditEvent.create({
    data: {
      owner_id: ownerId, workspace_id: wsId, actor_id: workerId, actor_type: 'worker',
      tool_name: 'browser.navigate', capability: 'profiles.use', status: 'authorized'
    }
  });
  await prisma.workspaceAuditEvent.create({
    data: {
      owner_id: ownerId, workspace_id: wsId, actor_id: workerId, actor_type: 'worker',
      tool_name: 'browser.export_cookies', capability: 'profiles.use', status: 'denied'
    }
  });
});

after(async () => {
  if (server) await new Promise(r => server.close(r));
  if (seeded) await prisma.owner.deleteMany({ where: { id: seeded.ownerId } }).catch(() => {});
});

describe('Dashboard stats mới (workspace/task/sop/vault/ai-audit)', () => {
  test('trả đủ field mới và đếm đúng sau khi seed', async () => {
    if (!dbAvailable) return;
    const res = await fetch(`${base}/v1/admin/dashboard/stats?range=7d`, { headers: adminAuth(adminToken) });
    assert.strictEqual(res.status, 200);
    const stats = await res.json();

    assert.strictEqual(stats.total_workspaces, baseline.total_workspaces + 1);
    assert.strictEqual(stats.archived_workspaces, baseline.archived_workspaces);
    assert.strictEqual(stats.total_workspace_members, baseline.total_workspace_members + 1);
    assert.strictEqual(stats.total_tasks, baseline.total_tasks + 3);
    assert.strictEqual(stats.active_tasks, baseline.active_tasks + 2);
    assert.strictEqual(stats.overdue_tasks, baseline.overdue_tasks + 1);
    assert.strictEqual(stats.total_sops, baseline.total_sops + 1);
    assert.strictEqual(stats.total_vault_entries, baseline.total_vault_entries + 2);
    assert.strictEqual(stats.ai_audit_events_24h, baseline.ai_audit_events_24h + 2);
    assert.strictEqual(stats.ai_audit_denied_24h, baseline.ai_audit_denied_24h + 1);

    // Field cũ không đổi
    assert.ok('total_licenses' in stats);
    assert.ok('active_users' in stats);
    assert.ok('cloud_profiles' in stats);
    assert.ok('active_devices' in stats);
    assert.ok(Array.isArray(stats.logins_by_day));
    assert.ok(Array.isArray(stats.new_users_by_day));
    assert.ok(Array.isArray(stats.recent_activity));
  });
});

describe('Endpoint mới: GET /users/owners/:id/workspaces', () => {
  test('trả đúng danh sách workspace của owner kèm count', async () => {
    if (!dbAvailable) return;
    const res = await fetch(`${base}/v1/admin/users/owners/${ownerId}/workspaces`, { headers: adminAuth(adminToken) });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.workspaces));
    const ws = body.workspaces.find(w => w.id === wsId);
    assert.ok(ws);
    assert.strictEqual(ws.name, 'Admin Dash WS');
    assert.strictEqual(ws.archived, false);
    assert.strictEqual(ws.member_count, 1);
    assert.strictEqual(ws.profile_count, 1);
    assert.strictEqual(ws.task_count, 3);
    assert.strictEqual(ws.sop_count, 1);
    assert.strictEqual(ws.audit_count, 2);
    assert.ok(ws.policy_revision >= 1);
    assert.ok(ws.created_at);
  });
});

describe('Endpoint mới: GET /users/workers/:id/memberships', () => {
  test('trả đúng memberships của worker kèm workspace', async () => {
    if (!dbAvailable) return;
    const res = await fetch(`${base}/v1/admin/users/workers/${workerId}/memberships`, { headers: adminAuth(adminToken) });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.memberships));
    const m = body.memberships.find(x => x.workspace_id === wsId);
    assert.ok(m);
    assert.strictEqual(m.workspace_name, 'Admin Dash WS');
    assert.strictEqual(m.workspace_archived, false);
    assert.strictEqual(m.preset_role, 'manager');
    assert.ok(Array.isArray(m.capabilities) && m.capabilities.length >= 1);
    assert.strictEqual(m.active, true);
    assert.ok(m.member_created_at);
  });
});

describe('Endpoint mới: GET /profiles/:id/workspaces', () => {
  test('trả đúng mapping workspace chứa profile', async () => {
    if (!dbAvailable) return;
    const res = await fetch(`${base}/v1/admin/profiles/${profileId}/workspaces`, { headers: adminAuth(adminToken) });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.workspaces));
    const p = body.workspaces.find(x => x.workspace_id === wsId);
    assert.ok(p);
    assert.strictEqual(p.workspace_name, 'Admin Dash WS');
    assert.strictEqual(p.workspace_archived, false);
    assert.strictEqual(p.vault_proxy_id, 'vault-1');
    assert.ok(p.created_at);
  });
});

describe('Field merged trong detail response', () => {
  test('GET /users/owners/:id có field workspaces', async () => {
    if (!dbAvailable) return;
    const res = await fetch(`${base}/v1/admin/users/owners/${ownerId}`, { headers: adminAuth(adminToken) });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.owner.workspaces));
    assert.ok(body.owner.workspaces.some(w => w.id === wsId));
  });

  test('GET /users/workers/:id có field memberships', async () => {
    if (!dbAvailable) return;
    const res = await fetch(`${base}/v1/admin/users/workers/${workerId}`, { headers: adminAuth(adminToken) });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.worker.memberships));
    assert.ok(body.worker.memberships.some(m => m.workspace_id === wsId));
  });

  test('GET /profiles/:id có field workspaces', async () => {
    if (!dbAvailable) return;
    const res = await fetch(`${base}/v1/admin/profiles/${profileId}`, { headers: adminAuth(adminToken) });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.profile.workspaces));
    assert.ok(body.profile.workspaces.some(w => w.workspace_id === wsId));
  });
});

describe('Thứ tự route & phân quyền', () => {
  test('sub-route không bị route generic /users/owners/:id che', async () => {
    if (!dbAvailable) return;
    const res = await fetch(`${base}/v1/admin/users/owners/${ownerId}/workspaces`, { headers: adminAuth(adminToken) });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.workspaces));
    assert.strictEqual(body.workspaces[0].id, wsId);
  });

  test('viewer được GET endpoint mới nhưng bị chặn POST', async () => {
    if (!dbAvailable) return;
    const getRes = await fetch(`${base}/v1/admin/users/workers/${workerId}/memberships`, { headers: adminAuth(viewerToken) });
    assert.strictEqual(getRes.status, 200);

    const postRes = await fetch(`${base}/v1/admin/profiles/${profileId}/transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...adminAuth(viewerToken) },
      body: JSON.stringify({ new_owner_id: ownerId })
    });
    assert.strictEqual(postRes.status, 403);
  });
});
