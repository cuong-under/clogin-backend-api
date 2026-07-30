function sendError(res, statusCode, code, message) {
  res.status(statusCode).json({
    error: { code, message }
  });
}

function errorHandler(err, req, res, next) {
  console.error('[Error Handler]:', err);
  if (res.headersSent) {
    return next(err);
  }
  return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Đã xảy ra lỗi máy chủ');
}

module.exports = {
  sendError,
  errorHandler
};
