const express = require('express');
const router = express.Router();
const releaseService = require('../services/release.service');
const systemService = require('../services/system.service');
const { sendError } = require('../middleware/error');

router.get('/update', async (req, res, next) => {
  try {
    const result = await releaseService.getLatestRelease();
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
    return res.status(200).json(manifest);
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
