const express = require('express');
const router = express.Router();
const licenseService = require('../services/license.service');
const { sendError } = require('../middleware/error');
const { getClientIp } = require('../utils/validators');

router.post('/activate', async (req, res, next) => {
  try {
    const queryKey = req.query.license_key || req.query.key;
    const queryHwid = req.query.hwid;
    const queryDevice = req.query.device_name;

    const key = req.body.license_key || req.body.key || queryKey;
    const hwid = req.body.hwid || queryHwid;
    const device_name = req.body.device_name || queryDevice || 'Desktop PC';
    const ip_address = getClientIp(req);

    const result = await licenseService.activateLicense({ key, hwid, device_name, ip_address });
    return res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.statusCode, err.code, err.message);
    }
    next(err);
  }
});

router.post('/verify', async (req, res, next) => {
  try {
    const queryKey = req.query.license_key || req.query.key;
    const queryHwid = req.query.hwid;

    const key = req.body.license_key || req.body.key || queryKey;
    const hwid = req.body.hwid || queryHwid;

    const result = await licenseService.verifyLicense({ key, hwid });
    return res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.statusCode, err.code, err.message);
    }
    next(err);
  }
});

module.exports = router;
