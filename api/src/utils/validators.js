const crypto = require('crypto');

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  // Fallback cho Node rất củ (không có randomUUID): dùng CSPRNG, không
  // dùng Math.random (PRNG yếu, id đoán được).
  const b = crypto.randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function getClientIp(req) {
  // Chỉ tin X-Forwarded-For khi express biết proxy đáng tin (app.set('trust proxy', N)
  // ở index.js). Không tin trực tiếp header thô — bypass rate limit chỉ bằng
  // đổi header. req.ip do express resolve qua trusted proxy chain.
  return req.ip || req.socket?.remoteAddress || '127.0.0.1';
}

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limitVal = parseInt(query.limit) || parseInt(query.per_page) || parseInt(query.perPage) || 20;
  const perPage = Math.min(100, Math.max(1, limitVal));
  const skip = (page - 1) * perPage;
  return { page, perPage, limit: perPage, per_page: perPage, skip };
}

function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

module.exports = {
  uuid,
  getClientIp,
  parsePagination,
  isValidEmail
};
