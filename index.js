const http = require('http');
const fs = require('fs');
const path = require('path');

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
<div class="card"><h3>Tạo License Key Mới</h3>
<form onsubmit="createKey(event)">
<input type="text" id="plan" placeholder="Tên gói" required>
<input type="number" id="max_devices" placeholder="Số thiết bị" value="1" min="1" required>
<input type="number" id="days_valid" placeholder="Số ngày hạn (trống = Vĩnh viễn)">
<button type="submit">+ Tạo License Key</button></form></div>
<div class="card"><div style="display:flex;justify-content:space-between;align-items:center"><h3>Danh Sách License Key</h3><button onclick="loadLicenses()">🔄 Tải lại</button></div>
<table><thead><tr><th>License Key</th><th>Gói</th><th>Thiết bị</th><th>Hạn dùng</th><th>Máy đã kích hoạt</th><th>Tác vụ</th></tr></thead><tbody id="licTable"></tbody></table></div>
<script>
async function loadLicenses(){const r=await fetch('/v1/admin/licenses');if(r.status===401){location.reload();return}const d=await r.json();document.getElementById('licTable').innerHTML=d.licenses.map(l=>\`<tr><td><strong style="color:#38bdf8">\${l.key}</strong> <button style="padding:2px 6px;font-size:11px;margin-left:6px" onclick="navigator.clipboard.writeText('\${l.key}')">Copy</button></td><td><span class="tag">\${l.plan}</span></td><td>\${l.active_devices}/\${l.max_devices}</td><td>\${l.expires_at?new Date(l.expires_at).toLocaleDateString('vi-VN'):'Vĩnh viễn'}</td><td>\${l.devices.length?l.devices.map(d=>\`<div class="dev-item"><span>\${d.device_name} (\${d.hwid})</span><button class="btn-danger" style="padding:2px 6px;font-size:11px" onclick="resetHwid('\${l.key}','\${d.hwid}')">Gỡ</button></div>\`).join(''):'<span style="color:#64748b">Chưa có máy</span>'}</td><td>\${l.active_devices>0?\`<button style="padding:4px 8px;font-size:12px;margin-bottom:4px" onclick="resetAllHwids('\${l.key}')">Reset HWID</button><br>\`:''}<button class="btn-danger" style="padding:4px 8px;font-size:12px" onclick="deleteKey('\${l.key}')">Xóa</button></td></tr>\`).join('')}
async function createKey(e){e.preventDefault();await fetch('/v1/admin/licenses',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan:document.getElementById('plan').value,max_devices:parseInt(document.getElementById('max_devices').value),days_valid:parseInt(document.getElementById('days_valid').value)||null})});document.getElementById('plan').value='';loadLicenses()}
async function resetHwid(k,h){if(!confirm('Gỡ thiết bị này?'))return;await fetch('/v1/admin/licenses/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'reset_hwid',key:k,hwid:h})});loadLicenses()}
async function resetAllHwids(k){if(!confirm('Reset toàn bộ HWID?'))return;await fetch('/v1/admin/licenses/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'reset_all_hwids',key:k})});loadLicenses()}
async function deleteKey(k){if(!confirm('Xóa Key này?'))return;await fetch('/v1/admin/licenses/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'delete',key:k})});loadLicenses()}
async function logout(){await fetch('/v1/admin/logout',{method:'POST'});location.reload()}
loadLicenses();
</script></body></html>`);
});

server.listen(PORT, () => {
  console.log(`Clogin Backend API & Admin Web listening on port ${PORT}`);
});
