const express = require('express');
const router = express.Router();
const licenseService = require('../services/license.service');
const { sendError } = require('../middleware/error');
const { getClientIp } = require('../utils/validators');
const { verifyUserJwt } = require('../utils/jwt');
const { createRateLimiter } = require('../middleware/rate-limit');

// Endpoint license không cần auth (thiết bị chưa kích hoạt phải gọi được) →
// bắt buộc rate limit chặt để chống brute-force / dò key.
const activateLimiter = createRateLimiter('license-activate', 5, 15 * 60 * 1000,
  'Quá nhiều lần kích hoạt. Vui lòng thử lại sau 15 phút.');
const verifyLimiter = createRateLimiter('license-verify', 20, 15 * 60 * 1000,
  'Quá nhiều lần kiểm tra license. Vui lòng thử lại sau.');

/**
 * owner_id CHỈ lấy từ JWT đã verify. KHÔNG bao giờ đọc từ body/query —
 * trước đây body.owner_id cho phép attacker gán license của mình vào
 * tài khoản người khác.
 * Trả về null nếu không có token hợp lệ (thiết bị chưa đăng nhập vẫn
 * kích hoạt được license theo HWID).
 */
function ownerFromJwt(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const result = verifyUserJwt(authHeader.slice(7));
  if (!result || !result.valid) return null;
  const payload = result.payload || {};
  return payload.owner_id || payload.sub || null;
}

router.post('/activate', activateLimiter, async (req, res, next) => {
  try {
    const queryKey = req.query.license_key || req.query.key;
    const queryHwid = req.query.hwid;
    const queryDevice = req.query.device_name;

    const key = req.body.license_key || req.body.key || queryKey;
    const hwid = req.body.hwid || queryHwid;
    const device_name = req.body.device_name || queryDevice || 'Desktop PC';
    const ip_address = getClientIp(req);

    const owner_id = ownerFromJwt(req);
    // email bị bỏ hoàn toàn: liên kết owner↔license chỉ được làm khi đã
    // xác thực JWT hoặc ở luồng /v1/auth/register.
    const email = undefined;

    const result = await licenseService.activateLicense({ key, hwid, device_name, ip_address, owner_id, email });
    return res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.statusCode, err.code, err.message);
    }
    next(err);
  }
});

router.post('/verify', verifyLimiter, async (req, res, next) => {
  try {
    const queryKey = req.query.license_key || req.query.key;
    const queryHwid = req.query.hwid;

    const key = req.body.license_key || req.body.key || queryKey;
    const hwid = req.body.hwid || queryHwid;

    const result = await licenseService.verifyLicense({ key, hwid });
    return res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.statusCode, err.code, err.message);
    }
    next(err);
  }
});

module.exports = router;
