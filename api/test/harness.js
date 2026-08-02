const { PrismaClient } = require('@prisma/client');
const { hashPw } = require('../src/utils/hash');
const prisma = new PrismaClient();

// Seed a fully usable owner + license + worker for tests.
async function seedOwner(suffix) {
  const unique = `${process.pid}-${Date.now()}-${suffix}`;
  const email = `owner_${unique}@test.local`;
  const workerEmail = `worker_${unique}@test.local`;
  const password = 'TestPass12345!';

  const lic = await prisma.license.create({
    data: { key: `TEST-${unique}`, plan_name: 'Test', max_devices: 5 }
  });
  const owner = await prisma.owner.create({
    data: {
      email,
      password_hash: hashPw(password),
      license_id: lic.id,
      max_worker_slots: 5
    }
  });
  const worker = await prisma.worker.create({
    data: {
      owner_id: owner.id,
      email: workerEmail,
      password_hash: hashPw(password),
      name: 'Worker Nam',
      active: true
    }
  });
  return { owner, worker, password, ownerEmail: email, workerEmail, ownerId: owner.id, workerId: worker.id };
}

async function login(base, email, password) {
  const res = await fetch(`${base}/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const body = await res.json();
  if (res.status !== 200) throw new Error(`Login failed: ${JSON.stringify(body)} (${res.status})`);
  return body.token;
}

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

async function cleanup(ownerId, licenses) {
  await prisma.owner.deleteMany({ where: { id: ownerId } }).catch(() => {});
}

module.exports = { seedOwner, login, auth, cleanup };;