const crypto = require('crypto');

const SECRET = process.env.WORKSPACE_AI_GRANT_SECRET || process.env.JWT_SECRET || 'clogin-ai-grant-dev';
const TTL_MS = 120000; // 2 minutes short-lived grant

function sha256(obj) {
  return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function b64urld(str) {
  return Buffer.from(str, 'base64url').toString('utf8');
}

/**
 * One-time, short-lived tool grant bound to actor/workspace/tool/capability,
 * parameter digest and expiry. Signed server-side; never includes secrets or
 * provider credentials.
 */
function createGrant({ actorId, workspaceId, toolName, capability, actionClass, parameterDigest, policyRevision }) {
  const now = Date.now();
  const payload = {
    actorId,
    workspaceId,
    toolName,
    capability,
    actionClass,
    parameterDigest,
    policyRevision,
    iat: now,
    exp: now + TTL_MS
  };
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return { token: `${body}.${sig}`, expiresAt: now + TTL_MS };
}

function verifyGrant(token) {
  if (!token || typeof token !== 'string') return { valid: false, reason: 'INVALID' };
  const parts = token.split('.');
  // Tolerate both 2-part (body.sig, our default) and 3-part (body.payload.sig) tokens.
  if (parts.length !== 2 && parts.length !== 3) return { valid: false, reason: 'INVALID' };
  const body = parts[0];
  const sig = parts[parts.length - 1];
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  if (sig !== expected) return { valid: false, reason: 'INVALID' };
  let payload;
  try {
    payload = JSON.parse(b64urld(body));
  } catch (e) {
    return { valid: false, reason: 'INVALID' };
  }
  if (payload.exp && payload.exp < Date.now()) return { valid: false, reason: 'EXPIRED' };
  return { valid: true, payload };
}

module.exports = { createGrant, verifyGrant, sha256, TTL_MS };