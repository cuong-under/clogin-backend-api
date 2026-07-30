const express = require('express');
const router = express.Router();
const profileService = require('../services/profile.service');
const { authMw, requireOwner } = require('../middleware/auth');
const { sendError } = require('../middleware/error');

router.post('/cloud/sync', authMw, requireOwner, async (req, res, next) => {
  try {
    const result = await profileService.syncCloudProfile(req.owner.id, req.body);
    return res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.statusCode, err.code, err.message);
    }
    next(err);
  }
});

router.get('/cloud', authMw, async (req, res, next) => {
  try {
    const result = await profileService.getCloudProfiles(req.user);
    return res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.statusCode, err.code, err.message);
    }
    next(err);
  }
});

router.get('/cloud/:id/config', authMw, async (req, res, next) => {
  try {
    const result = await profileService.getCloudProfileConfig(req.user, req.params.id);
    return res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.statusCode, err.code, err.message);
    }
    next(err);
  }
});

router.put('/cloud/:id/assign', authMw, requireOwner, async (req, res, next) => {
  try {
    const result = await profileService.assignCloudProfile(req.owner.id, req.params.id, req.body.worker_ids || req.body.assigned_worker_ids);
    return res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.statusCode, err.code, err.message);
    }
    next(err);
  }
});

router.post('/cloud/:id/cookies', authMw, async (req, res, next) => {
  try {
    const result = await profileService.saveProfileCookies(req.user, req.params.id, req.body.cookies);
    return res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.statusCode, err.code, err.message);
    }
    next(err);
  }
});

router.get('/cloud/:id/cookies', authMw, async (req, res, next) => {
  try {
    const result = await profileService.getProfileCookies(req.user, req.params.id);
    return res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.statusCode, err.code, err.message);
    }
    next(err);
  }
});

router.delete('/cloud/:id/cookies', authMw, requireOwner, async (req, res, next) => {
  try {
    const result = await profileService.deleteProfileCookies(req.owner.id, req.params.id);
    return res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.statusCode, err.code, err.message);
    }
    next(err);
  }
});

router.delete('/cloud/:id', authMw, requireOwner, async (req, res, next) => {
  try {
    const result = await profileService.deleteCloudProfile(req.owner.id, req.params.id);
    return res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.statusCode, err.code, err.message);
    }
    next(err);
  }
});

module.exports = router;
