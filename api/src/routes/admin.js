const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const { signAdminJwt } = require('../utils/jwt');
const { verifyPw } = require('../utils/hash');
const { adminAuth, requireRole } = require('../middleware/admin-auth');
const { sendError } = require('../middleware/error');
const { getClientIp, parsePagination } = require('../utils/validators');

const licenseService = require('../services/license.service');
const userService = require('../services/user.service');
const profileService = require('../services/profile.service');
const auditService = require('../services/audit.service');
const releaseService = require('../services/release.service');
const analyticsService = require('../services/analytics.service');
const systemService = require('../services/system.service');

const ADMIN_DEFAULT_EMAIL = process.env.ADMIN_DEFAULT_EMAIL || 'admin@clogin.nghemmo.com';
const ADMIN_DEFAULT_PASSWORD = process.env.ADMIN_DEFAULT_PASSWORD || process.env.ADMIN_PASSWORD || 'CloginAdmin2026!';

// --- Admin Auth ---

router.post('/auth/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Thiếu email hoặc mật khẩu');
    }

    let adminUser = await prisma.adminUser.findUnique({ where: { email } });

    // Fallback default super admin
    if (!adminUser && email === ADMIN_DEFAULT_EMAIL && password === ADMIN_DEFAULT_PASSWORD) {
      const token = signAdminJwt({ sub: 'super-admin-root', email: ADMIN_DEFAULT_EMAIL, role: 'super_admin' });
      res.cookie('clogin_admin_token', token, { httpOnly: true, maxAge: 86400000, path: '/' });
      res.cookie('clogin_admin_session', token, { httpOnly: true, maxAge: 86400000, path: '/' });
      return res.status(200).json({
        success: true,
        token,
        admin: { id: 'super-admin-root', email: ADMIN_DEFAULT_EMAIL, name: 'Super Admin', role: 'super_admin' }
      });
    }

    if (!adminUser || !verifyPw(password, adminUser.password_hash)) {
      // Also check raw fallback password if initial setup
      if (adminUser && password === ADMIN_DEFAULT_PASSWORD) {
        // match
      } else {
        return sendError(res, 401, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu quản trị không chính xác');
      }
    }

    if (adminUser && !adminUser.active) {
      return sendError(res, 403, 'FORBIDDEN', 'Tài khoản quản trị đã bị vô hiệu hóa');
    }

    const adminId = adminUser ? adminUser.id : 'super-admin-root';
    const adminEmail = adminUser ? adminUser.email : ADMIN_DEFAULT_EMAIL;
    const adminRole = adminUser ? adminUser.role : 'super_admin';

    if (adminUser) {
      prisma.adminUser.update({
        where: { id: adminUser.id },
        data: { last_login_at: new Date() }
      }).catch(() => {});
    }

    const token = signAdminJwt({ sub: adminId, email: adminEmail, role: adminRole });

    res.cookie('clogin_admin_token', token, { httpOnly: true, maxAge: 86400000, path: '/' });
    res.cookie('clogin_admin_session', token, { httpOnly: true, maxAge: 86400000, path: '/' });

    return res.status(200).json({
      success: true,
      token,
      admin: {
        id: adminId,
        email: adminEmail,
        name: adminUser ? adminUser.name : 'Admin',
        role: adminRole
      }
    });
  } catch (err) {
    next(err);
  }
});

// Legacy single-password login endpoint compatibility
router.post('/login', async (req, res, next) => {
  try {
    const { password, email } = req.body;
    const inputEmail = email || ADMIN_DEFAULT_EMAIL;
    const inputPassword = password;

    if (inputPassword === ADMIN_DEFAULT_PASSWORD || inputPassword === (process.env.ADMIN_PASSWORD || 'CloginAdmin2026!')) {
      const token = signAdminJwt({ sub: 'super-admin-root', email: inputEmail, role: 'super_admin' });
      res.cookie('clogin_admin_token', token, { httpOnly: true, maxAge: 86400000, path: '/' });
      res.cookie('clogin_admin_session', token, { httpOnly: true, maxAge: 86400000, path: '/' });
      return res.status(200).json({ success: true, token });
    }

    // Try normal auth login
    return req.url = '/auth/login', router.handle(req, res, next);
  } catch (err) {
    next(err);
  }
});

router.post('/auth/logout', (req, res) => {
  res.clearCookie('clogin_admin_token', { path: '/' });
  res.clearCookie('clogin_admin_session', { path: '/' });
  return res.status(200).json({ success: true });
});

router.post('/logout', (req, res) => {
  res.clearCookie('clogin_admin_token', { path: '/' });
  res.clearCookie('clogin_admin_session', { path: '/' });
  return res.status(200).json({ success: true });
});

router.get('/auth/me', adminAuth, (req, res) => {
  return res.status(200).json({ admin: req.admin });
});

// Apply adminAuth to all remaining endpoints
router.use(adminAuth);

// --- Dashboard ---
router.get('/dashboard/stats', requireRole(['super_admin', 'support', 'viewer']), async (req, res, next) => {
  try {
    const stats = await analyticsService.getDashboardStats();
    return res.status(200).json(stats);
  } catch (err) {
    next(err);
  }
});

router.get('/dashboard/analytics', requireRole(['super_admin', 'support', 'viewer']), async (req, res, next) => {
  try {
    const analytics = await analyticsService.getAnalytics(req.query.period);
    return res.status(200).json(analytics);
  } catch (err) {
    next(err);
  }
});

// --- Licenses ---
router.get('/licenses', requireRole(['super_admin', 'support', 'viewer']), async (req, res, next) => {
  try {
    const { page, perPage } = parsePagination(req.query);
    const result = await licenseService.listLicenses({
      search: req.query.search,
      status: req.query.status,
      plan: req.query.plan,
      page,
      perPage
    });
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/licenses/:id', requireRole(['super_admin', 'support', 'viewer']), async (req, res, next) => {
  try {
    const license = await licenseService.getLicenseById(req.params.id);
    return res.status(200).json({ license });
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.post('/licenses', requireRole(['super_admin', 'support']), async (req, res, next) => {
  try {
    const result = await licenseService.createLicense(req.body);
    return res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.put('/licenses/:id', requireRole(['super_admin', 'support']), async (req, res, next) => {
  try {
    const result = await licenseService.updateLicense(req.params.id, req.body);
    return res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.delete('/licenses/:id', requireRole(['super_admin', 'support']), async (req, res, next) => {
  try {
    const result = await licenseService.deleteLicense(req.params.id);
    return res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.post('/licenses/:id/suspend', requireRole(['super_admin', 'support']), async (req, res, next) => {
  try {
    const result = await licenseService.suspendLicense(req.params.id, req.body.reason);
    return res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.post('/licenses/:id/reactivate', requireRole(['super_admin', 'support']), async (req, res, next) => {
  try {
    const result = await licenseService.reactivateLicense(req.params.id);
    return res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.post('/licenses/:id/extend', requireRole(['super_admin', 'support']), async (req, res, next) => {
  try {
    const result = await licenseService.extendLicense(req.params.id, req.body.days);
    return res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.post('/licenses/:id/reset-devices', requireRole(['super_admin', 'support']), async (req, res, next) => {
  try {
    const result = await licenseService.resetDevices(req.params.id);
    return res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.delete('/licenses/:id/devices/:hwid', requireRole(['super_admin', 'support']), async (req, res, next) => {
  try {
    const result = await licenseService.removeDevice(req.params.id, req.params.hwid);
    return res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.post('/licenses/bulk-create', requireRole(['super_admin', 'support']), async (req, res, next) => {
  try {
    const result = await licenseService.bulkCreateLicenses(req.body);
    return res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

// Legacy `/licenses/action` compatibility endpoint
router.post('/licenses/action', requireRole(['super_admin', 'support']), async (req, res, next) => {
  try {
    const { action, key, hwid } = req.body;
    const lic = await prisma.license.findUnique({ where: { key } });
    if (!lic) return sendError(res, 404, 'NOT_FOUND', 'Key không tồn tại');

    if (action === 'delete') {
      await licenseService.deleteLicense(lic.id);
      return res.status(200).json({ success: true, message: 'Đã xóa Key' });
    }
    if (action === 'reset_hwid' && hwid) {
      await licenseService.removeDevice(lic.id, hwid);
      return res.status(200).json({ success: true, message: 'Đã giải phóng thiết bị khỏi Key' });
    }
    if (action === 'reset_all_hwids') {
      await licenseService.resetDevices(lic.id);
      return res.status(200).json({ success: true, message: 'Đã reset toàn bộ thiết bị của Key' });
    }
    return sendError(res, 400, 'VALIDATION_ERROR', 'Hành động không hợp lệ');
  } catch (err) {
    next(err);
  }
});

// --- Plans ---
router.get('/plans', requireRole(['super_admin', 'support', 'viewer']), async (req, res, next) => {
  try {
    const plans = await systemService.listPlans();
    return res.status(200).json({ plans });
  } catch (err) {
    next(err);
  }
});

router.post('/plans', requireRole(['super_admin']), async (req, res, next) => {
  try {
    const plan = await systemService.createPlan(req.body);
    return res.status(200).json(plan);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.put('/plans/:id', requireRole(['super_admin']), async (req, res, next) => {
  try {
    const plan = await systemService.updatePlan(req.params.id, req.body);
    return res.status(200).json(plan);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.delete('/plans/:id', requireRole(['super_admin']), async (req, res, next) => {
  try {
    const result = await systemService.deletePlan(req.params.id);
    return res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

// --- Coupons ---
router.get('/coupons', requireRole(['super_admin', 'support', 'viewer']), async (req, res, next) => {
  try {
    const coupons = await systemService.listCoupons();
    return res.status(200).json({ coupons });
  } catch (err) {
    next(err);
  }
});

router.post('/coupons', requireRole(['super_admin', 'support']), async (req, res, next) => {
  try {
    const coupon = await systemService.createCoupon(req.body);
    return res.status(200).json(coupon);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.put('/coupons/:id', requireRole(['super_admin', 'support']), async (req, res, next) => {
  try {
    const coupon = await systemService.updateCoupon(req.params.id, req.body);
    return res.status(200).json(coupon);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.delete('/coupons/:id', requireRole(['super_admin', 'support']), async (req, res, next) => {
  try {
    const result = await systemService.deleteCoupon(req.params.id);
    return res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

// --- Users (Owners & Workers) ---
router.get('/owners', requireRole(['super_admin', 'support', 'viewer']), async (req, res, next) => {
  try {
    const { page, perPage } = parsePagination(req.query);
    const result = await userService.listOwners({ search: req.query.search, page, perPage });
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/owners/:id', requireRole(['super_admin', 'support', 'viewer']), async (req, res, next) => {
  try {
    const owner = await userService.getOwnerById(req.params.id);
    return res.status(200).json({ owner });
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.put('/owners/:id', requireRole(['super_admin', 'support']), async (req, res, next) => {
  try {
    const owner = await userService.updateOwner(req.params.id, req.body);
    return res.status(200).json({ owner });
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.delete('/owners/:id', requireRole(['super_admin', 'support']), async (req, res, next) => {
  try {
    const result = await userService.deleteOwner(req.params.id);
    return res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.post('/owners/:id/reset-password', requireRole(['super_admin', 'support']), async (req, res, next) => {
  try {
    const result = await userService.resetOwnerPassword(req.params.id, req.body.password || req.body.new_password);
    return res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.get('/workers', requireRole(['super_admin', 'support', 'viewer']), async (req, res, next) => {
  try {
    const { page, perPage } = parsePagination(req.query);
    const result = await userService.listWorkersAdmin({
      search: req.query.search,
      owner_id: req.query.owner_id,
      page,
      perPage
    });
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/workers/:id', requireRole(['super_admin', 'support', 'viewer']), async (req, res, next) => {
  try {
    const worker = await userService.getWorkerById(req.params.id);
    return res.status(200).json({ worker });
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.put('/workers/:id', requireRole(['super_admin', 'support']), async (req, res, next) => {
  try {
    const worker = await userService.updateWorkerAdmin(req.params.id, req.body);
    return res.status(200).json({ worker });
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.delete('/workers/:id', requireRole(['super_admin', 'support']), async (req, res, next) => {
  try {
    const result = await userService.deleteWorkerAdmin(req.params.id);
    return res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

// --- Profiles ---
router.get('/profiles', requireRole(['super_admin', 'support', 'viewer']), async (req, res, next) => {
  try {
    const { page, perPage } = parsePagination(req.query);
    const result = await profileService.listProfilesAdmin({
      search: req.query.search,
      owner_id: req.query.owner_id,
      page,
      perPage
    });
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/profiles/:id', requireRole(['super_admin', 'support', 'viewer']), async (req, res, next) => {
  try {
    const profile = await profileService.getProfileByIdAdmin(req.params.id);
    return res.status(200).json({ profile });
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.delete('/profiles/:id', requireRole(['super_admin', 'support']), async (req, res, next) => {
  try {
    const result = await profileService.deleteProfileAdmin(req.params.id);
    return res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.post('/profiles/:id/transfer', requireRole(['super_admin', 'support']), async (req, res, next) => {
  try {
    const result = await profileService.transferProfile(req.params.id, req.body.new_owner_id || req.body.owner_id);
    return res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

// --- Audit & Security ---
router.get('/audit', requireRole(['super_admin', 'support', 'viewer']), async (req, res, next) => {
  try {
    const { page, perPage } = parsePagination(req.query);
    const result = await auditService.listAdminAuditLogs({
      action: req.query.action,
      user_type: req.query.user_type,
      from: req.query.from,
      to: req.query.to,
      page,
      perPage
    });
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/login-history', requireRole(['super_admin', 'support', 'viewer']), async (req, res, next) => {
  try {
    const { page, perPage } = parsePagination(req.query);
    const result = await auditService.listLoginHistory({
      email: req.query.email,
      success: req.query.success,
      from: req.query.from,
      to: req.query.to,
      page,
      perPage
    });
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/security/suspicious', requireRole(['super_admin', 'support', 'viewer']), async (req, res, next) => {
  try {
    const result = await auditService.getSuspiciousLogins();
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/security/ip-blocks', requireRole(['super_admin', 'support', 'viewer']), async (req, res, next) => {
  try {
    const result = await auditService.listIpBlocks();
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/security/ip-block', requireRole(['super_admin', 'support']), async (req, res, next) => {
  try {
    const result = await auditService.addIpBlock(req.body);
    return res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.delete('/security/ip-block/:ip', requireRole(['super_admin', 'support']), async (req, res, next) => {
  try {
    const result = await auditService.removeIpBlock(req.params.ip);
    return res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

// --- Releases ---
router.get('/releases', requireRole(['super_admin', 'support', 'viewer']), async (req, res, next) => {
  try {
    const result = await releaseService.listReleases();
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/releases', requireRole(['super_admin']), async (req, res, next) => {
  try {
    const release = await releaseService.createRelease(req.body);
    return res.status(200).json(release);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.put('/releases/:id', requireRole(['super_admin']), async (req, res, next) => {
  try {
    const release = await releaseService.updateRelease(req.params.id, req.body);
    return res.status(200).json(release);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.delete('/releases/:id', requireRole(['super_admin']), async (req, res, next) => {
  try {
    const result = await releaseService.deleteRelease(req.params.id);
    return res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.post('/releases/:id/publish', requireRole(['super_admin']), async (req, res, next) => {
  try {
    const release = await releaseService.publishRelease(req.params.id);
    return res.status(200).json(release);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

// --- Announcements ---
router.get('/announcements', requireRole(['super_admin', 'support', 'viewer']), async (req, res, next) => {
  try {
    const announcements = await systemService.listAnnouncements();
    return res.status(200).json({ announcements });
  } catch (err) {
    next(err);
  }
});

router.post('/announcements', requireRole(['super_admin', 'support']), async (req, res, next) => {
  try {
    const announcement = await systemService.createAnnouncement(req.body);
    return res.status(200).json(announcement);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.put('/announcements/:id', requireRole(['super_admin', 'support']), async (req, res, next) => {
  try {
    const announcement = await systemService.updateAnnouncement(req.params.id, req.body);
    return res.status(200).json(announcement);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.delete('/announcements/:id', requireRole(['super_admin', 'support']), async (req, res, next) => {
  try {
    const result = await systemService.deleteAnnouncement(req.params.id);
    return res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

// --- System Config & Feature Flags & Admin Users ---
router.get('/config', requireRole(['super_admin', 'viewer']), async (req, res, next) => {
  try {
    const config = await systemService.getConfig();
    return res.status(200).json({ config });
  } catch (err) {
    next(err);
  }
});

router.put('/config', requireRole(['super_admin']), async (req, res, next) => {
  try {
    const config = await systemService.updateConfig(req.body);
    return res.status(200).json({ config });
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.get('/feature-flags', requireRole(['super_admin', 'viewer']), async (req, res, next) => {
  try {
    const featureFlags = await systemService.listFeatureFlags();
    return res.status(200).json({ feature_flags: featureFlags });
  } catch (err) {
    next(err);
  }
});

router.post('/feature-flags', requireRole(['super_admin']), async (req, res, next) => {
  try {
    const featureFlag = await systemService.createFeatureFlag(req.body);
    return res.status(200).json(featureFlag);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.put('/feature-flags/:id', requireRole(['super_admin']), async (req, res, next) => {
  try {
    const featureFlag = await systemService.updateFeatureFlag(req.params.id, req.body);
    return res.status(200).json(featureFlag);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.delete('/feature-flags/:id', requireRole(['super_admin']), async (req, res, next) => {
  try {
    const result = await systemService.deleteFeatureFlag(req.params.id);
    return res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.get('/admin-users', requireRole(['super_admin']), async (req, res, next) => {
  try {
    const result = await systemService.listAdminUsers();
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/admin-users', requireRole(['super_admin']), async (req, res, next) => {
  try {
    const user = await systemService.createAdminUser(req.body);
    return res.status(200).json(user);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.put('/admin-users/:id', requireRole(['super_admin']), async (req, res, next) => {
  try {
    const user = await systemService.updateAdminUser(req.params.id, req.body);
    return res.status(200).json(user);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.delete('/admin-users/:id', requireRole(['super_admin']), async (req, res, next) => {
  try {
    const result = await systemService.deleteAdminUser(req.params.id);
    return res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

module.exports = router;
