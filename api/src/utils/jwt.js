const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'clogin-jwt-secret-2026';
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'clogin-admin-jwt-secret-2026';

const USER_TTL = 3600; // 1 hour
const ADMIN_TTL = 86400; // 24 hours

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function b64urld(str) {
  return Buffer.from(str, 'base64url').toString('utf8');
}

function signJwt(payload, secret, ttl) {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { ...payload, iat: now, exp: now + ttl };
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(fullPayload));
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verifyJwt(token, secret) {
  try {
    if (!token || typeof token !== 'string') return { valid: false, reason: 'INVALID' };
    const parts = token.split('.');
    if (parts.length !== 3) return { valid: false, reason: 'INVALID' };
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(`${parts[0]}.${parts[1]}`)
      .digest('base64url');
    if (parts[2] !== expectedSig) return { valid: false, reason: 'INVALID' };
    const payload = JSON.parse(b64urld(parts[1]));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return { valid: false, reason: 'EXPIRED' };
    }
    return { valid: true, payload };
  } catch (e) {
    return { valid: false, reason: 'INVALID' };
  }
}

function signUserJwt(payload) {
  return signJwt(payload, JWT_SECRET, USER_TTL);
}

function verifyUserJwt(token) {
  return verifyJwt(token, JWT_SECRET);
}

function signAdminJwt(payload) {
  return signJwt(payload, ADMIN_JWT_SECRET, ADMIN_TTL);
}

function verifyAdminJwt(token) {
  return verifyJwt(token, ADMIN_JWT_SECRET);
}

module.exports = {
  signUserJwt,
  verifyUserJwt,
  signAdminJwt,
  verifyAdminJwt,
  JWT_SECRET,
  ADMIN_JWT_SECRET
};
