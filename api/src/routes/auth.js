const express = require('express');
const router = express.Router();
const userService = require('../services/user.service');
const { authMw } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rate-limit');
const { sendError } = require('../middleware/error');
const { getClientIp } = require('../utils/validators');
const { signUserJwt } = require('../utils/jwt');

const registerLimiter = createRateLimiter('register', 3, 3600000, 'Quá nhiều lần thử đăng ký, vui lòng thử lại sau 1 giờ');
const loginLimiter = createRateLimiter('login', 10, 900000, 'Quá nhiều lần đăng nhập thất bại. Vui lòng thử lại sau 15 phút');

router.post('/register', registerLimiter, async (req, res, next) => {
  try {
    const result = await userService.registerOwner(req.body);
    return res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.statusCode, err.code, err.message);
    }
    next(err);
  }
});

router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const ip = getClientIp(req);
    const userAgent = req.headers['user-agent'] || '';
    const result = await userService.loginUser({ ...req.body, ip, userAgent });
    return res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.statusCode, err.code, err.message);
    }
    next(err);
  }
});

router.get('/me', authMw, async (req, res, next) => {
  try {
    const result = await userService.getUserMe(req.user);
    return res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.statusCode, err.code, err.message);
    }
    next(err);
  }
});

router.post('/refresh', authMw, (req, res) => {
  const { sub, type, owner_id } = req.user;
  const token = signUserJwt({ sub, type, owner_id });
  return res.status(200).json({ token });
});

module.exports = router;
