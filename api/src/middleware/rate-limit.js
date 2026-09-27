const { getClientIp } = require('../utils/validators');
const { sendError } = require('./error');

const rateLimitStore = new Map();
// Chặn phình bộ nhớ: attacker xoay IP/spoof key có thể tạo hàng triệu entry.
// Vượt ngưỡng → xoá entry cũ nhất (insertion order của Map).
const MAX_ENTRIES = Number(process.env.RATE_LIMIT_MAX_KEYS) || 10000;

// keyFn(req) trả về định danh của yêu cầu (mặc định: IP client).
// Dùng keyFn cho endpoint đã xác thực để limiting theo user thay vì IP.
function createRateLimiter(name, maxHits, windowMs, errorMessage, keyFn) {
  return (req, res, next) => {
    const identity = keyFn ? keyFn(req) : getClientIp(req);
    const now = Date.now();
    const key = `${identity}:${name}`;
    const record = rateLimitStore.get(key) || { count: 0, resetAt: now + windowMs };

    if (now > record.resetAt) {
      record.count = 0;
      record.resetAt = now + windowMs;
    }

    record.count += 1;

    // Refresh insertion order cho key vừa dùng (gần đúng LRU).
    rateLimitStore.delete(key);
    rateLimitStore.set(key, record);

    if (rateLimitStore.size > MAX_ENTRIES) {
      const oldestKey = rateLimitStore.keys().next().value;
      rateLimitStore.delete(oldestKey);
    }

    if (record.count > maxHits) {
      return sendError(res, 429, 'RATE_LIMITED', errorMessage || 'Quá nhiều yêu cầu, vui lòng thử lại sau');
    }

    next();
  };
}

// Memory cleanup every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitStore.entries()) {
    if (now > record.resetAt) {
      rateLimitStore.delete(key);
    }
  }
}, 600000);

module.exports = {
  createRateLimiter
};
