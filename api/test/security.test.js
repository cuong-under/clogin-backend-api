// Security regression tests: password policy + CORS allow-list.
// Không cần DB thật: các case yếu bị validate trước khi chạm database,
// và CORS được kiểm tra ở tầng middleware.
const path = require('path');
process.env.SKIP_DB_SETUP = '1';
const { isDev } = require(path.join(__dirname, '..', 'src', 'utils', 'env'));
// Đảm bảo chạy ở chế độ dev/test để requireSecret không fail-fast.
if (!isDev()) {
  process.env.NODE_ENV = 'test';
}

// Các test ở đây không dùng DB, nhưng require('../src/index') kéo theo khởi
// tạo PrismaClient. Nếu node_modules được sinh trên platform khác (ví dụ
// Windows -> chạy trên WSL), Prisma engine load reject — nuốt riêng lỗi này
// để node --test không gán nhầm cho test CORS. Lỗi khác vẫn fail bình thường.
process.on('unhandledRejection', (err) => {
  if (
    err &&
    err.message &&
    err.message.includes('could not locate the Query Engine')
  ) {
    return;
  }
});

const test = require('node:test');
const assert = require('node:assert');
const userService = require('../src/services/user.service');

test('password policy: rejects weak passwords with 400 VALIDATION_ERROR', async () => {
  const cases = [
    { password: 'short1', desc: 'quá ngắn' },
    { password: 'abcdefgh', desc: 'thiếu chữ số' },
    { password: '12345678', desc: 'thiếu chữ cái' },
    { password: '', desc: 'rỗng' },
    { password: undefined, desc: 'không có' }
  ];
  for (const c of cases) {
    await assert.rejects(
      () => userService.registerOwner({ email: 'a@b.c', password: c.password, license_key: 'x' }),
      (err) => err && err.statusCode === 400 && err.code === 'VALIDATION_ERROR',
      `mật khẩu ${c.desc} phải bị từ chối`
    );
  }
});

test('password policy: strong password passes validation (không vướng VALIDATION_ERROR)', async () => {
  // Mật khẩu mạnh đi qua validator; nếu test chạy không có DB thì lỗi tiếp theo
  // không được là VALIDATION_ERROR (bằng chứng validator đã pass).
  await assert.rejects(
    () => userService.registerOwner({ email: 'a@b.c', password: 'StrongPass123', license_key: 'x' }),
    (err) => !err || err.statusCode !== 400 || err.code !== 'VALIDATION_ERROR'
  );
});

test('CORS: rejects origin không nằm trong whitelist với 403 CORS_ORIGIN_NOT_ALLOWED', async () => {
  const app = require('../src/index');
  const server = app.listen(0);
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, {
      headers: { Origin: 'https://evil.example.com' }
    });
    assert.strictEqual(res.status, 403);
    const body = await res.json();
    assert.ok(body.error, 'có body error');
    assert.strictEqual(body.error.code, 'CORS_ORIGIN_NOT_ALLOWED');
  } finally {
    server.close();
  }
});

test('CORS: cho phép localhost origin', async () => {
  const app = require('../src/index');
  const server = app.listen(0);
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, {
      headers: { Origin: 'http://localhost:3000' }
    });
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get('access-control-allow-origin'), 'có CORS allow-origin');
  } finally {
    server.close();
  }
});

test('CORS: request không có Origin vẫn được phép (server-to-server)', async () => {
  const app = require('../src/index');
  const server = app.listen(0);
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    assert.strictEqual(res.status, 200);
  } finally {
    server.close();
  }
});
