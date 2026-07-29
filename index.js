const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'licenses_db.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'CloginAdmin2026!';

let licensesMap = new Map();

function loadDb() {
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
  saveDb();
}

function saveDb() {
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

loadDb();

// --- Cloud Auth System ---
const OWNERS_DB = path.join(__dirname, 'owners_db.json');
const WORKERS_DB = path.join(__dirname, 'workers_db.json');
const JWT_SECRET = process.env.JWT_SECRET || 'clogin-jwt-secret-2026';
const JWT_TTL = 3600;

function loadJsonDb(fp, def) {
  try { if (fs.existsSync(fp)) return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch (e) {}
  return def;
}
function saveJsonDb(fp, d) {
  try { fs.writeFileSync(fp, JSON.stringify(d, null, 2), 'utf8'); } catch (e) {}
}

let ownersDb = loadJsonDb(OWNERS_DB, []);
let workersDb = loadJsonDb(WORKERS_DB, []);
function saveOwners() { saveJsonDb(OWNERS_DB, ownersDb); }
function saveWorkers() { saveJsonDb(WORKERS_DB, workersDb); }

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
    if (parts.length !== 3) return null;
    const e = crypto.createHmac('sha256', JWT_SECRET).update(`${parts[0]}.${parts[1]}`).digest('base64url');
    if (parts[2] !== e) return null;
    const pl = JSON.parse(b64urld(parts[1]));
    return pl.exp && pl.exp < Math.floor(Date.now() / 1000) ? null : pl;
  } catch (e) { return null; }
}
function authMw(req) {
  const a = req.headers['authorization'];
  return a && a.startsWith('Bearer ') ? verifyJwt(a.slice(7)) : null;
}

function uuid() { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }); }

const AUDIT_DB = path.join(__dirname, 'audit_cloud_db.json');
let auditDb = loadJsonDb(AUDIT_DB, []);
function saveAudit() { saveJsonDb(AUDIT_DB, auditDb); }

function requireOwner(payload) {
  if (!payload || payload.type !== 'owner') return null;
  return ownersDb.find(o => o.id === payload.sub);
}

const PROFILES_DB = path.join(__dirname, 'profiles_cloud_db.json');
let profilesDb = loadJsonDb(PROFILES_DB, []);
function saveProfiles() { saveJsonDb(PROFILES_DB, profilesDb); }

function parseJson(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk.toString(); });
    req.on('end', () => {
      if (!body || !body.trim()) return resolve({});
      try { resolve(JSON.parse(body)); } catch (e) { resolve({}); }
    });
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
  return cookies['clogin_admin_session'] === 'authenticated_2026_clogin_secret';
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
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
  const host = (req.headers.host || '').toLowerCase();

  // --- API Endpoints ---
  if (pathname === '/health') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.writeHead(200);
    return res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
  }

  // --- Cloud Auth Endpoints ---
  if (req.method === 'POST' && pathname === '/v1/auth/register') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const body = await parseJson(req);
    const { email, password, license_key } = body;
    if (!email || !password || !license_key) { res.writeHead(400); return res.end(JSON.stringify({ error: 'Thiếu email, password hoặc license_key' })); }
    const lic = licensesMap.get(license_key);
    if (!lic) { res.writeHead(404); return res.end(JSON.stringify({ error: 'License Key không hợp lệ' })); }
    if (lic.expires_at && new Date(lic.expires_at) < new Date()) { res.writeHead(403); return res.end(JSON.stringify({ error: 'License Key đã hết hạn' })); }
    if (ownersDb.some(o => o.email === email)) { res.writeHead(409); return res.end(JSON.stringify({ error: 'Email đã được đăng ký' })); }
    const owner = { id: uuid(), email, password_hash: hashPw(password), license_key, max_worker_slots: 3, created_at: new Date().toISOString() };
    ownersDb.push(owner); saveOwners();
    const token = signJwt({ sub: owner.id, type: 'owner', owner_id: owner.id });
    return res.end(JSON.stringify({ owner_id: owner.id, token }));
  }

  if (req.method === 'POST' && pathname === '/v1/auth/login') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const body = await parseJson(req);
    const { email, password } = body;
    if (!email || !password) { res.writeHead(400); return res.end(JSON.stringify({ error: 'Thiếu email hoặc password' })); }
    let user = ownersDb.find(o => o.email === email);
    let userType = 'owner';
    if (!user) { user = workersDb.find(w => w.email === email); userType = 'worker'; }
    if (!user || !verifyPw(password, user.password_hash)) { res.writeHead(401); return res.end(JSON.stringify({ error: 'Email hoặc mật khẩu không đúng' })); }
    if (userType === 'worker' && !user.active) { res.writeHead(403); return res.end(JSON.stringify({ error: 'Tài khoản đã bị vô hiệu hóa' })); }
    const ownerId = userType === 'owner' ? user.id : user.owner_id;
    const token = signJwt({ sub: user.id, type: userType, owner_id: ownerId });
    return res.end(JSON.stringify({ token, user_type: userType, user_id: user.id, owner_id: ownerId, email: user.email, name: user.name || '' }));
  }

  if (pathname === '/v1/auth/me') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const payload = authMw(req);
    if (!payload) { res.writeHead(401); return res.end(JSON.stringify({ error: 'Token không hợp lệ hoặc đã hết hạn' })); }
    if (payload.type === 'owner') {
      const owner = ownersDb.find(o => o.id === payload.sub);
      if (!owner) { res.writeHead(404); return res.end(JSON.stringify({ error: 'Không tìm thấy tài khoản' })); }
      return res.end(JSON.stringify({ user_id: owner.id, user_type: 'owner', email: owner.email, name: '', owner_id: owner.id }));
    }
    const worker = workersDb.find(w => w.id === payload.sub);
    if (!worker) { res.writeHead(404); return res.end(JSON.stringify({ error: 'Không tìm thấy tài khoản' })); }
    return res.end(JSON.stringify({ user_id: worker.id, user_type: 'worker', email: worker.email, name: worker.name || '', owner_id: worker.owner_id }));
  }

  if (req.method === 'POST' && pathname === '/v1/auth/refresh') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const payload = authMw(req);
    if (!payload) { res.writeHead(401); return res.end(JSON.stringify({ error: 'Token không hợp lệ' })); }
    const token = signJwt({ sub: payload.sub, type: payload.type, owner_id: payload.owner_id });
    return res.end(JSON.stringify({ token }));
  }

  // --- Team Management ---
  if (req.method === 'GET' && pathname === '/v1/team/workers') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const owner = requireOwner(authMw(req));
    if (!owner) { res.writeHead(401); return res.end(JSON.stringify({ error: 'Chỉ owner mới có quyền' })); }
    const list = workersDb.filter(w => w.owner_id === owner.id).map(w => ({ id: w.id, email: w.email, name: w.name, active: w.active, created_at: w.created_at }));
    return res.end(JSON.stringify({ workers: list }));
  }

  if (req.method === 'POST' && pathname === '/v1/team/workers') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const owner = requireOwner(authMw(req));
    if (!owner) { res.writeHead(401); return res.end(JSON.stringify({ error: 'Chỉ owner mới có quyền' })); }
    const body = await parseJson(req);
    const { email, password, name } = body;
    if (!email || !password) { res.writeHead(400); return res.end(JSON.stringify({ error: 'Thiếu email hoặc password' })); }
    if (workersDb.some(w => w.owner_id === owner.id && w.email === email)) { res.writeHead(409); return res.end(JSON.stringify({ error: 'Email worker đã tồn tại' })); }
    const activeCount = workersDb.filter(w => w.owner_id === owner.id && w.active).length;
    if (activeCount >= owner.max_worker_slots) { res.writeHead(403); return res.end(JSON.stringify({ error: `Đã đạt giới hạn ${owner.max_worker_slots} worker slots` })); }
    const worker = { id: uuid(), owner_id: owner.id, email, password_hash: hashPw(password), name: name || '', active: true, hwid: null, created_at: new Date().toISOString() };
    workersDb.push(worker); saveWorkers();
    auditDb.push({ id: uuid(), owner_id: owner.id, user_id: owner.id, user_type: 'owner', user_name: owner.email, action: 'CREATE_WORKER', target: email, timestamp: Date.now() }); saveAudit();
    return res.end(JSON.stringify({ worker_id: worker.id, email: worker.email, name: worker.name }));
  }

  if (req.method === 'PUT' && pathname.startsWith('/v1/team/workers/')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const owner = requireOwner(authMw(req));
    if (!owner) { res.writeHead(401); return res.end(JSON.stringify({ error: 'Chỉ owner mới có quyền' })); }
    const workerId = pathname.split('/').pop();
    const worker = workersDb.find(w => w.id === workerId && w.owner_id === owner.id);
    if (!worker) { res.writeHead(404); return res.end(JSON.stringify({ error: 'Không tìm thấy worker' })); }
    const body = await parseJson(req);
    if (body.name !== undefined) worker.name = body.name;
    if (body.password) worker.password_hash = hashPw(body.password);
    if (body.active !== undefined) worker.active = body.active;
    saveWorkers();
    auditDb.push({ id: uuid(), owner_id: owner.id, user_id: owner.id, user_type: 'owner', user_name: owner.email, action: 'UPDATE_WORKER', target: worker.email, timestamp: Date.now() }); saveAudit();
    return res.end(JSON.stringify({ success: true }));
  }

  if (req.method === 'DELETE' && pathname.startsWith('/v1/team/workers/')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const owner = requireOwner(authMw(req));
    if (!owner) { res.writeHead(401); return res.end(JSON.stringify({ error: 'Chỉ owner mới có quyền' })); }
    const workerId = pathname.split('/').pop();
    const idx = workersDb.findIndex(w => w.id === workerId && w.owner_id === owner.id);
    if (idx === -1) { res.writeHead(404); return res.end(JSON.stringify({ error: 'Không tìm thấy worker' })); }
    const removed = workersDb.splice(idx, 1)[0]; saveWorkers();
    auditDb.push({ id: uuid(), owner_id: owner.id, user_id: owner.id, user_type: 'owner', user_name: owner.email, action: 'DELETE_WORKER', target: removed.email, timestamp: Date.now() }); saveAudit();
    return res.end(JSON.stringify({ success: true }));
  }

  if (req.method === 'GET' && pathname === '/v1/team/audit') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const owner = requireOwner(authMw(req));
    if (!owner) { res.writeHead(401); return res.end(JSON.stringify({ error: 'Chỉ owner mới có quyền' })); }
    const logs = auditDb.filter(a => a.owner_id === owner.id).sort((a, b) => b.timestamp - a.timestamp).slice(0, 100);
    return res.end(JSON.stringify({ audit: logs }));
  }

  // --- Profile Cloud Storage ---
  if (req.method === 'POST' && pathname === '/v1/profiles/cloud/sync') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const owner = requireOwner(authMw(req));
    if (!owner) { res.writeHead(401); return res.end(JSON.stringify({ error: 'Chỉ owner mới có quyền' })); }
    const body = await parseJson(req);
    const { profile_id, name, folder, config, assigned_worker_ids } = body;
    if (!profile_id || !name) { res.writeHead(400); return res.end(JSON.stringify({ error: 'Thiếu profile_id hoặc name' })); }
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
    return res.end(JSON.stringify({ success: true }));
  }

  if (req.method === 'GET' && pathname === '/v1/profiles/cloud') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const payload = authMw(req);
    if (!payload) { res.writeHead(401); return res.end(JSON.stringify({ error: 'Token không hợp lệ' })); }
    let list;
    if (payload.type === 'owner') {
      list = profilesDb.filter(p => p.owner_id === payload.sub);
    } else {
      list = profilesDb.filter(p => p.assigned_worker_ids && p.assigned_worker_ids.includes(payload.sub));
    }
    list = list.map(p => ({ id: p.id, name: p.name, folder: p.folder, assigned_worker_ids: p.assigned_worker_ids, has_cookies: !!p.cookies, created_at: p.created_at, updated_at: p.updated_at }));
    return res.end(JSON.stringify({ profiles: list }));
  }

  if (req.method === 'GET' && pathname.startsWith('/v1/profiles/cloud/') && pathname.endsWith('/config')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const payload = authMw(req);
    if (!payload) { res.writeHead(401); return res.end(JSON.stringify({ error: 'Token không hợp lệ' })); }
    const parts = pathname.split('/');
    const profileId = parts[4];
    const profile = profilesDb.find(p => p.id === profileId);
    if (!profile) { res.writeHead(404); return res.end(JSON.stringify({ error: 'Không tìm thấy profile' })); }
    if (payload.type === 'owner' && profile.owner_id !== payload.sub) { res.writeHead(403); return res.end(JSON.stringify({ error: 'Không phải profile của bạn' })); }
    if (payload.type === 'worker' && (!profile.assigned_worker_ids || !profile.assigned_worker_ids.includes(payload.sub))) { res.writeHead(403); return res.end(JSON.stringify({ error: 'Bạn chưa được gán profile này' })); }
    return res.end(JSON.stringify({ id: profile.id, name: profile.name, folder: profile.folder, config: profile.config, assigned_worker_ids: profile.assigned_worker_ids }));
  }

  if (req.method === 'DELETE' && pathname.startsWith('/v1/profiles/cloud/') && !pathname.includes('/config') && !pathname.includes('/cookies') && !pathname.includes('/assign')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const owner = requireOwner(authMw(req));
    if (!owner) { res.writeHead(401); return res.end(JSON.stringify({ error: 'Chỉ owner mới có quyền' })); }
    const profileId = pathname.split('/').pop();
    const idx = profilesDb.findIndex(p => p.id === profileId && p.owner_id === owner.id);
    if (idx === -1) { res.writeHead(404); return res.end(JSON.stringify({ error: 'Không tìm thấy profile' })); }
    profilesDb.splice(idx, 1); saveProfiles();
    return res.end(JSON.stringify({ success: true }));
  }

  if (req.method === 'PUT' && pathname.startsWith('/v1/profiles/cloud/') && pathname.endsWith('/assign')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const owner = requireOwner(authMw(req));
    if (!owner) { res.writeHead(401); return res.end(JSON.stringify({ error: 'Chỉ owner mới có quyền' })); }
    const parts = pathname.split('/');
    const profileId = parts[4];
    const profile = profilesDb.find(p => p.id === profileId && p.owner_id === owner.id);
    if (!profile) { res.writeHead(404); return res.end(JSON.stringify({ error: 'Không tìm thấy profile' })); }
    const body = await parseJson(req);
    profile.assigned_worker_ids = body.worker_ids || [];
    profile.updated_at = new Date().toISOString();
    saveProfiles();
    return res.end(JSON.stringify({ success: true }));
  }

  // --- Cookie Cloud Sync ---
  if (req.method === 'POST' && pathname.startsWith('/v1/profiles/cloud/') && pathname.endsWith('/cookies')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const payload = authMw(req);
    if (!payload) { res.writeHead(401); return res.end(JSON.stringify({ error: 'Token không hợp lệ' })); }
    const parts = pathname.split('/');
    const profileId = parts[4];
    const profile = profilesDb.find(p => p.id === profileId);
    if (!profile) { res.writeHead(404); return res.end(JSON.stringify({ error: 'Không tìm thấy profile' })); }
    if (payload.type === 'owner' && profile.owner_id !== payload.sub) { res.writeHead(403); return res.end(JSON.stringify({ error: 'Không phải profile của bạn' })); }
    if (payload.type === 'worker' && (!profile.assigned_worker_ids || !profile.assigned_worker_ids.includes(payload.sub))) { res.writeHead(403); return res.end(JSON.stringify({ error: 'Bạn chưa được gán profile này' })); }
    const body = await parseJson(req);
    profile.cookies = body.cookies || [];
    profile.updated_at = new Date().toISOString();
    saveProfiles();
    return res.end(JSON.stringify({ success: true, count: profile.cookies.length }));
  }

  if (req.method === 'GET' && pathname.startsWith('/v1/profiles/cloud/') && pathname.endsWith('/cookies')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const payload = authMw(req);
    if (!payload) { res.writeHead(401); return res.end(JSON.stringify({ error: 'Token không hợp lệ' })); }
    const parts = pathname.split('/');
    const profileId = parts[4];
    const profile = profilesDb.find(p => p.id === profileId);
    if (!profile) { res.writeHead(404); return res.end(JSON.stringify({ error: 'Không tìm thấy profile' })); }
    if (payload.type === 'owner' && profile.owner_id !== payload.sub) { res.writeHead(403); return res.end(JSON.stringify({ error: 'Không phải profile của bạn' })); }
    if (payload.type === 'worker' && (!profile.assigned_worker_ids || !profile.assigned_worker_ids.includes(payload.sub))) { res.writeHead(403); return res.end(JSON.stringify({ error: 'Bạn chưa được gán profile này' })); }
    return res.end(JSON.stringify({ cookies: profile.cookies || [] }));
  }

  if (req.method === 'DELETE' && pathname.startsWith('/v1/profiles/cloud/') && pathname.endsWith('/cookies')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const owner = requireOwner(authMw(req));
    if (!owner) { res.writeHead(401); return res.end(JSON.stringify({ error: 'Chỉ owner mới có quyền' })); }
    const parts = pathname.split('/');
    const profileId = parts[4];
    const profile = profilesDb.find(p => p.id === profileId && p.owner_id === owner.id);
    if (!profile) { res.writeHead(404); return res.end(JSON.stringify({ error: 'Không tìm thấy profile' })); }
    profile.cookies = null;
    profile.updated_at = new Date().toISOString();
    saveProfiles();
    return res.end(JSON.stringify({ success: true }));
  }

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
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const body = await parseJson(req);
    const queryKey = reqUrl.searchParams ? (reqUrl.searchParams.get('license_key') || reqUrl.searchParams.get('key')) : null;
    const queryHwid = reqUrl.searchParams ? reqUrl.searchParams.get('hwid') : null;
    const queryDevice = reqUrl.searchParams ? reqUrl.searchParams.get('device_name') : null;

    const license_key = body.license_key || body.key || queryKey;
    const hwid = body.hwid || queryHwid;
    const device_name = body.device_name || queryDevice;

    if (!license_key || !hwid) { res.writeHead(400); return res.end(JSON.stringify({ error: 'Thiếu thông tin license_key hoặc hwid' })); }

    const lic = licensesMap.get(license_key);
    if (!lic) { res.writeHead(404); return res.end(JSON.stringify({ error: 'License Key không hợp lệ' })); }
    if (lic.expires_at && new Date(lic.expires_at) < new Date()) { res.writeHead(403); return res.end(JSON.stringify({ error: 'License Key đã hết hạn' })); }
    if (!lic.active_hwids.has(hwid) && lic.active_hwids.size >= lic.max_devices) { res.writeHead(403); return res.end(JSON.stringify({ error: 'License đã đạt giới hạn thiết bị cho phép' })); }

    lic.active_hwids.set(hwid, { device_name: device_name || 'Desktop PC', activated_at: new Date().toISOString() });
    saveDb();

    res.writeHead(200);
    return res.end(JSON.stringify({ key: lic.key, hwid, status: 'active', expires_at: lic.expires_at, max_devices: lic.max_devices, active_devices: lic.active_hwids.size }));
  }

  if (req.method === 'POST' && pathname === '/v1/license/verify') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const body = await parseJson(req);
    const queryKey = reqUrl.searchParams ? (reqUrl.searchParams.get('license_key') || reqUrl.searchParams.get('key')) : null;
    const queryHwid = reqUrl.searchParams ? reqUrl.searchParams.get('hwid') : null;
    const license_key = body.license_key || body.key || queryKey;
    const hwid = body.hwid || queryHwid;

    const lic = licensesMap.get(license_key);
    if (!lic) { res.writeHead(404); return res.end(JSON.stringify({ error: 'License Key không tồn tại' })); }
    if (lic.expires_at && new Date(lic.expires_at) < new Date()) { res.writeHead(403); return res.end(JSON.stringify({ error: 'License Key đã hết hạn' })); }
    if (!lic.active_hwids.has(hwid)) { res.writeHead(403); return res.end(JSON.stringify({ error: 'Thiết bị chưa được kích hoạt cho License này' })); }

    res.writeHead(200);
    return res.end(JSON.stringify({ key: lic.key, hwid, status: 'active', expires_at: lic.expires_at, max_devices: lic.max_devices, active_devices: lic.active_hwids.size }));
  }

  if (req.method === 'POST' && pathname === '/v1/admin/login') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const body = await parseJson(req);
    if (body.password === ADMIN_PASSWORD) {
      res.setHeader('Set-Cookie', 'clogin_admin_session=authenticated_2026_clogin_secret; Path=/; HttpOnly; Max-Age=86400');
      res.writeHead(200);
      return res.end(JSON.stringify({ success: true }));
    }
    res.writeHead(401);
    return res.end(JSON.stringify({ error: 'Mật khẩu quản trị không chính xác' }));
  }

  if (req.method === 'POST' && pathname === '/v1/admin/logout') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Set-Cookie', 'clogin_admin_session=; Path=/; HttpOnly; Max-Age=0');
    res.writeHead(200);
    return res.end(JSON.stringify({ success: true }));
  }

  if (req.method === 'GET' && pathname === '/v1/admin/licenses') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (!isAdminAuthed(req)) { res.writeHead(401); return res.end(JSON.stringify({ error: 'Chưa đăng nhập quản trị' })); }
    const list = Array.from(licensesMap.values()).map((l) => ({
      key: l.key, plan: l.plan, max_devices: l.max_devices, active_devices: l.active_hwids.size, expires_at: l.expires_at,
      devices: Array.from(l.active_hwids.entries()).map(([hwid, dev]) => ({ hwid, device_name: dev.device_name, activated_at: dev.activated_at })),
    }));
    res.writeHead(200);
    return res.end(JSON.stringify({ licenses: list }));
  }

  if (req.method === 'POST' && pathname === '/v1/admin/licenses') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (!isAdminAuthed(req)) { res.writeHead(401); return res.end(JSON.stringify({ error: 'Chưa đăng nhập quản trị' })); }
    const body = await parseJson(req);
    const { plan, max_devices, days_valid } = body;
    const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
    const key = `CLOGIN-${(plan || 'STD').replaceAll(/\s+/g, '').toUpperCase()}-${randomStr}`;
    const expires_at = days_valid ? new Date(Date.now() + days_valid * 24 * 60 * 60 * 1000).toISOString() : null;
    const newLic = { key, plan: plan || 'Standard', max_devices: max_devices || 1, expires_at, active_hwids: new Map() };
    licensesMap.set(key, newLic);
    saveDb();
    res.writeHead(200);
    return res.end(JSON.stringify({ key, plan: newLic.plan, max_devices: newLic.max_devices, expires_at }));
  }

  if (req.method === 'POST' && pathname === '/v1/admin/licenses/action') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (!isAdminAuthed(req)) { res.writeHead(401); return res.end(JSON.stringify({ error: 'Chưa đăng nhập quản trị' })); }
    const body = await parseJson(req);
    const { action, key, hwid } = body;
    const lic = licensesMap.get(key);
    if (!lic) { res.writeHead(404); return res.end(JSON.stringify({ error: 'Key không tồn tại' })); }
    if (action === 'delete') { licensesMap.delete(key); saveDb(); res.writeHead(200); return res.end(JSON.stringify({ success: true, message: 'Đã xóa Key' })); }
    if (action === 'reset_hwid' && hwid) { lic.active_hwids.delete(hwid); saveDb(); res.writeHead(200); return res.end(JSON.stringify({ success: true, message: 'Đã giải phóng thiết bị khỏi Key' })); }
    if (action === 'reset_all_hwids') { lic.active_hwids.clear(); saveDb(); res.writeHead(200); return res.end(JSON.stringify({ success: true, message: 'Đã reset toàn bộ thiết bị của Key' })); }
    res.writeHead(400);
    return res.end(JSON.stringify({ error: 'Hành động không hợp lệ' }));
  }

  // --- Admin API Endpoints (cookie auth) ---
  if (req.method === 'GET' && pathname === '/v1/admin/owners') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (!isAdminAuthed(req)) { res.writeHead(401); return res.end(JSON.stringify({ error: 'Chưa đăng nhập' })); }
    const list = ownersDb.map(o => ({ id: o.id, email: o.email, license_key: o.license_key, max_worker_slots: o.max_worker_slots, worker_count: workersDb.filter(w => w.owner_id === o.id).length, created_at: o.created_at }));
    return res.end(JSON.stringify({ owners: list }));
  }

  if (req.method === 'GET' && pathname === '/v1/admin/profiles') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (!isAdminAuthed(req)) { res.writeHead(401); return res.end(JSON.stringify({ error: 'Chưa đăng nhập' })); }
    const list = profilesDb.map(p => ({ id: p.id, owner_id: p.owner_id, name: p.name, has_cookies: !!p.cookies, assigned_count: (p.assigned_worker_ids || []).length, updated_at: p.updated_at }));
    return res.end(JSON.stringify({ profiles: list }));
  }

  if (req.method === 'GET' && pathname === '/v1/admin/audit') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (!isAdminAuthed(req)) { res.writeHead(401); return res.end(JSON.stringify({ error: 'Chưa đăng nhập' })); }
    const logs = auditDb.sort((a, b) => b.timestamp - a.timestamp).slice(0, 200);
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
