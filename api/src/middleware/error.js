function sendError(res, statusCode, code, message, details = {}) {
  res.status(statusCode).json({
    error: { code, message, ...details }
  });
}

function errorHandler(err, req, res, next) {
  console.error('[Error Handler]:', err);
  if (res.headersSent) {
    return next(err);
  }
  if (err && err.message === 'Origin not allowed by CORS') {
    return sendError(res, 403, 'CORS_ORIGIN_NOT_ALLOWED', 'Origin không nằm trong danh sách cho phép');
  }
  return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Đã xảy ra lỗi máy chủ');
}

module.exports = {
  sendError,
  errorHandler
};
