const { test } = require('node:test');
const assert = require('node:assert');

const { sendServiceError, sendError } = require('../src/middleware/error');

// fake Express res: capture status + json payload
function fakeRes() {
  const out = { statusCode: null, body: null };
  return {
    out,
    status(code) { out.statusCode = code; return this; },
    json(payload) { out.body = payload; return this; }
  };
}

test('sendServiceError: giu canonical_revision cua 409 SYNC_CONFLICT', () => {
  // Desktop outbox (profile_sync.rs) VA client khac ngoi vao error.canonical_revision
  // de tu dong adopt + retry. Truoc fix, route goi sendError(res, status, code,
  // message) thuan tuy khong truyen details -> canonical_revision mat -> retry
  // gap lai 409 mai mai.
  const res = fakeRes();
  const err = {
    statusCode: 409,
    code: 'SYNC_CONFLICT',
    message: 'Cloud da co revision moi hon. Can refresh truoc khi sync.',
    canonical_revision: 7
  };
  sendServiceError(res, err);
  assert.strictEqual(res.out.statusCode, 409);
  assert.strictEqual(res.out.body.error.code, 'SYNC_CONFLICT');
  assert.strictEqual(res.out.body.error.canonical_revision, 7);
});

test('sendServiceError: khong kem canonical_revision khi loi thuong', () => {
  const res = fakeRes();
  sendServiceError(res, {
    statusCode: 403,
    code: 'FORBIDDEN',
    message: 'Profile khong thuoc so huu cua ban'
  });
  assert.strictEqual(res.out.statusCode, 403);
  assert.deepStrictEqual(res.out.body.error, {
    code: 'FORBIDDEN',
    message: 'Profile khong thuoc so huu cua ban'
  });
});

test('sendServiceError: nhieu field ngoai van giu nguyen (workspaces/tasks admin)', () => {
  const res = fakeRes();
  sendServiceError(res, {
    statusCode: 409,
    code: 'WORKSPACE_HAS_TASKS',
    message: 'Workspace van con task',
    workspaces: ['w1', 'w2'],
    tasks: [{ id: 't1', title: 'task A' }]
  });
  assert.strictEqual(res.out.body.error.workspaces.length, 2);
  assert.strictEqual(res.out.body.error.tasks[0].id, 't1');
});

test('sendServiceError: loi khong co statusCode -> 500 trung tinh, khong tin field', () => {
  const res = fakeRes();
  // Err cua bug ngoai y muon (khong qua service layer) — co stack, co code rac.
  sendServiceError(res, { code: 'BOOM', stack: 'Error: at /secret/path.js:1:1' });
  assert.strictEqual(res.out.statusCode, 500);
  assert.deepStrictEqual(res.out.body.error, {
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Đã xảy ra lỗi máy chủ'
  });
});

test('sendServiceError: khong rut re stack trace/internal field ra response', () => {
  const res = fakeRes();
  sendServiceError(res, {
    statusCode: 400,
    code: 'VALIDATION_ERROR',
    message: 'Thieu profile_id hoac name',
    stack: 'Error: at Object.<anonymous> (/secret/path/service.js:1:1)'
  });
  assert.ok(!JSON.stringify(res.out.body).includes('/secret/path'),
    'khong duoc leak stack trace (chua full path server) trong response');
});

test('sendError van giu nguyen hop dong cu', () => {
  const res = fakeRes();
  sendError(res, 400, 'VALIDATION_ERROR', 'Thieu param');
  assert.strictEqual(res.out.statusCode, 400);
  assert.deepStrictEqual(res.out.body.error, {
    code: 'VALIDATION_ERROR',
    message: 'Thieu param'
  });
});
