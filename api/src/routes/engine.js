const express = require('express');
const { Readable } = require('node:stream');
const engineService = require('../services/engine.service');
const { sendServiceError } = require('../middleware/error');
const { createRateLimiter } = require('../middleware/rate-limit');
const { getClientIp } = require('../utils/validators');

const router = express.Router();

// Engine KHÔNG yêu cầu đăng nhập: bản cài đặt chạy trước khi user đăng nhập,
// và bản thân CDN cũ cũng công khai. Bù lại phải chặn lạm dụng — mỗi file
// hàng trăm MB, một vòng lặp tải sẽ đốt sạch băng thông của server.
// Một lần cài hợp lệ tốn ~7 request (manifest + artifact + chữ ký).
const downloadLimiter = createRateLimiter(
  'engine-download',
  120,
  10 * 60 * 1000,
  'Quá nhiều yêu cầu tải engine, vui lòng thử lại sau ít phút',
  (req) => getClientIp(req)
);

// Manifest: PHẢI luôn tươi. Cache lại thì app không thấy engine mới và kẹt
// ở bản cũ — đúng cái bug đang phải sửa.
router.get('/runtime.json', downloadLimiter, (req, res, next) => {
  try {
    const manifest = engineService.getManifest();
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).type('application/json; charset=utf-8').send(`${JSON.stringify(manifest)}\n`);
  } catch (err) {
    if (err.statusCode) return sendServiceError(res, err);
    next(err);
  }
});

// Chữ ký minisign. Artifact tải về sẽ bị app TỪ CHỐI nếu chữ ký không khớp
// ENGINE_PUBKEY nhúng trong app, nên đây không phải file phụ.
router.get('/:name', downloadLimiter, async (req, res, next) => {
  const raw = req.params.name;
  const wantsSig = raw.endsWith('.sig');
  const artifact = engineService.getArtifact(wantsSig ? raw.slice(0, -4) : raw);

  if (!artifact) {
    return res.status(404).json({
      error: { code: 'ENGINE_ARTIFACT_NOT_FOUND', message: 'Không có artifact này' }
    });
  }

  try {
    if (wantsSig) {
      const body = engineService.readSignature(artifact);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return res.status(200).type('text/plain; charset=utf-8').send(body);
    }

    // Artifact nặng: proxy từ CDN upstream thay vì lưu trong image.
    // Hủy upstream khi client ngắt để không giữ kết nối 200MB treo vô ích.
    const controller = new AbortController();
    res.on('close', () => controller.abort());

    let upstream;
    try {
      upstream = await fetch(engineService.upstreamUrl(artifact.name), { signal: controller.signal });
    } catch (err) {
      if (controller.signal.aborted) return undefined;
      throw {
        statusCode: 502,
        code: 'ENGINE_UPSTREAM_UNREACHABLE',
        message: `Không lấy được ${artifact.name} từ CDN: ${err.message}`
      };
    }

    if (!upstream.ok) {
      throw {
        statusCode: 502,
        code: 'ENGINE_UPSTREAM_FAILED',
        message: `CDN trả ${upstream.status} cho ${artifact.name}`
      };
    }

    res.status(200);
    res.setHeader('Content-Type', 'application/zip');
    // ETag do TA đặt, lấy từ manifest — app lưu giá trị này rồi so với manifest
    // ở lần khởi động sau, nên nó phải khớp manifest tuyệt đối.
    res.setHeader('ETag', `"${artifact.etag}"`);
    // Nội dung bất biến theo sha256 => cache được vĩnh viễn.
    // Thêm no-transform và Content-Encoding: identity để Cloudflare KHÔNG tự ý nén gzip/brotli
    // đè lên file .zip (tránh lỗi 'error decoding response body' trên máy user).
    res.setHeader('Cache-Control', 'no-transform, public, max-age=31536000, immutable');
    res.setHeader('Content-Encoding', 'identity');
    const len = upstream.headers.get('content-length');
    if (len) res.setHeader('Content-Length', len);

    Readable.fromWeb(upstream.body).pipe(res);
    return undefined;
  } catch (err) {
    if (res.headersSent) return res.destroy();
    if (err.statusCode) return sendServiceError(res, err);
    return next(err);
  }
});

module.exports = router;
