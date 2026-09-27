const { verifyAdminJwt } = require('../utils/jwt');
const { sendError } = require('./error');
const { isRevoked } = require('../utils/revocation');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Origin được phép gọi API quản trị bằng cookie session. Cấu hình qua env
// ADMIN_ALLOWED_ORIGINS (phân tách bằng dấu phẩy) khi đổi domain.
const ALLOWED_ADMIN_ORIGINS = (
  process.env.ADMIN_ALLOWED_ORIGINS ||
  'https://clogin.nghemmo.com,https://api-clogin.nghemmo.com,http://localhost:3000'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function adminAuth(req, res, next) {
  let token = null;
  let source = null;

  // Chỉ đọc cookie đã được cookie-parser parse. Trước đây có thêm nhánh parse
  // tay req.headers.cookie — dư thừa và dễ lệch nếu cookie-parser đổi hành vi.
  if (req.cookies && (req.cookies.clogin_admin_token || req.cookies.clogin_admin_session)) {
    token = req.cookies.clogin_admin_token || req.cookies.clogin_admin_session;
    source = 'cookie';
  } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.slice(7);
    source = 'bearer';
  }

  if (!token) {
    return sendError(res, 401, 'FORBIDDEN', 'Chưa đăng nhập quản trị');
  }

  // CSRF: dùng cookie session cho thao tác ghi dữ liệu thì phải có Origin
  // nằm trong allowlist. Browser thật gửi Origin cho mọi request từ portal;
  // site lạ (hoặc form ẩn) không giả được. Bearer token không cần vì không
  // phải credential "ambient".
  if (source === 'cookie' && !SAFE_METHODS.has(req.method)) {
    const origin = req.headers.origin;
    if (!origin || !ALLOWED_ADMIN_ORIGINS.includes(origin)) {
      return sendError(res, 403, 'CSRF_ORIGIN_REJECTED', 'Yêu cầu bị chặn do Origin không hợp lệ');
    }
  }

  const result = verifyAdminJwt(token);
  if (!result || !result.valid) {
    return sendError(res, 401, 'FORBIDDEN', 'Phiên đăng nhập quản trị không hợp lệ hoặc đã hết hạn');
  }
  if (isRevoked(result.payload?.jti)) {
    return sendError(res, 401, 'FORBIDDEN', 'Phiên quản trị đã bị thu hồi, vui lòng đăng nhập lại');
  }

  req.admin = result.payload; // { sub, email, role }
  next();
}

function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.admin) {
      return sendError(res, 401, 'FORBIDDEN', 'Chưa đăng nhập quản trị');
    }

    const { role } = req.admin;

    // viewer is read-only everywhere
    if (role === 'viewer' && req.method !== 'GET') {
      return sendError(res, 403, 'ROLE_PERMISSION_DENIED', 'Tài khoản Viewer chỉ có quyền xem (Read-only)');
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(role) && role !== 'super_admin') {
      return sendError(res, 403, 'ROLE_PERMISSION_DENIED', 'Bạn không có quyền thực hiện chức năng này');
    }

    next();
  };
}

module.exports = {
  adminAuth,
  requireRole
};
