const fs = require('node:fs');
const path = require('node:path');

// Engine (Chromium đã patch) phục vụ qua chính API này thay vì kho R2 của
// upstream. Lý do: bucket R2 kia KHÔNG thuộc quyền kiểm soát của mình, nên
// không thể đẩy manifest + chữ ký lên đó — engine sẽ kẹt ở bản cũ vĩnh viễn.
//
// Phân chia trách nhiệm:
//   - `runtime.json` + các file `.sig` (nhỏ, vài KB): nằm ngay trong repo này,
//     đi kèm bản deploy => immutable, có audit qua git.
//   - Artifact `.zip` (hàng trăm MB): KHÔNG lưu ở đây. Container API không có
//     volume bền, nhồi 592MB vào image là sai. Thay vào đó proxy từ CDN
//     upstream, nhưng ETag do TA quyết định (lấy từ sha256 trong manifest)
//     nên app vẫn phát hiện đúng khi engine đổi.
const ENGINE_DIR = path.join(__dirname, '..', 'engine');
const MANIFEST_PATH = path.join(ENGINE_DIR, 'runtime.json');
const SIG_DIR = path.join(ENGINE_DIR, 'sigs');

// CDN chứa artifact thô (mặc định). Có thể đổi sang nơi khác qua
// `ENGINE_UPSTREAM_BASE` khi cần tự host, hoặc trỏ vào server giả trong test.
const DEFAULT_UPSTREAM_BASE = 'https://pub-e57a7c60f6934eb09a6600bf2fc59cdc.r2.dev';

// Đọc env LÚC GỌI, không phải lúc nạp module: test cắm được CDN giả mà không
// phải quan tâm thứ tự require, và đổi env lúc chạy cũng có tác dụng.
function upstreamBase() {
  return (process.env.ENGINE_UPSTREAM_BASE || DEFAULT_UPSTREAM_BASE).replace(/\/+$/, '');
}

// Tên artifact hợp lệ: chỉ cho phép ký tự an toàn, KHÔNG có dấu `/` hay `..`.
// Kết hợp với whitelist theo manifest => chặn cả path traversal lẫn SSRF.
const SAFE_NAME = /^[A-Za-z0-9._-]+\.zip$/;

let cachedManifest = null;

/**
 * Đọc manifest engine. Ném lỗi rõ ràng khi thiếu/hỏng — im lặng trả rỗng sẽ
 * khiến app tải nhầm bản cũ mà không ai biết.
 */
function loadManifest() {
  if (cachedManifest) return cachedManifest;
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  } catch (err) {
    throw {
      statusCode: 500,
      code: 'ENGINE_MANIFEST_UNAVAILABLE',
      message: `Không đọc được manifest engine (${path.basename(MANIFEST_PATH)}): ${err.message}`
    };
  }
  if (!parsed || typeof parsed !== 'object' || !parsed.archives || !parsed.chromium_version) {
    throw {
      statusCode: 500,
      code: 'ENGINE_MANIFEST_INVALID',
      message: 'Manifest engine thiếu `chromium_version` hoặc `archives`'
    };
  }
  cachedManifest = parsed;
  return parsed;
}

function getManifest() {
  return loadManifest();
}

/**
 * Tra một artifact theo tên. Trả null nếu tên không nằm trong manifest —
 * whitelist là nguồn sự thật duy nhất, không dò đĩa.
 *
 * `etag` chính là sha256: app lưu etag lúc tải và so với manifest các lần sau,
 * nên hai giá trị này BẮT BUỘC phải là một. Dùng sha256 làm etag giúp bỏ hẳn
 * phụ thuộc vào cách R2/S3 tính etag (multipart cho ra `md5-N`, không suy ra được).
 */
function getArtifact(name) {
  if (typeof name !== 'string' || !SAFE_NAME.test(name)) return null;
  const manifest = loadManifest();
  if (!Object.prototype.hasOwnProperty.call(manifest.archives, name)) return null;
  return {
    name,
    etag: manifest.archives[name],
    sha256: manifest.sha256?.[name] ?? null,
    sigPath: path.join(SIG_DIR, `${name}.sig`)
  };
}

/** Chữ ký minisign của artifact. Tên đã được whitelist qua getArtifact(). */
function readSignature(artifact) {
  if (!fs.existsSync(artifact.sigPath)) {
    throw {
      statusCode: 500,
      code: 'ENGINE_SIGNATURE_MISSING',
      message: `Thiếu chữ ký cho ${artifact.name} — engine sẽ bị app từ chối`
    };
  }
  return fs.readFileSync(artifact.sigPath, 'utf8');
}

/** URL artifact trên CDN upstream. */
function upstreamUrl(name) {
  return `${upstreamBase()}/${name}`;
}

module.exports = {
  DEFAULT_UPSTREAM_BASE,
  upstreamBase,
  loadManifest,
  getManifest,
  getArtifact,
  readSignature,
  upstreamUrl,
  SAFE_NAME
};
