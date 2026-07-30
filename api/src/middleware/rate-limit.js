const { getClientIp } = require('../utils/validators');
const { sendError } = require('./error');

const rateLimitStore = new Map();

function createRateLimiter(name, maxHits, windowMs, errorMessage) {
  return (req, res, next) => {
    const ip = getClientIp(req);
    const now = Date.now();
    const key = `${ip}:${name}`;
    const record = rateLimitStore.get(key) || { count: 0, resetAt: now + windowMs };

    if (now > record.resetAt) {
      record.count = 0;
      record.resetAt = now + windowMs;
    }

    record.count += 1;
    rateLimitStore.set(key, record);

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
