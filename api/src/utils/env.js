// Secure env access. Production fail-fast khi thiếu secret — KHÔNG fallback
// hardcode trong production. Dev/test giữ fallback nhẹ để chạy local.

function getEnv(name) {
  const raw = process.env[name];
  return typeof raw === 'string' && raw.trim() !== '' ? raw : undefined;
}

function isDev() {
  const nodeEnv = process.env.NODE_ENV || 'development';
  return nodeEnv === 'development' || nodeEnv === 'test';
}

/**
 * Lấy secret từ env. Trong production (hoặc khi ALLOW_DEV_SECRET_FALLBACK != 1):
 * thiếu secret → throw lỗi rõ ràng (fail-fast, không chạy với secret mặc định).
 * Ngoài production: fallback về devFallback + cảnh báo console.
 */
function requireSecret(name, devFallback) {
  const value = getEnv(name);
  if (value) return value;

  if (isDev()) {
    if (devFallback) {
      console.warn(`[env] ${name} chưa được cấu hình — dùng fallback DEV (KHÔNG dùng cho production)`);
      return devFallback;
    }
    throw new Error(`${name} chưa được cấu hình (required cả trong dev/test)`);
  }

  throw new Error(
    `[env] ${name} bắt buộc phải được cấu hình trong production. ` +
    `Hãy đặt biến môi trường ${name} trước khi khởi động.`
  );
}

module.exports = { requireSecret, getEnv, isDev };
