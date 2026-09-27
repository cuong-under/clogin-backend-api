const { test, after } = require('node:test');
const assert = require('node:assert');
const Module = require('node:module');

// Integration test (khong DB): route PUT /cloud/:id/sync phai tra ve
// canonical_revision trong body khi 409 — client desktop (outbox + sync tay)
// ngoi vao field nay de tu dong adopt + retry. Truoc fix, route goi
// sendError(res, status, code, message) thuan tuy → canonical_revision bi
// rơi → client retry mai mai 409.

process.env.JWT_SECRET = 'test-jwt-secret-0000000000000000000000000000';
process.env.ADMIN_JWT_SECRET = 'test-admin-jwt-secret-00000000000000000000';
process.env.PROXY_VAULT_MASTER_KEY = 'clogin-dev-master-key-0000000001';

const cloudProfile = {
  id: 'p-1',
  owner_id: 'o-1',
  name: 'Profile A',
  folder: 'f1',
  config: {},
  assigned_worker_ids: [],
  sync_revision: 5
};

const prisma = {
  owner: { findUnique: async () => ({ id: 'o-1', active: true }) },
  cloudProfile: {
    findUnique: async () => cloudProfile,
    update: async ({ data }) => { Object.assign(cloudProfile, data); return cloudProfile; },
    create: async ({ data }) => { Object.assign(cloudProfile, data); return cloudProfile; }
  }
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === '@prisma/client') return { PrismaClient: class { constructor() { return prisma; } } };
  return originalLoad.call(this, request, parent, isMain);
};
const profilesRouter = require('../src/routes/profiles');
const { signUserJwt } = require('../src/utils/jwt');
Module._load = originalLoad;

const express = require('express');
const { errorHandler } = require('../src/middleware/error');
const app = express();
app.use(express.json());
app.use('/', profilesRouter);
app.use(errorHandler);

const server = app.listen(0);
const port = server.address().port;
after(() => server.close());

const token = signUserJwt({ sub: 'o-1', type: 'owner' });

async function putSync(revision) {
  const body = { name: 'Profile A', folder: 'f1', config: {} };
  if (revision !== undefined) body.revision = revision;
  const res = await fetch(`http://127.0.0.1:${port}/cloud/p-1/sync`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  });
  return { status: res.status, body: await res.json() };
}

test('sync revision khop -> 200, server tu tang revision', async () => {
  cloudProfile.sync_revision = 5;
  const { status, body } = await putSync(5);
  assert.strictEqual(status, 200);
  assert.strictEqual(body.sync_revision, 6);
  assert.strictEqual(cloudProfile.sync_revision, 6);
});

test('sync revision sai -> 408 kem canonical_revision trong error body', async () => {
  // Client gui revision cu (3) trong khi cloud da o 6.
  const { status, body } = await putSync(3);
  assert.strictEqual(status, 409);
  assert.strictEqual(body.error.code, 'SYNC_CONFLICT');
  assert.strictEqual(
    body.error.canonical_revision, 6,
    'THIEU canonical_revision → desktop outbox khong the adopt + retry'
  );
});

test('thieu revision -> 409 REVISION_REQUIRED kem canonical_revision', async () => {
  const { status, body } = await putSync(undefined);
  assert.strictEqual(status, 409);
  assert.strictEqual(body.error.code, 'REVISION_REQUIRED');
  assert.strictEqual(body.error.canonical_revision, 6);
});

test('profile cua owner khac -> 403, khong kem field ngoai', async () => {
  const foreign = { ...cloudProfile, id: 'p-2', owner_id: 'o-KHAC', sync_revision: 9 };
  const origFind = prisma.cloudProfile.findUnique;
  prisma.cloudProfile.findUnique = async () => foreign;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/cloud/p-2/sync`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: 'x', revision: 9 })
    });
    assert.strictEqual(res.status, 403);
    const body = await res.json();
    assert.strictEqual(body.error.code, 'FORBIDDEN');
  } finally {
    prisma.cloudProfile.findUnique = origFind;
  }
});
