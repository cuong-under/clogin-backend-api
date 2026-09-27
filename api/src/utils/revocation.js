// Thu hồi JWT theo jti (in-memory).
//
// PHẠM VI ÁP DỤNG: API đang chạy 1 process (container Docker đơn lẻ) nên
// bộ nhớ RAM là đủ. Nếu sau này scale nhiều instance/pod, chuyển Map này
// sang Redis/DB (keyspace giữ nguyên: jti -> exp).
//
// Chỉ thu hồi token còn hạn; job dọn dẹp mỗi phút xoá entry đã hết hạn để
// Map không phình.

const revoked = new Map(); // jti -> exp (unix seconds)

function cleanup() {
  const now = Math.floor(Date.now() / 1000);
  for (const [jti, exp] of revoked.entries()) {
    if (exp && exp < now) revoked.delete(jti);
  }
}

setInterval(cleanup, 60000).unref?.();

function revokeJti(jti, exp) {
  if (!jti) return;
  revoked.set(jti, exp || Math.floor(Date.now() / 1000) + 3600);
}

function isRevoked(jti) {
  if (!jti) return false;
  if (!revoked.has(jti)) return false;
  const exp = revoked.get(jti);
  if (exp && exp < Math.floor(Date.now() / 1000)) {
    revoked.delete(jti);
    return false;
  }
  return true;
}

function revokeFromPayload(payload) {
  if (payload && payload.jti) revokeJti(payload.jti, payload.exp);
}

module.exports = { revokeJti, isRevoked, revokeFromPayload, cleanup };
