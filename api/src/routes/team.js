const express = require('express');
const router = express.Router();
const userService = require('../services/user.service');
const auditService = require('../services/audit.service');
const { authMw, requireOwner } = require('../middleware/auth');
const { sendError } = require('../middleware/error');
const { getClientIp } = require('../utils/validators');

router.get('/workers', authMw, requireOwner, async (req, res, next) => {
  try {
    const result = await userService.getWorkers(req.owner.id);
    return res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.statusCode, err.code, err.message);
    }
    next(err);
  }
});

router.post('/workers', authMw, requireOwner, async (req, res, next) => {
  try {
    const result = await userService.createWorker(req.owner.id, req.body);
    await auditService.logAudit({
      owner_id: req.owner.id,
      user_id: req.owner.id,
      user_type: 'owner',
      user_name: req.owner.email,
      action: 'CREATE_WORKER',
      target: req.body.email,
      ip_address: getClientIp(req),
      user_agent: req.headers['user-agent']
    });
    return res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.statusCode, err.code, err.message);
    }
    next(err);
  }
});

router.put('/workers/:id', authMw, requireOwner, async (req, res, next) => {
  try {
    const workerId = req.params.id;
    const result = await userService.updateWorker(req.owner.id, workerId, req.body);
    await auditService.logAudit({
      owner_id: req.owner.id,
      user_id: req.owner.id,
      user_type: 'owner',
      user_name: req.owner.email,
      action: 'UPDATE_WORKER',
      target: workerId,
      ip_address: getClientIp(req),
      user_agent: req.headers['user-agent']
    });
    return res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.statusCode, err.code, err.message);
    }
    next(err);
  }
});

router.delete('/workers/:id', authMw, requireOwner, async (req, res, next) => {
  try {
    const workerId = req.params.id;
    const result = await userService.deleteWorker(req.owner.id, workerId);
    await auditService.logAudit({
      owner_id: req.owner.id,
      user_id: req.owner.id,
      user_type: 'owner',
      user_name: req.owner.email,
      action: 'DELETE_WORKER',
      target: workerId,
      ip_address: getClientIp(req),
      user_agent: req.headers['user-agent']
    });
    return res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.statusCode, err.code, err.message);
    }
    next(err);
  }
});

router.get('/audit', authMw, requireOwner, async (req, res, next) => {
  try {
    const result = await auditService.getOwnerAuditLogs(req.owner.id);
    return res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.statusCode, err.code, err.message);
    }
    next(err);
  }
});

module.exports = router;
