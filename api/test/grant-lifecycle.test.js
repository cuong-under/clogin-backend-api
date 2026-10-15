const test = require('node:test');
const assert = require('node:assert/strict');
process.env.WORKSPACE_AI_GRANT_SECRET = 'test-grant-secret-1234567890123456';
const { createGrant, verifyGrant } = require('../src/utils/grant');

test('Grant lifecycle: verify-grant -> tool-started -> tool-finished', () => {
  const grant = createGrant({
    actorId: 'user-1',
    workspaceId: 'ws-1',
    toolName: 'rpa.create_sequence',
    capability: 'browser.write',
    actionClass: 'write',
    parameterDigest: 'abc',
    policyRevision: 1
  });

  // 1. Bước verify-grant: kiểm tra tính hợp lệ, KHÔNG tiêu thụ
  const v1 = verifyGrant(grant.token);
  assert.equal(v1.valid, true, 'Bước verify-grant phải hợp lệ');

  // 2. Bước tool-started: kiểm tra để bắt đầu thực thi, KHÔNG tiêu thụ
  const v2 = verifyGrant(grant.token, { consume: false });
  assert.equal(v2.valid, true, 'Bước tool-started phải hợp lệ');

  // 3. Bước tool-finished: kết thúc tool, TIÊU THỤ (consume) grant
  const v3 = verifyGrant(grant.token, { consume: true });
  assert.equal(v3.valid, true, 'Bước tool-finished phải hợp lệ');

  // 4. Bước sau đó: Grant đã bị dùng, cố tình dùng lại phải bị từ chối
  const v4 = verifyGrant(grant.token);
  assert.equal(v4.valid, false, 'Dùng lại grant phải bị từ chối');
  assert.equal(v4.reason, 'GRANT_ALREADY_USED');
});
