require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

// Schema sync KHÔNG chạy ở runtime nữa. `prisma db push` đẩy schema thẳng lên
// DB production và có thể drop/reset cột; `execSync('npx ...')` còn tải binary
// từ network lúc khởi động (supply-chain risk). Dùng `prisma migrate deploy`
// trong bước release/CI thay thế.
if (process.env.DATABASE_URL && process.env.SKIP_DB_SETUP !== '1' && process.env.RUN_STARTUP_SEED === '1') {
  try {
    require('./migrate');
  } catch (err) {
    console.error('[DB Setup Error]', err.message);
  }
}

const authRoutes = require('./routes/auth');
const licenseRoutes = require('./routes/license');
const teamRoutes = require('./routes/team');
const profilesRoutes = require('./routes/profiles');
const workspacesRoutes = require('./routes/workspaces');
const appRoutes = require('./routes/app');
const engineRoutes = require('./routes/engine');
const adminRoutes = require('./routes/admin');
const { errorHandler } = require('./middleware/error');
const { blockedIpGuard } = require('./middleware/blocked-ip');

const app = express();
const PORT = process.env.PORT || 3000;

// Tin proxy đáng tin (1 hop: nginx/Cloudflare). Không set → req.ip lấy socket
// address → X-Forwarded-For giả mạo được, bypass rate limit theo IP.
app.set('trust proxy', 1);

// Security headers (HSTS, nosniff, frameguard, Referrer-Policy).
app.use(helmet({ contentSecurityPolicy: false }));

// CORS Whitelist — KHÔNG cho phép mọi port localhost:xxxx nữa (mọi trang
// LOCAL trên máy nạn nhân đều gọi được API). Chỉ allowlist port dev thật.
const allowedOrigins = ['tauri://localhost', 'http://localhost', 'https://api-clogin.nghemmo.com', 'https://clogin.nghemmo.com'];
const allowedLocalOrigins = ['http://127.0.0.1:1420', 'http://localhost:1420', 'http://127.0.0.1:3000'];
app.use(cors({
  origin: (origin, callback) => {
    // Không có Origin = client desktop (Tauri/curl) → cho qua, log lại.
    if (!origin || allowedOrigins.includes(origin) || allowedLocalOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Origin not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization', 'Cookie', 'X-Policy-Mode', 'X-Grant']
}));

// Body limit: 1mb mặc định; route /v1/profiles/cloud/* cần lớn hơn vì config
// profile (proxy, fingerprint, extensions) có thể vượt 1mb → 413 oan.
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use('/v1/profiles/cloud', express.json({ limit: '5mb' }));
app.use(cookieParser());

// Chặn IP trong blacklist (admin khóa) trước khi vào route.
app.use(blockedIpGuard);

// Health Check Endpoint
app.get('/health', (req, res) => {
  return res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API V1 Routes
app.use('/v1/auth', authRoutes);
app.use('/v1/license', licenseRoutes);
app.use('/v1/team', teamRoutes);
app.use('/v1/profiles', profilesRoutes);
app.use('/v1/workspaces', workspacesRoutes);
app.use('/v1/app', appRoutes);
app.use('/v1/engine', engineRoutes);
app.use('/v1/admin', adminRoutes);

// Global Error Handler
app.use(errorHandler);

// Only auto-listen when run directly so integration tests can create an
// ephemeral server on an ephemeral port.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Clogin Backend API listening on port ${PORT}`);
  });
}

module.exports = app;
