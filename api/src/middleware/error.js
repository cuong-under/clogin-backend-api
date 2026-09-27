// Helper chuẩn hoá response lỗi cho service layer.
//
// `sendError(res, status, code, message)` chỉ gửi đúng code + message —
// service trả thêm field ngữ cảnh (canonical_revision, workspaces,
// tasks...) thì bị rơi mất. `sendServiceError` gửi helper này TỰ ĐỘNG
// kèm các field ngữ cảnh, nên service không cần nhớ liệt kê từng route.

// Allowlist field ngữ cảnh AN TOÀN được trả về client. Bất kỳ field khác
// trên error object (stack, sql, query, path nội bộ...) bị LOẠI — error
// runtime của JS có `.stack`, error DB có thể có `.sql`/`.query`, copy
// mù sẽ rò cấu trúc server ra response.
const SAFE_CONTEXT_FIELDS = [
  'canonical_revision', // profile sync 409 → client adopt revision + retry
  'sync_revision', // revision server vừa mint sau sync thành công
  'workspaces', // danh sách workspace chặn thao tác (admin/workspace route)
  'tasks', // danh sách task chặn xoá workspace
  'assignees' // user còn được gán task chặn xoá
];

function sendError(res, statusCode, code, message, details = {}) {
  res.status(statusCode).json({
    error: { code, message, ...details }
  });
}

function sendServiceError(res, err) {
  if (!err || !err.statusCode) {
    // Lỗi KHÔNG qua service layer (bug thật, exception rơi vào catch chung)
    // → 500 trung tính, không tin bất kỳ field nào trên err.
    return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Đã xảy ra lỗi máy chủ');
  }
  const details = {};
  for (const f of SAFE_CONTEXT_FIELDS) {
    if (err[f] !== undefined) details[f] = err[f];
  }
  sendError(res, err.statusCode, err.code || 'INTERNAL_SERVER_ERROR', err.message, details);
}

function errorHandler(err, req, res, next) {
  // Chỉ log message + code. Stack trace chỉ khi dev — tránh rò cấu trúc DB,
  // query, email vào log tập trung.
  const { isDev } = require('../utils/env');
  if (isDev()) {
    console.error('[Error Handler]:', err);
  } else {
    console.error('[Error Handler]:', err && err.message ? err.message : String(err));
  }
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
  sendServiceError,
  errorHandler
};
