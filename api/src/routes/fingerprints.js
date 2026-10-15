const express = require('express');
const path = require('path');
const fs = require('fs');
const { createRateLimiter } = require('../middleware/rate-limit');
const { getClientIp } = require('../utils/validators');

const router = express.Router();

const downloadLimiter = createRateLimiter(
  'fingerprints-download',
  120,
  10 * 60 * 1000,
  'Quá nhiều yêu cầu tải fingerprints, vui lòng thử lại sau ít phút',
  (req) => getClientIp(req)
);

const DATA_DIR = path.join(__dirname, '../data/fingerprints');

router.get('/webgl.json', downloadLimiter, (req, res, next) => {
  try {
    const filePath = path.join(DATA_DIR, 'webgl.json');
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'webgl.json not found' });
    }
    res.setHeader('Cache-Control', 'public, max-age=1800');
    return res.sendFile(filePath);
  } catch (err) {
    next(err);
  }
});

router.get('/user-agents.json', downloadLimiter, (req, res, next) => {
  try {
    const filePath = path.join(DATA_DIR, 'user-agents.json');
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'user-agents.json not found' });
    }
    res.setHeader('Cache-Control', 'public, max-age=1800');
    return res.sendFile(filePath);
  } catch (err) {
    next(err);
  }
});

router.get('/summary', downloadLimiter, (req, res) => {
  try {
    const webglPath = path.join(DATA_DIR, 'webgl.json');
    const uaPath = path.join(DATA_DIR, 'user-agents.json');
    const gpus = fs.existsSync(webglPath) ? JSON.parse(fs.readFileSync(webglPath, 'utf8')).length : 0;
    const uas = fs.existsSync(uaPath) ? JSON.parse(fs.readFileSync(uaPath, 'utf8')).length : 0;
    return res.json({
      status: 'ok',
      distinct_gpus: gpus,
      user_agents: uas,
      version: '1.0.0'
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
