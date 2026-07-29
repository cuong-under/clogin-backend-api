const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;

// Path & Volume setup
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Migrate legacy files to /data/ if they exist
const LEGACY_FILES = ['licenses_db.json', 'owners_db.json', 'workers_db.json', 'audit_cloud_db.json', 'profiles_cloud_db.json'];
LEGACY_FILES.forEach(file => {
  const oldPath = path.join(__dirname, file);
  const newPath = path.join(DATA_DIR, file);
  if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) {
    try {
      fs.renameSync(oldPath, newPath);
      console.log(`Migrated ${file} to data/ directory`);
    } catch (e) {
      console.error(`Failed to migrate ${file}:`, e);
    }
  }
});

const DB_FILE = path.join(DATA_DIR, 'licenses_db.json');
const OWNERS_DB = path.join(DATA_DIR, 'owners_db.json');
const WORKERS_DB = path.join(DATA_DIR, 'workers_db.json');
const AUDIT_DB = path.join(DATA_DIR, 'audit_cloud_db.json');
const PROFILES_DB = path.join(DATA_DIR, 'profiles_cloud_db.json');

// Secrets & Security Config
const JWT_SECRET = process.env.JWT_SECRET || 'clogin-jwt-secret-2026';
if (!process.env.JWT_SECRET) {
  console.warn('WARNING: JWT_SECRET not set in env vars, using default development fallback!');
}

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'CloginAdmin2026!';
if (!process.env.ADMIN_PASSWORD) {
  console.warn('WARNING: ADMIN_PASSWORD not set in env vars, using default development fallback!');
}

const ADMIN_COOKIE_SECRET = crypto.createHmac('sha256', JWT_SECRET).update('clogin_admin_cookie_salt').digest('hex');
const JWT_TTL = 3600;

// Rate Limiter Memory Store
const rateLimitStore = new Map();
function checkRateLimit(ip, endpoint, maxHits, windowMs) {
  const now = Date.now();
  const key = `${ip}:${endpoint}`;
  const record = rateLimitStore.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + windowMs;
  }
  record.count += 1;
  rateLimitStore.set(key, record);
  return record.count <= maxHits;
}

// Cleanup rate limiter every 10 mins
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitStore.entries()) {
    if (now > record.resetAt) rateLimitStore.delete(key);
  }
}, 600000);

// Helper: Error Response Contract Standard
function sendError(res, statusCode, code, message) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.writeHead(statusCode);
  return res.end(JSON.stringify({
    error: { code, message }
  }));
}

// JSON DB Load/Save Helpers
function loadJsonDb(fp, def) {
  try { if (fs.existsSync(fp)) return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch (e) {}
  return def;
}
function saveJsonDb(fp, d) {
  try { fs.writeFileSync(fp, JSON.stringify(d, null, 2), 'utf8'); } catch (e) {}
}

let licensesMap = new Map();
function loadLicensesDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      licensesMap = new Map();
      for (const item of data) {
        licensesMap.set(item.key, {
          key: item.key,
          plan: item.plan,
          max_devices: item.max_devices,
          expires_at: item.expires_at,
          active_hwids: new Map(Object.entries(item.active_hwids || {})),
        });
      }
      return;
    }
  } catch (e) {}

  licensesMap = new Map();
  licensesMap.set('CLOGIN-PRO-2026-TEST', {
    key: 'CLOGIN-PRO-2026-TEST',
    plan: 'Pro Lifetime',
    max_devices: 5,
    expires_at: null,
    active_hwids: new Map(),
  });
  licensesMap.set('CLOGIN-TRIAL-1MONTH', {
    key: 'CLOGIN-TRIAL-1MONTH',
    plan: 'Trial 30 Days',
    max_devices: 1,
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    active_hwids: new Map(),
  });
  saveLicensesDb();
}

function saveLicensesDb() {
  try {
    const list = Array.from(licensesMap.values()).map((l) => ({
      key: l.key,
      plan: l.plan,
      max_devices: l.max_devices,
      expires_at: l.expires_at,
      active_hwids: Object.fromEntries(l.active_hwids),
    }));
    fs.writeFileSync(DB_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (e) {}
}

loadLicensesDb();

let ownersDb = loadJsonDb(OWNERS_DB, []);
let workersDb = loadJsonDb(WORKERS_DB, []);
let auditDb = loadJsonDb(AUDIT_DB, []);
let profilesDb = loadJsonDb(PROFILES_DB, []);

function saveOwners() { saveJsonDb(OWNERS_DB, ownersDb); }
function saveWorkers() { saveJsonDb(WORKERS_DB, workersDb); }
function saveAudit() {
  if (auditDb.length > 1000) {
    auditDb = auditDb.slice(-1000);
  }
  saveJsonDb(AUDIT_DB, auditDb);
}
function saveProfiles() { saveJsonDb(PROFILES_DB, profilesDb); }

function hashPw(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `scrypt$${salt}$${crypto.scryptSync(pw, salt, 64).toString('hex')}`;
}
function verifyPw(pw, s) {
  if (!s || !s.startsWith('scrypt$')) return false;
  const p = s.split('$');
  return p.length === 3 && crypto.scryptSync(pw, p[1], 64).toString('hex') === p[2];
}

function b64url(b) { return Buffer.from(b).toString('base64url'); }
function b64urld(s) { return Buffer.from(s, 'base64url').toString('utf8'); }

function signJwt(payload) {
  const now = Math.floor(Date.now() / 1000);
  payload = { ...payload, iat: now, exp: now + JWT_TTL };
  const h = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const p = b64url(JSON.stringify(payload));
  return `${h}.${p}.${crypto.createHmac('sha256', JWT_SECRET).update(`${h}.${p}`).digest('base64url')}`;
}

function verifyJwt(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return { valid: false, reason: 'INVALID' };
    const e = crypto.createHmac('sha256', JWT_SECRET).update(`${parts[0]}.${parts[1]}`).digest('base64url');
    if (parts[2] !== e) return { valid: false, reason: 'INVALID' };
    const pl = JSON.parse(b64urld(parts[1]));
    if (pl.exp && pl.exp < Math.floor(Date.now() / 1000)) {
      return { valid: false, reason: 'EXPIRED' };
    }
    return { valid: true, payload: pl };
  } catch (e) {
    return { valid: false, reason: 'INVALID' };
  }
}

function authMw(req) {
  const a = req.headers['authorization'];
  if (!a || !a.startsWith('Bearer ')) return null;
  return verifyJwt(a.slice(7));
}

function uuid() { return crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }); }

function requireOwner(authResult) {
  if (!authResult || !authResult.valid || authResult.payload.type !== 'owner') return null;
  return ownersDb.find(o => o.id === authResult.payload.sub);
}

function parseJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    const MAX_SIZE = 1024 * 1024; // 1MB limit
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_SIZE) {
        req.destroy();
        return reject(new Error('PAYLOAD_TOO_LARGE'));
      }
      body += chunk.toString();
    });
    req.on('end', () => {
      if (!body || !body.trim()) return resolve({});
      try { resolve(JSON.parse(body)); } catch (e) { resolve({}); }
    });
    req.on('error', (err) => reject(err));
  });
}

function getCookies(req) {
  const list = {};
  const rc = req.headers.cookie;
  if (rc) {
    rc.split(';').forEach((cookie) => {
      const parts = cookie.split('=');
      list[parts.shift().trim()] = decodeURI(parts.join('='));
    });
  }
  return list;
}

function isAdminAuthed(req) {
  const cookies = getCookies(req);
  return cookies['clogin_admin_session'] === ADMIN_COOKIE_SECRET;
}

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || '127.0.0.1';
}

const server = http.createServer(async (req, res) => {
  // CORS Security Whitelist
  const origin = req.headers.origin;
  const allowedOrigins = ['tauri://localhost', 'http://localhost', 'https://api-clogin.nghemmo.com'];
  if (origin && (allowedOrigins.includes(origin) || origin.startsWith('http://localhost:'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  let reqUrl;
  try {
    reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch (e) {
    reqUrl = { pathname: req.url.split('?')[0], searchParams: new URLSearchParams() };
  }
  const pathname = reqUrl.pathname;
  const ip = getClientIp(req);

  // Parse Body with Size Check
  let body = {};
  if (req.method === 'POST' || req.method === 'PUT') {
    try {
      body = await parseJson(req);
    } catch (err) {
      if (err.message === 'PAYLOAD_TOO_LARGE') {
        return sendError(res, 413, 'PAYLOAD_TOO_LARGE', 'Dung lượng request vượt quá giới hạn 1MB');
      }
      return sendError(res, 400, 'VALIDATION_ERROR', 'Request body không hợp lệ');
    }
  }

  // --- Health Endpoint ---
  if (pathname === '/health') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.writeHead(200);
    return res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
  }

  // --- Auth Endpoints ---
  if (req.method === 'POST' && pathname === '/v1/auth/register') {
    if (!checkRateLimit(ip, 'register', 3, 3600000)) { // 3 attempts per hour
      return sendError(res, 429, 'RATE_LIMITED', 'Quá nhiều lần thử đăng ký, vui lòng thử lại sau 1 giờ');
    }
    const { email, password, license_key } = body;
    if (!email || !password || !license_key) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Thiếu email, password hoặc license_key');
    }
    const lic = licensesMap.get(license_key);
    if (!lic) {
      return sendError(res, 404, 'LICENSE_INVALID', 'License Key không hợp lệ');
    }
    if (lic.expires_at && new Date(lic.expires_at) < new Date()) {
      return sendError(res, 400, 'LICENSE_EXPIRED', 'License Key đã hết hạn');
    }
    if (ownersDb.some(o => o.email === email)) {
      return sendError(res, 409, 'DUPLICATE_EMAIL', 'Email đã được đăng ký');
    }
    const owner = { id: uuid(), email, password_hash: hashPw(password), license_key, max_worker_slots: 3, created_at: new Date().toISOString() };
    ownersDb.push(owner); saveOwners();
    const token = signJwt({ sub: owner.id, type: 'owner', owner_id: owner.id });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.writeHead(200);
    return res.end(JSON.stringify({ owner_id: owner.id, token }));
  }

  if (req.method === 'POST' && pathname === '/v1/auth/login') {
    if (!checkRateLimit(ip, 'login', 10, 900000)) { // 10 attempts per 15 mins
      return sendError(res, 429, 'RATE_LIMITED', 'Quá nhiều lần đăng nhập thất bại. Vui lòng thử lại sau 15 phút');
    }
    const { email, password } = body;
    if (!email || !password) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Thiếu email hoặc password');
    }
    let user = ownersDb.find(o => o.email === email);
    let userType = 'owner';
    if (!user) { user = workersDb.find(w => w.email === email); userType = 'worker'; }
    if (!user || !verifyPw(password, user.password_hash)) {
      return sendError(res, 401, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng');
    }
    if (userType === 'worker' && !user.active) {
      return sendError(res, 403, 'FORBIDDEN', 'Tài khoản worker đã bị vô hiệu hóa');
    }
    const ownerId = userType === 'owner' ? user.id : user.owner_id;
    const token = signJwt({ sub: user.id, type: userType, owner_id: ownerId });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.writeHead(200);
    return res.end(JSON.stringify({ token, user_type: userType, user_id: user.id, owner_id: ownerId, email: user.email, name: user.name || '' }));
  }

  if (pathname === '/v1/auth/me') {
    const authRes = authMw(req);
    if (!authRes || !authRes.valid) {
      return sendError(res, 401, authRes?.reason === 'EXPIRED' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID', 'Token không hợp lệ hoặc đã hết hạn');
    }
    const payload = authRes.payload;
    if (payload.type === 'owner') {
      const owner = ownersDb.find(o => o.id === payload.sub);
      if (!owner) return sendError(res, 404, 'NOT_FOUND', 'Không tìm thấy tài khoản');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.writeHead(200);
      return res.end(JSON.stringify({ user_id: owner.id, user_type: 'owner', email: owner.email, name: '', owner_id: owner.id }));
    }
    const worker = workersDb.find(w => w.id === payload.sub);
    if (!worker) return sendError(res, 404, 'NOT_FOUND', 'Không tìm thấy tài khoản');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.writeHead(200);
    return res.end(JSON.stringify({ user_id: worker.id, user_type: 'worker', email: worker.email, name: worker.name || '', owner_id: worker.owner_id }));
  }

  if (req.method === 'POST' && pathname === '/v1/auth/refresh') {
    const authRes = authMw(req);
    if (!authRes || !authRes.valid) {
      return sendError(res, 401, authRes?.reason === 'EXPIRED' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID', 'Token không hợp lệ hoặc đã hết hạn');
    }
    const payload = authRes.payload;
    const token = signJwt({ sub: payload.sub, type: payload.type, owner_id: payload.owner_id });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.writeHead(200);
    return res.end(JSON.stringify({ token }));
  }

  // --- Team Management ---
  if (req.method === 'GET' && pathname === '/v1/team/workers') {
    const owner = requireOwner(authMw(req));
    if (!owner) return sendError(res, 403, 'FORBIDDEN', 'Chỉ owner mới có quyền thực hiện thao tác này');
    const list = workersDb.filter(w => w.owner_id === owner.id).map(w => ({ id: w.id, email: w.email, name: w.name, active: w.active, created_at: w.created_at }));
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.writeHead(200);
    return res.end(JSON.stringify({ workers: list }));
  }

  if (req.method === 'POST' && pathname === '/v1/team/workers') {
    const owner = requireOwner(authMw(req));
    if (!owner) return sendError(res, 403, 'FORBIDDEN', 'Chỉ owner mới có quyền thực hiện thao tác này');
    const { email, password, name } = body;
    if (!email || !password) return sendError(res, 400, 'VALIDATION_ERROR', 'Thiếu email hoặc password');
    if (workersDb.some(w => w.owner_id === owner.id && w.email === email)) {
      return sendError(res, 409, 'DUPLICATE_EMAIL', 'Email worker đã tồn tại');
    }
    const activeCount = workersDb.filter(w => w.owner_id === owner.id && w.active).length;
    if (activeCount >= owner.max_worker_slots) {
      return sendError(res, 400, 'WORKER_LIMIT', `Đã đạt giới hạn ${owner.max_worker_slots} worker slots`);
    }
    const worker = { id: uuid(), owner_id: owner.id, email, password_hash: hashPw(password), name: name || '', active: true, hwid: null, created_at: new Date().toISOString() };
    workersDb.push(worker); saveWorkers();
    auditDb.push({ id: uuid(), owner_id: owner.id, user_id: owner.id, user_type: 'owner', user_name: owner.email, action: 'CREATE_WORKER', target: email, timestamp: Date.now() }); saveAudit();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.writeHead(200);
    return res.end(JSON.stringify({ worker_id: worker.id, email: worker.email, name: worker.name }));
  }

  if (req.method === 'PUT' && pathname.startsWith('/v1/team/workers/')) {
    const owner = requireOwner(authMw(req));
    if (!owner) return sendError(res, 403, 'FORBIDDEN', 'Chỉ owner mới có quyền thực hiện thao tác này');
    const workerId = pathname.split('/').pop();
    const worker = workersDb.find(w => w.id === workerId && w.owner_id === owner.id);
    if (!worker) return sendError(res, 404, 'NOT_FOUND', 'Không tìm thấy worker');
    if (body.name !== undefined) worker.name = body.name;
    if (body.password) worker.password_hash = hashPw(body.password);
    if (body.active !== undefined) worker.active = body.active;
    saveWorkers();
    auditDb.push({ id: uuid(), owner_id: owner.id, user_id: owner.id, user_type: 'owner', user_name: owner.email, action: 'UPDATE_WORKER', target: worker.email, timestamp: Date.now() }); saveAudit();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.writeHead(200);
    return res.end(JSON.stringify({ success: true }));
  }

  if (req.method === 'DELETE' && pathname.startsWith('/v1/team/workers/')) {
    const owner = requireOwner(authMw(req));
    if (!owner) return sendError(res, 403, 'FORBIDDEN', 'Chỉ owner mới có quyền thực hiện thao tác này');
    const workerId = pathname.split('/').pop();
    const idx = workersDb.findIndex(w => w.id === workerId && w.owner_id === owner.id);
    if (idx === -1) return sendError(res, 404, 'NOT_FOUND', 'Không tìm thấy worker');
    const removed = workersDb.splice(idx, 1)[0]; saveWorkers();
    auditDb.push({ id: uuid(), owner_id: owner.id, user_id: owner.id, user_type: 'owner', user_name: owner.email, action: 'DELETE_WORKER', target: removed.email, timestamp: Date.now() }); saveAudit();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.writeHead(200);
    return res.end(JSON.stringify({ success: true }));
  }

  if (req.method === 'GET' && pathname === '/v1/team/audit') {
    const owner = requireOwner(authMw(req));
    if (!owner) return sendError(res, 403, 'FORBIDDEN', 'Chỉ owner mới có quyền thực hiện thao tác này');
    const logs = auditDb.filter(a => a.owner_id === owner.id).sort((a, b) => b.timestamp - a.timestamp).slice(0, 100);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.writeHead(200);
    return res.end(JSON.stringify({ audit: logs }));
  }

  // --- Profile Cloud Storage ---
  if (req.method === 'POST' && pathname === '/v1/profiles/cloud/sync') {
    const owner = requireOwner(authMw(req));
    if (!owner) return sendError(res, 403, 'FORBIDDEN', 'Chỉ owner mới có quyền thực hiện thao tác này');
    const { profile_id, name, folder, config, assigned_worker_ids } = body;
    if (!profile_id || !name) return sendError(res, 400, 'VALIDATION_ERROR', 'Thiếu profile_id hoặc name');
    const existing = profilesDb.find(p => p.id === profile_id && p.owner_id === owner.id);
    if (existing) {
      existing.name = name;
      existing.folder = folder || existing.folder;
      if (config) existing.config = config;
      if (assigned_worker_ids) existing.assigned_worker_ids = assigned_worker_ids;
      existing.updated_at = new Date().toISOString();
    } else {
      profilesDb.push({ id: profile_id, owner_id: owner.id, name, folder: folder || '', config: config || {}, assigned_worker_ids: assigned_worker_ids || [], cookies: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    }
    saveProfiles();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.writeHead(200);
    return res.end(JSON.stringify({ success: true }));
  }

  if (req.method === 'GET' && pathname === '/v1/profiles/cloud') {
    const authRes = authMw(req);
    if (!authRes || !authRes.valid) return sendError(res, 401, authRes?.reason === 'EXPIRED' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID', 'Token không hợp lệ hoặc đã hết hạn');
    const payload = authRes.payload;
    let list;
    if (payload.type === 'owner') {
      list = profilesDb.filter(p => p.owner_id === payload.sub);
    } else {
      list = profilesDb.filter(p => p.assigned_worker_ids && p.assigned_worker_ids.includes(payload.sub));
    }
    list = list.map(p => ({ id: p.id, name: p.name, folder: p.folder, assigned_worker_ids: p.assigned_worker_ids, has_cookies: !!p.cookies, created_at: p.created_at, updated_at: p.updated_at }));
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.writeHead(200);
    return res.end(JSON.stringify({ profiles: list }));
  }

  if (req.method === 'GET' && pathname.startsWith('/v1/profiles/cloud/') && pathname.endsWith('/config')) {
    const authRes = authMw(req);
    if (!authRes || !authRes.valid) return sendError(res, 401, authRes?.reason === 'EXPIRED' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID', 'Token không hợp lệ hoặc đã hết hạn');
    const payload = authRes.payload;
    const parts = pathname.split('/');
    const profileId = parts[4];
    const profile = profilesDb.find(p => p.id === profileId);
    if (!profile) return sendError(res, 404, 'NOT_FOUND', 'Không tìm thấy profile');
    if (payload.type === 'owner' && profile.owner_id !== payload.sub) return sendError(res, 403, 'FORBIDDEN', 'Không phải profile thuộc quyền sở hữu của bạn');
    if (payload.type === 'worker' && (!profile.assigned_worker_ids || !profile.assigned_worker_ids.includes(payload.sub))) return sendError(res, 403, 'FORBIDDEN', 'Bạn chưa được gán quyền truy cập profile này');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.writeHead(200);
    return res.end(JSON.stringify({ id: profile.id, name: profile.name, folder: profile.folder, config: profile.config, assigned_worker_ids: profile.assigned_worker_ids }));
  }

  if (req.method === 'DELETE' && pathname.startsWith('/v1/profiles/cloud/') && !pathname.includes('/config') && !pathname.includes('/cookies') && !pathname.includes('/assign')) {
    const owner = requireOwner(authMw(req));
    if (!owner) return sendError(res, 403, 'FORBIDDEN', 'Chỉ owner mới có quyền thực hiện thao tác này');
    const profileId = pathname.split('/').pop();
    const idx = profilesDb.findIndex(p => p.id === profileId && p.owner_id === owner.id);
    if (idx === -1) return sendError(res, 404, 'NOT_FOUND', 'Không tìm thấy profile');
    profilesDb.splice(idx, 1); saveProfiles();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.writeHead(200);
    return res.end(JSON.stringify({ success: true }));
  }

  if (req.method === 'PUT' && pathname.startsWith('/v1/profiles/cloud/') && pathname.endsWith('/assign')) {
    const owner = requireOwner(authMw(req));
    if (!owner) return sendError(res, 403, 'FORBIDDEN', 'Chỉ owner mới có quyền thực hiện thao tác này');
    const parts = pathname.split('/');
    const profileId = parts[4];
    const profile = profilesDb.find(p => p.id === profileId && p.owner_id === owner.id);
    if (!profile) return sendError(res, 404, 'NOT_FOUND', 'Không tìm thấy profile');
    profile.assigned_worker_ids = body.worker_ids || [];
    profile.updated_at = new Date().toISOString();
    saveProfiles();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.writeHead(200);
    return res.end(JSON.stringify({ success: true }));
  }

  // --- Cookie Cloud Sync ---
  if (req.method === 'POST' && pathname.startsWith('/v1/profiles/cloud/') && pathname.endsWith('/cookies')) {
    const authRes = authMw(req);
    if (!authRes || !authRes.valid) return sendError(res, 401, authRes?.reason === 'EXPIRED' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID', 'Token không hợp lệ hoặc đã hết hạn');
    const payload = authRes.payload;
    const parts = pathname.split('/');
    const profileId = parts[4];
    const profile = profilesDb.find(p => p.id === profileId);
    if (!profile) return sendError(res, 404, 'NOT_FOUND', 'Không tìm thấy profile');
    if (payload.type === 'owner' && profile.owner_id !== payload.sub) return sendError(res, 403, 'FORBIDDEN', 'Không phải profile của bạn');
    if (payload.type === 'worker' && (!profile.assigned_worker_ids || !profile.assigned_worker_ids.includes(payload.sub))) return sendError(res, 403, 'FORBIDDEN', 'Bạn chưa được gán profile này');
    profile.cookies = body.cookies || [];
    profile.updated_at = new Date().toISOString();
    saveProfiles();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.writeHead(200);
    return res.end(JSON.stringify({ success: true, count: profile.cookies.length }));
  }

  if (req.method === 'GET' && pathname.startsWith('/v1/profiles/cloud/') && pathname.endsWith('/cookies')) {
    const authRes = authMw(req);
    if (!authRes || !authRes.valid) return sendError(res, 401, authRes?.reason === 'EXPIRED' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID', 'Token không hợp lệ hoặc đã hết hạn');
    const payload = authRes.payload;
    const parts = pathname.split('/');
    const profileId = parts[4];
    const profile = profilesDb.find(p => p.id === profileId);
    if (!profile) return sendError(res, 404, 'NOT_FOUND', 'Không tìm thấy profile');
    if (payload.type === 'owner' && profile.owner_id !== payload.sub) return sendError(res, 403, 'FORBIDDEN', 'Không phải profile của bạn');
    if (payload.type === 'worker' && (!profile.assigned_worker_ids || !profile.assigned_worker_ids.includes(payload.sub))) return sendError(res, 403, 'FORBIDDEN', 'Bạn chưa được gán profile này');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.writeHead(200);
    return res.end(JSON.stringify({ cookies: profile.cookies || [] }));
  }

  if (req.method === 'DELETE' && pathname.startsWith('/v1/profiles/cloud/') && pathname.endsWith('/cookies')) {
    const owner = requireOwner(authMw(req));
    if (!owner) return sendError(res, 403, 'FORBIDDEN', 'Chỉ owner mới có quyền thực hiện thao tác này');
    const parts = pathname.split('/');
    const profileId = parts[4];
    const profile = profilesDb.find(p => p.id === profileId && p.owner_id === owner.id);
    if (!profile) return sendError(res, 404, 'NOT_FOUND', 'Không tìm thấy profile');
    profile.cookies = null;
    profile.updated_at = new Date().toISOString();
    saveProfiles();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.writeHead(200);
    return res.end(JSON.stringify({ success: true }));
  }

  // --- License & App Endpoints ---
  if (pathname === '/v1/app/update') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.writeHead(200);
    return res.end(JSON.stringify({
      latest: "0.1.10",
      url: "https://github.com/cuong-under/CloginStudio/releases/tag/v0.1.10",
      changelog: "Phiên bản phát hành Clogin Studio v0.1.10"
    }));
  }

  if (req.method === 'POST' && pathname === '/v1/license/activate') {
    const queryKey = reqUrl.searchParams ? (reqUrl.searchParams.get('license_key') || reqUrl.searchParams.get('key')) : null;
    const queryHwid = reqUrl.searchParams ? reqUrl.searchParams.get('hwid') : null;
    const queryDevice = reqUrl.searchParams ? reqUrl.searchParams.get('device_name') : null;

    const license_key = body.license_key || body.key || queryKey;
    const hwid = body.hwid || queryHwid;
    const device_name = body.device_name || queryDevice;

    if (!license_key || !hwid) return sendError(res, 400, 'VALIDATION_ERROR', 'Thiếu thông tin license_key hoặc hwid');

    const lic = licensesMap.get(license_key);
    if (!lic) return sendError(res, 404, 'LICENSE_INVALID', 'License Key không hợp lệ');
    if (lic.expires_at && new Date(lic.expires_at) < new Date()) return sendError(res, 400, 'LICENSE_EXPIRED', 'License Key đã hết hạn');
    if (!lic.active_hwids.has(hwid) && lic.active_hwids.size >= lic.max_devices) {
      return sendError(res, 400, 'LICENSE_LIMIT', 'License đã đạt giới hạn thiết bị cho phép');
    }

    lic.active_hwids.set(hwid, { device_name: device_name || 'Desktop PC', activated_at: new Date().toISOString() });
    saveLicensesDb();

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.writeHead(200);
    return res.end(JSON.stringify({ key: lic.key, hwid, status: 'active', expires_at: lic.expires_at, max_devices: lic.max_devices, active_devices: lic.active_hwids.size }));
  }

  if (req.method === 'POST' && pathname === '/v1/license/verify') {
    const queryKey = reqUrl.searchParams ? (reqUrl.searchParams.get('license_key') || reqUrl.searchParams.get('key')) : null;
    const queryHwid = reqUrl.searchParams ? reqUrl.searchParams.get('hwid') : null;
    const license_key = body.license_key || body.key || queryKey;
    const hwid = body.hwid || queryHwid;

    const lic = licensesMap.get(license_key);
    if (!lic) return sendError(res, 404, 'LICENSE_INVALID', 'License Key không tồn tại');
    if (lic.expires_at && new Date(lic.expires_at) < new Date()) return sendError(res, 400, 'LICENSE_EXPIRED', 'License Key đã hết hạn');
    if (!lic.active_hwids.has(hwid)) return sendError(res, 400, 'LICENSE_INVALID', 'Thiết bị chưa được kích hoạt cho License này');

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.writeHead(200);
    return res.end(JSON.stringify({ key: lic.key, hwid, status: 'active', expires_at: lic.expires_at, max_devices: lic.max_devices, active_devices: lic.active_hwids.size }));
  }

  // --- Admin API Endpoints ---
  if (req.method === 'POST' && pathname === '/v1/admin/login') {
    if (body.password === ADMIN_PASSWORD) {
      res.setHeader('Set-Cookie', `clogin_admin_session=${ADMIN_COOKIE_SECRET}; Path=/; HttpOnly; Max-Age=86400`);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.writeHead(200);
      return res.end(JSON.stringify({ success: true }));
    }
    return sendError(res, 401, 'INVALID_CREDENTIALS', 'Mật khẩu quản trị không chính xác');
  }

  if (req.method === 'POST' && pathname === '/v1/admin/logout') {
    res.setHeader('Set-Cookie', 'clogin_admin_session=; Path=/; HttpOnly; Max-Age=0');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.writeHead(200);
    return res.end(JSON.stringify({ success: true }));
  }

  if (req.method === 'GET' && pathname === '/v1/admin/licenses') {
    if (!isAdminAuthed(req)) return sendError(res, 401, 'FORBIDDEN', 'Chưa đăng nhập quản trị');
    const list = Array.from(licensesMap.values()).map((l) => ({
      key: l.key, plan: l.plan, max_devices: l.max_devices, active_devices: l.active_hwids.size, expires_at: l.expires_at,
      devices: Array.from(l.active_hwids.entries()).map(([hwid, dev]) => ({ hwid, device_name: dev.device_name, activated_at: dev.activated_at })),
    }));
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.writeHead(200);
    return res.end(JSON.stringify({ licenses: list }));
  }

  if (req.method === 'POST' && pathname === '/v1/admin/licenses') {
    if (!isAdminAuthed(req)) return sendError(res, 401, 'FORBIDDEN', 'Chưa đăng nhập quản trị');
    const { plan, max_devices, days_valid } = body;
    const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
    const key = `CLOGIN-${(plan || 'STD').replaceAll(/\s+/g, '').toUpperCase()}-${randomStr}`;
    const expires_at = days_valid ? new Date(Date.now() + days_valid * 24 * 60 * 60 * 1000).toISOString() : null;
    const newLic = { key, plan: plan || 'Standard', max_devices: max_devices || 1, expires_at, active_hwids: new Map() };
    licensesMap.set(key, newLic);
    saveLicensesDb();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.writeHead(200);
    return res.end(JSON.stringify({ key, plan: newLic.plan, max_devices: newLic.max_devices, expires_at }));
  }

  if (req.method === 'POST' && pathname === '/v1/admin/licenses/action') {
    if (!isAdminAuthed(req)) return sendError(res, 401, 'FORBIDDEN', 'Chưa đăng nhập quản trị');
    const { action, key, hwid } = body;
    const lic = licensesMap.get(key);
    if (!lic) return sendError(res, 404, 'NOT_FOUND', 'Key không tồn tại');
    if (action === 'delete') { licensesMap.delete(key); saveLicensesDb(); res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.writeHead(200); return res.end(JSON.stringify({ success: true, message: 'Đã xóa Key' })); }
    if (action === 'reset_hwid' && hwid) { lic.active_hwids.delete(hwid); saveLicensesDb(); res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.writeHead(200); return res.end(JSON.stringify({ success: true, message: 'Đã giải phóng thiết bị khỏi Key' })); }
    if (action === 'reset_all_hwids') { lic.active_hwids.clear(); saveLicensesDb(); res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.writeHead(200); return res.end(JSON.stringify({ success: true, message: 'Đã reset toàn bộ thiết bị của Key' })); }
    return sendError(res, 400, 'VALIDATION_ERROR', 'Hành động không hợp lệ');
  }

  if (req.method === 'GET' && pathname === '/v1/admin/owners') {
    if (!isAdminAuthed(req)) return sendError(res, 401, 'FORBIDDEN', 'Chưa đăng nhập quản trị');
    const list = ownersDb.map(o => ({ id: o.id, email: o.email, license_key: o.license_key, max_worker_slots: o.max_worker_slots, worker_count: workersDb.filter(w => w.owner_id === o.id).length, created_at: o.created_at }));
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.writeHead(200);
    return res.end(JSON.stringify({ owners: list }));
  }

  if (req.method === 'GET' && pathname === '/v1/admin/profiles') {
    if (!isAdminAuthed(req)) return sendError(res, 401, 'FORBIDDEN', 'Chưa đăng nhập quản trị');
    const list = profilesDb.map(p => ({ id: p.id, owner_id: p.owner_id, name: p.name, has_cookies: !!p.cookies, assigned_count: (p.assigned_worker_ids || []).length, updated_at: p.updated_at }));
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.writeHead(200);
    return res.end(JSON.stringify({ profiles: list }));
  }

  if (req.method === 'GET' && pathname === '/v1/admin/audit') {
    if (!isAdminAuthed(req)) return sendError(res, 401, 'FORBIDDEN', 'Chưa đăng nhập quản trị');
    const logs = auditDb.sort((a, b) => b.timestamp - a.timestamp).slice(0, 200);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.writeHead(200);
    return res.end(JSON.stringify({ audit: logs }));
  }

  // --- Admin Web UI ---
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.writeHead(200);

  if (!isAdminAuthed(req)) {
    return res.end(`
<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Clogin Admin Đăng Nhập</title><style>
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0f172a;color:#f8fafc;margin:0;display:flex;align-items:center;justify-content:center;height:100vh}
.login-box{background:#1e293b;padding:32px;border-radius:12px;border:1px solid #334155;width:340px;box-shadow:0 10px 25px rgba(0,0,0,0.5)}
h2{color:#38bdf8;margin-top:0;font-size:20px;text-align:center;margin-bottom:20px}
input{width:100%;padding:10px 12px;border-radius:6px;border:1px solid #475569;background:#0f172a;color:#fff;margin-bottom:16px;box-sizing:border-box}
button{width:100%;padding:10px;border-radius:6px;border:none;background:#0284c7;color:#fff;font-weight:600;cursor:pointer}
button:hover{background:#0369a1}
.err{color:#f43f5e;font-size:13px;margin-bottom:12px;display:none;text-align:center}
</style></head><body>
<div class="login-box"><h2>Clogin Admin Login</h2><div id="err" class="err">Mật khẩu không đúng</div>
<form onsubmit="login(event)"><input type="password" id="pass" placeholder="Nhập mật khẩu quản trị..." required autofocus><button type="submit">Đăng Nhập</button></form></div>
<script>async function login(e){e.preventDefault();const p=document.getElementById('pass').value;const r=await fetch('/v1/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:p})});if(r.ok){location.reload()}else{document.getElementById('err').style.display='block'}}</script>
</body></html>`);
  }

  return res.end(`
<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Clogin Studio - Quản Trị</title><style>
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0f172a;color:#f8fafc;margin:0;padding:24px}
.header{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;border-bottom:1px solid #334155;padding-bottom:16px}
h1{color:#38bdf8;font-size:22px;margin:0}
.tabs{display:flex;gap:4px;margin-bottom:20px}
.tab{padding:10px 20px;border-radius:6px 6px 0 0;border:none;background:#1e293b;color:#94a3b8;cursor:pointer;font-weight:600}
.tab.active{background:#0284c7;color:#fff}
.tab-content{display:none}.tab-content.active{display:block}
.card{background:#1e293b;padding:20px;border-radius:8px;margin-bottom:20px;border:1px solid #334155}
table{width:100%;border-collapse:collapse;margin-top:10px;font-size:14px}
th,td{padding:12px;text-align:left;border-bottom:1px solid #334155}
th{background:#0f172a;color:#94a3b8}
input,button{padding:8px 12px;border-radius:6px;border:1px solid #475569;background:#0f172a;color:#fff;margin-right:8px}
button{background:#0284c7;font-weight:600;cursor:pointer;border:none}
button:hover{background:#0369a1}
.btn-danger{background:#e11d48}.btn-danger:hover{background:#be123c}
.tag{padding:3px 8px;border-radius:4px;font-size:12px;background:#0369a1}
.dev-item{background:#0f172a;padding:6px 10px;border-radius:4px;margin-bottom:4px;display:flex;justify-content:space-between;align-items:center;font-size:12px}
</style></head><body>
<div class="header"><h1>🛡️ Clogin Studio - Portal Quản Trị</h1><button class="btn-danger" onclick="logout()">Đăng Xuất</button></div>
<div class="tabs">
<button class="tab active" onclick="switchTab('licenses')">License Keys</button>
<button class="tab" onclick="switchTab('team')">Team</button>
<button class="tab" onclick="switchTab('profiles')">Cloud Profiles</button>
<button class="tab" onclick="switchTab('audit')">Audit Log</button>
</div>

<div id="tab-licenses" class="tab-content active">
<div class="card"><h3>Tạo License Key Mới</h3>
<form onsubmit="createKey(event)">
<input type="text" id="plan" placeholder="Tên gói" required>
<input type="number" id="max_devices" placeholder="Số thiết bị" value="1" min="1" required>
<input type="number" id="days_valid" placeholder="Số ngày hạn (trống = Vĩnh viễn)">
<button type="submit">+ Tạo License Key</button></form></div>
<div class="card"><div style="display:flex;justify-content:space-between;align-items:center"><h3>Danh Sách License Key</h3><button onclick="loadLicenses()">🔄 Tải lại</button></div>
<table><thead><tr><th>License Key</th><th>Gói</th><th>Thiết bị</th><th>Hạn dùng</th><th>Máy đã kích hoạt</th><th>Tác vụ</th></tr></thead><tbody id="licTable"></tbody></table></div>
</div>

<div id="tab-team" class="tab-content">
<div class="card"><h3>Owners & Workers</h3><button onclick="loadOwners()">🔄 Tải lại</button>
<table><thead><tr><th>Owner Email</th><th>License</th><th>Slots</th><th>Workers</th><th>Worker List</th><th>Ngày tạo</th></tr></thead><tbody id="ownerTable"></tbody></table></div>
</div>

<div id="tab-profiles" class="tab-content">
<div class="card"><h3>Cloud Profiles</h3><button onclick="loadProfiles()">🔄 Tải lại</button>
<table><thead><tr><th>Profile ID</th><th>Name</th><th>Owner ID</th><th>Assigned</th><th>Cookies</th><th>Cập nhật</th></tr></thead><tbody id="profileTable"></tbody></table></div>
</div>

<div id="tab-audit" class="tab-content">
<div class="card"><h3>Audit Log</h3><button onclick="loadAudit()">🔄 Tải lại</button>
<table><thead><tr><th>Thời gian</th><th>Owner</th><th>User</th><th>Hành động</th><th>Target</th></tr></thead><tbody id="auditTable"></tbody></table></div>
</div>

<script>
function switchTab(name){document.querySelectorAll('.tab-content').forEach(t=>t.classList.remove('active'));document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));document.getElementById('tab-'+name).classList.add('active');document.querySelector('.tab[onclick*="'+name+'"]').classList.add('active');if(name==='team')loadOwners();if(name==='profiles')loadProfiles();if(name==='audit')loadAudit()}
async function loadLicenses(){const r=await fetch('/v1/admin/licenses');if(r.status===401){location.reload();return}const d=await r.json();document.getElementById('licTable').innerHTML=d.licenses.map(l=>\`<tr><td><strong style="color:#38bdf8">\${l.key}</strong> <button style="padding:2px 6px;font-size:11px;margin-left:6px" onclick="navigator.clipboard.writeText('\${l.key}')">Copy</button></td><td><span class="tag">\${l.plan}</span></td><td>\${l.active_devices}/\${l.max_devices}</td><td>\${l.expires_at?new Date(l.expires_at).toLocaleDateString('vi-VN'):'Vĩnh viễn'}</td><td>\${l.devices.length?l.devices.map(d=>\`<div class="dev-item"><span>\${d.device_name} (\${d.hwid})</span><button class="btn-danger" style="padding:2px 6px;font-size:11px" onclick="resetHwid('\${l.key}','\${d.hwid}')">Gỡ</button></div>\`).join(''):'<span style="color:#64748b">Chưa có máy</span>'}</td><td>\${l.active_devices>0?\`<button style="padding:4px 8px;font-size:12px;margin-bottom:4px" onclick="resetAllHwids('\${l.key}')">Reset HWID</button><br>\`:''}<button class="btn-danger" style="padding:4px 8px;font-size:12px" onclick="deleteKey('\${l.key}')">Xóa</button></td></tr>\`).join('')}
async function createKey(e){e.preventDefault();await fetch('/v1/admin/licenses',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan:document.getElementById('plan').value,max_devices:parseInt(document.getElementById('max_devices').value),days_valid:parseInt(document.getElementById('days_valid').value)||null})});document.getElementById('plan').value='';loadLicenses()}
async function resetHwid(k,h){if(!confirm('Gỡ thiết bị này?'))return;await fetch('/v1/admin/licenses/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'reset_hwid',key:k,hwid:h})});loadLicenses()}
async function resetAllHwids(k){if(!confirm('Reset toàn bộ HWID?'))return;await fetch('/v1/admin/licenses/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'reset_all_hwids',key:k})});loadLicenses()}
async function deleteKey(k){if(!confirm('Xóa Key này?'))return;await fetch('/v1/admin/licenses/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'delete',key:k})});loadLicenses()}
async function loadOwners(){try{const r=await fetch('/v1/admin/owners');if(r.status===401){location.reload();return}const d=await r.json();document.getElementById('ownerTable').innerHTML=d.owners.map(o=>\`<tr><td>\${o.email}</td><td><span class="tag">\${o.license_key}</span></td><td>\${o.worker_count}/\${o.max_worker_slots}</td><td>\${o.worker_count}</td><td><span style="color:#64748b;font-size:12px">(click row to expand)</span></td><td>\${o.created_at?new Date(o.created_at).toLocaleDateString('vi-VN'):''}</td></tr>\`).join('')}catch(e){}}
async function loadProfiles(){try{const r=await fetch('/v1/admin/profiles');if(r.status===401){location.reload();return}const d=await r.json();document.getElementById('profileTable').innerHTML=d.profiles.map(p=>\`<tr><td style="color:#38bdf8;font-size:12px">\${p.id}</td><td>\${p.name}</td><td style="font-size:12px">\${p.owner_id}</td><td>\${p.assigned_count}</td><td>\${p.has_cookies?'✅':'❌'}</td><td>\${p.updated_at?new Date(p.updated_at).toLocaleDateString('vi-VN'):''}</td></tr>\`).join('')}catch(e){}}
async function loadAudit(){try{const r=await fetch('/v1/admin/audit');if(r.status===401){location.reload();return}const d=await r.json();document.getElementById('auditTable').innerHTML=d.audit.map(a=>\`<tr><td style="font-size:12px;color:#94a3b8">\${new Date(a.timestamp).toLocaleString('vi-VN')}</td><td style="font-size:12px">\${a.owner_id}</td><td>\${a.user_name}</td><td><span class="tag">\${a.action}</span></td><td>\${a.target}</td></tr>\`).join('')}catch(e){}}
async function logout(){await fetch('/v1/admin/logout',{method:'POST'});location.reload()}
loadLicenses();
</script></body></html>`);
});

server.listen(PORT, () => {
  console.log(`Clogin Backend API & Admin Web listening on port ${PORT}`);
});
