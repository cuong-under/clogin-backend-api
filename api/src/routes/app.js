const express = require('express');
const router = express.Router();
const { Readable } = require('stream');
const releaseService = require('../services/release.service');
const systemService = require('../services/system.service');
const { sendError } = require('../middleware/error');

router.get('/update', async (req, res, next) => {
  try {
    const result = await releaseService.getLatestRelease();
    if (!result) return res.status(204).end();
    return res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.statusCode, err.code, err.message);
    }
    next(err);
  }
});

// Manifest cho Tauri auto-updater (tauri-plugin-updater).
router.get('/update/manifest', async (req, res, next) => {
  try {
    const manifest = await releaseService.getUpdateManifest();
    if (!manifest) return res.status(204).end();
    return res.status(200).type('application/json; charset=utf-8').json(manifest);
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.statusCode, err.code, err.message);
    }
    next(err);
  }
});

// Secure proxy download artifact từ GitHub Private Release sang client.
// Proxy thay vì redirect để đảm bảo Tauri updater (reqwest) nhận được
// file binary trực tiếp với status 200, tránh lỗi verify signature
// do redirect chain hoặc signed URL hết hạn.
router.get('/update/download', async (req, res, next) => {
  try {
    const downloadUrl = await releaseService.getDownloadUrl(req.query.v || req.query.version);
    if (!downloadUrl) return res.status(404).json({ error: 'Release artifact not found' });

    console.log(`[download] Proxying ${req.query.v || req.query.version}`);

    // Fetch from GitHub and proxy to client
    const response = await fetch(downloadUrl, {
      headers: {
        Accept: 'application/octet-stream',
      },
      redirect: 'manual',
    });

    // Follow redirect if any (do NOT send Authorization to storage URL)
    let fileUrl = downloadUrl;
    if (response.status === 302 || response.status === 301) {
      const location = response.headers.get('location');
      if (location) {
        fileUrl = location;
      }
    }

    const fileResponse = await fetch(fileUrl, {
      headers: { Accept: 'application/octet-stream' },
    });

    if (!fileResponse.ok) {
      return res.status(fileResponse.status).json({ error: 'Failed to fetch artifact' });
    }

    // Set headers for streaming
    const contentType = fileResponse.headers.get('content-type') || 'application/octet-stream';
    const contentLength = fileResponse.headers.get('content-length');
    if (contentLength) res.set('Content-Length', contentLength);
    res.set('Content-Type', contentType);
    res.set('X-Download-Source', 'proxy');

    // Stream trực tiếp GitHub → client. Trước đây nạp cả file vào RAM
    // (arrayBuffer) rồi mới gửi → installer vài trăm MB làm container bị
    // OOM khi nhiều client cùng tải.
    if (!fileResponse.body) {
      return res.status(502).json({ error: 'Upstream không trả body' });
    }
    Readable.fromWeb(fileResponse.body).pipe(res);
    return;
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.statusCode, err.code, err.message);
    }
    next(err);
  }
});

router.get('/announcements', async (req, res, next) => {
  try {
    const announcements = await systemService.getActiveAnnouncements();
    return res.status(200).json({ announcements });
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.statusCode, err.code, err.message);
    }
    next(err);
  }
});

router.get('/features', async (req, res, next) => {
  try {
    const features = await systemService.getActiveFeatureFlags();
    return res.status(200).json({ features });
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.statusCode, err.code, err.message);
    }
    next(err);
  }
});

module.exports = router;
