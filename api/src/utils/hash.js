const crypto = require('crypto');

function hashPw(password) {
  if (!password) return '';
  const salt = crypto.randomBytes(16).toString('hex');
  return `scrypt$${salt}$${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

function verifyPw(password, storedHash) {
  if (!password || !storedHash || !storedHash.startsWith('scrypt$')) return false;
  const parts = storedHash.split('$');
  if (parts.length !== 3) return false;
  const salt = parts[1];
  const expectedHash = parts[2];
  let derived;
  try {
    derived = crypto.scryptSync(password, salt, 64);
  } catch (e) {
    return false;
  }
  const expectedBuf = Buffer.from(expectedHash, 'hex');
  // timingSafeEqual ném exception nếu 2 buffer khác độ dài (hash hỏng) —
  // bọc lại để trả 401 thay vì 500.
  if (expectedBuf.length !== derived.length) return false;
  try {
    return crypto.timingSafeEqual(derived, expectedBuf);
  } catch (e) {
    return false;
  }
}

module.exports = {
  hashPw,
  verifyPw
};
