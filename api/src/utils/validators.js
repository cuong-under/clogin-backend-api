const crypto = require('crypto');

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    '127.0.0.1'
  );
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
