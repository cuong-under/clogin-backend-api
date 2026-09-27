const { verifyUserJwt } = require('../utils/jwt');
const { sendError } = require('./error');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { isRevoked } = require('../utils/revocation');

function authMw(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return sendError(res, 401, 'TOKEN_INVALID', 'Token không hợp lệ hoặc đã hết hạn');
  }
  const token = authHeader.slice(7);
  const authResult = verifyUserJwt(token);
  if (!authResult || !authResult.valid) {
    const code = authResult?.reason === 'EXPIRED' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID';
    return sendError(res, 401, code, 'Token không hợp lệ hoặc đã hết hạn');
  }
  // Token đã đăng xuất / bị thu hồi (jti) → từ chối dù chưa hết hạn.
  if (isRevoked(authResult.payload?.jti)) {
    return sendError(res, 401, 'TOKEN_REVOKED', 'Phiên đăng nhập đã bị thu hồi, vui lòng đăng nhập lại');
  }
  req.user = authResult.payload;
  next();
}

async function requireOwner(req, res, next) {
  if (!req.user || req.user.type !== 'owner') {
    return sendError(res, 403, 'FORBIDDEN', 'Chỉ owner mới có quyền thực hiện thao tác này');
  }
  try {
    const owner = await prisma.owner.findUnique({
      where: { id: req.user.sub }
    });
    if (!owner || !owner.active) {
      return sendError(res, 403, 'FORBIDDEN', 'Tài khoản owner không tồn tại hoặc đã bị khóa');
    }
    req.owner = owner;
    next();
  } catch (err) {
    return sendError(res, 500, 'DB_ERROR', 'Lỗi truy vấn cơ sở dữ liệu');
  }
}

module.exports = {
  authMw,
  requireOwner
};
