const { verifyAdminJwt } = require('../utils/jwt');
const { sendError } = require('./error');

function adminAuth(req, res, next) {
  let token = null;

  // Check Cookie first (HttpOnly cookie clogin_admin_token)
  if (req.cookies && req.cookies.clogin_admin_token) {
    token = req.cookies.clogin_admin_token;
  } else if (req.headers.cookie) {
    // Manual cookie parse fallback
    const cookies = req.headers.cookie.split(';').reduce((acc, c) => {
      const [k, v] = c.trim().split('=');
      acc[k] = v;
      return acc;
    }, {});
    token = cookies.clogin_admin_token || cookies.clogin_admin_session;
  }

  // Fallback to Bearer token header
  if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.slice(7);
  }

  if (!token) {
    return sendError(res, 401, 'FORBIDDEN', 'Chưa đăng nhập quản trị');
  }

  const result = verifyAdminJwt(token);
  if (!result || !result.valid) {
    return sendError(res, 401, 'FORBIDDEN', 'Phiên đăng nhập quản trị không hợp lệ hoặc đã hết hạn');
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
