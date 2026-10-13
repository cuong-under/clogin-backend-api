const { test, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

// Integration test (khong DB): hop dong cua route /v1/engine — thu ma app
// desktop dua vao de cai engine.
//
// Hai bat bien de vo nhat, deu da tung lam app ket o engine cu:
//   1. `archives[name]` PHAI bang `sha256[name]` — API tra chinh gia tri
//      `archives[name]` o header ETag, app luu lai roi so voi manifest o lan
//      khoi dong sau. Lech mot ly la tai lai 200MB moi lan chay.
//   2. Ten artifact PHAI nam trong whitelist manifest — khong duoc suy ra
//      duong dan tu request (chan path traversal + SSRF).
//
// Khong goi mang that: CDN upstream duoc thay bang server gia qua
// ENGINE_UPSTREAM_BASE, nen test chay duoc ca khi offline.

const ENGINE_DIR = path.join(__dirname, '..', 'src', 'engine');
const manifest = JSON.parse(fs.readFileSync(path.join(ENGINE_DIR, 'runtime.json'), 'utf8'));
const KNOWN = 'ShardX-Fingerprints.zip';
const NOT_IN_MANIFEST = 'Khong-Co-Artifact-Nay.zip';

// Byte gia, co dinh — test chi kiem hop dong header/route, viec doi chieu
// sha256 voi noi dung that do app lam (da kiem rieng bang tay tren CDN that).
const FAKE = Buffer.alloc(4096, 7);

const upstreamHits = [];
const upstream = http.createServer((req, res) => {
  const name = decodeURIComponent(req.url.replace(/^\/+/, ''));
  upstreamHits.push(name);
  if (name === NOT_IN_MANIFEST) {
    res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': FAKE.length });
    return res.end(FAKE);
  }
  if (name === KNOWN) {
    res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': FAKE.length });
    return res.end(FAKE);
  }
  res.writeHead(404);
  return res.end();
});

const ready = (async () => {
  await new Promise((r) => upstream.listen(0, '127.0.0.1', r));
  process.env.ENGINE_UPSTREAM_BASE = `http://127.0.0.1:${upstream.address().port}`;

  // Dung app TOI THIEU thay vi require('../src/index'): route engine khong
  // cham DB, va require ca app keo theo PrismaClient → tien trinh khong tu
  // thoat (bo test cua repo cung vay, phai co DB moi chay xong). Giu test nay
  // hermetic de khong them mot file treo vao `npm test`.
  const express = require('express');
  const app = express();
  app.use('/v1/engine', require('../src/routes/engine'));

  const appServer = http.createServer(app);
  await new Promise((r) => appServer.listen(0, r));
  after(() => {
    // `closeAllConnections()` la bat buoc: fetch (undici) giu socket keep-alive,
    // `close()` khong dong chung nen tien trinh treo mai du test da xong.
    appServer.closeAllConnections?.();
    upstream.closeAllConnections?.();
    appServer.close();
    upstream.close();
  });
  return `http://127.0.0.1:${appServer.address().port}/v1/engine`;
})();

test('manifest: 200, khong cache, co chromium_version + archives', async () => {
  const base = await ready;
  const res = await fetch(`${base}/runtime.json`);
  assert.equal(res.status, 200);
  // Cache lai => app khong thay engine moi => ket o ban cu. Phai la no-store.
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const body = await res.json();
  assert.ok(body.chromium_version, 'thieu chromium_version');
  assert.ok(Object.keys(body.archives).length > 0, 'archives rong');
});

test('manifest: archives[name] === sha256[name] cho MOI artifact', async () => {
  const base = await ready;
  const body = await (await fetch(`${base}/runtime.json`)).json();
  for (const [name, etag] of Object.entries(body.archives)) {
    assert.equal(
      body.sha256?.[name],
      etag,
      `${name}: etag va sha256 lech nhau — app se tai lai 200MB moi lan khoi dong`
    );
  }
});

test('chu ky: 200, text/plain, dung dinh dang minisign', async () => {
  const base = await ready;
  const res = await fetch(`${base}/${KNOWN}.sig`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/plain/);
  const body = await res.text();
  assert.match(body, /^untrusted comment:/, 'dong dau phai la untrusted comment');
});

test('artifact: 200, ETag khop manifest, Content-Length di nguyen ven', async () => {
  const base = await ready;
  const res = await fetch(`${base}/${KNOWN}`);
  assert.equal(res.status, 200);
  assert.equal(
    (res.headers.get('etag') || '').replace(/^"|"$/g, ''),
    manifest.archives[KNOWN],
    'ETag phai lay tu manifest.archives chu khong phai tu CDN'
  );
  assert.equal(res.headers.get('content-length'), String(FAKE.length));
  const buf = Buffer.from(await res.arrayBuffer());
  assert.equal(buf.length, FAKE.length);
});

test('ten khong co trong manifest: 404 du CDN co san file', async () => {
  const base = await ready;
  const res = await fetch(`${base}/${NOT_IN_MANIFEST}`);
  assert.equal(res.status, 404, 'whitelist theo manifest phai chan truoc khi goi CDN');
  assert.ok(
    !upstreamHits.includes(NOT_IN_MANIFEST),
    'khong duoc goi CDN cho ten ngoai manifest (SSRF)'
  );
});

test('path traversal: 404, khong cham CDN', async () => {
  const base = await ready;
  const before = upstreamHits.length;
  for (const bad of ['..%2F..%2Fpackage.json', '..%2f..%2f.env', '%2e%2e%2f%2e%2e%2fapp.js']) {
    const res = await fetch(`${base}/${bad}`);
    assert.equal(res.status, 404, `${bad} phai bi tu choi`);
  }
  assert.equal(upstreamHits.length, before, 'khong duoc goi CDN cho duong dan traversal');
});

test('CDN loi: tra 502 chu khong treo', async () => {
  const base = await ready;
  const res = await fetch(`${base}/ShardX-Windows.zip`);
  assert.equal(res.status, 502, 'CDN 404 => API phai bao 502 ro rang');
});
