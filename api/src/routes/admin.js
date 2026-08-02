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
const upstreamService = require('../services/upstream.service');

const ADMIN_DEFAULT_EMAIL = process.env.ADMIN_DEFAULT_EMAIL || 'admin@clogin.nghemmo.com';
const ADMIN_DEFAULT_PASSWORD = process.env.ADMIN_DEFAULT_PASSWORD || process.env.ADMIN_PASSWORD || 'CloginAdmin2026!';

// ==================== ADMIN AUTH ====================

router.post('/auth/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Thiếu email hoặc mật khẩu');
    }

    let adminUser = await prisma.adminUser.findUnique({ where: { email } });

    const cookieOpts = { httpOnly: true, maxAge: 86400000, path: '/', sameSite: 'none', secure: true };

    // Fallback default super admin
    if (!adminUser && email === ADMIN_DEFAULT_EMAIL && password === ADMIN_DEFAULT_PASSWORD) {
      const token = signAdminJwt({ sub: 'super-admin-root', email: ADMIN_DEFAULT_EMAIL, role: 'super_admin' });
      res.cookie('clogin_admin_token', token, cookieOpts);
      res.cookie('clogin_admin_session', token, cookieOpts);
      return res.status(200).json({
        success: true,
        token,
        admin: { id: 'super-admin-root', email: ADMIN_DEFAULT_EMAIL, name: 'Super Admin', role: 'super_admin' }
      });
    }

    if (!adminUser || !verifyPw(password, adminUser.password_hash)) {
      return sendError(res, 401, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu quản trị không chính xác');
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

    res.cookie('clogin_admin_token', token, cookieOpts);
    res.cookie('clogin_admin_session', token, cookieOpts);

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
      res.cookie('clogin_admin_token', token, { httpOnly: true, maxAge: 86400000, path: '/', sameSite: 'none', secure: true });
      res.cookie('clogin_admin_session', token, { httpOnly: true, maxAge: 86400000, path: '/', sameSite: 'none', secure: true });
      return res.status(200).json({ success: true, token });
    }

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

// ==================== DASHBOARD ====================

router.get('/dashboard/stats', requireRole(['super_admin', 'support', 'viewer']), async (req, res, next) => {
  try {
    const range = req.query.range || req.query.period || '7d';
    const stats = await analyticsService.getDashboardStats(range);
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

// ==================== LICENSES (SPECIFIC ROUTES FIRST) ====================

// Plans
router.get(['/licenses/plans', '/plans'], requireRole(['super_admin', 'support', 'viewer']), async (req, res, next) => {
  try {
    const plans = await systemService.listPlans();
    return res.status(200).json(plans);
  } catch (err) { next(err); }
});

router.post(['/licenses/plans', '/plans'], requireRole(['super_admin']), async (req, res, next) => {
  try {
    const plan = await systemService.createPlan(req.body);
    return res.status(200).json({ data: plan, ...plan });
  } catch (err) { if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message); next(err); }
});

router.put(['/licenses/plans/:id', '/plans/:id'], requireRole(['super_admin']), async (req, res, next) => {
  try {
    const plan = await systemService.updatePlan(req.params.id, req.body);
    return res.status(200).json({ data: plan, ...plan });
  } catch (err) { if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message); next(err); }
});

router.delete(['/licenses/plans/:id', '/plans/:id'], requireRole(['super_admin']), async (req, res, next) => {
  try {
    const result = await systemService.deletePlan(req.params.id);
    return res.status(200).json(result);
  } catch (err) { if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message); next(err); }
});

// Coupons
router.get(['/licenses/coupons', '/coupons'], requireRole(['super_admin', 'support', 'viewer']), async (req, res, next) => {
  try {
    const coupons = await systemService.listCoupons();
    return res.status(200).json(coupons);
  } catch (err) { next(err); }
});

router.post(['/licenses/coupons', '/coupons'], requireRole(['super_admin', 'support']), async (req, res, next) => {
  try {
    const coupon = await systemService.createCoupon(req.body);
    return res.status(200).json({ data: coupon, ...coupon });
  } catch (err) { if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message); next(err); }
});

router.put(['/licenses/coupons/:id', '/coupons/:id'], requireRole(['super_admin', 'support']), async (req, res, next) => {
  try {
    const coupon = await systemService.updateCoupon(req.params.id, req.body);
    return res.status(200).json({ data: coupon, ...coupon });
  } catch (err) { if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message); next(err); }
});

router.delete(['/licenses/coupons/:id', '/coupons/:id'], requireRole(['super_admin', 'support']), async (req, res, next) => {
  try {
    const result = await systemService.deleteCoupon(req.params.id);
    return res.status(200).json(result);
  } catch (err) { if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message); next(err); }
});

// Bulk & Action
router.post('/licenses/bulk-create', requireRole(['super_admin', 'support']), async (req, res, next) => {
  try {
    const result = await licenseService.bulkCreateLicenses(req.body);
    return res.status(200).json(result);
  } catch (err) { if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message); next(err); }
});

router.post('/licenses/bulk-delete', requireRole(['super_admin', 'support']), async (req, res, next) => {
  try {
    const { ids } = req.body;
    if (Array.isArray(ids)) {
      await Promise.all(ids.map(id => licenseService.deleteLicense(id).catch(() => {})));
    }
    return res.status(200).json({ success: true });
  } catch (err) { next(err); }
});

router.post('/licenses/bulk-suspend', requireRole(['super_admin', 'support']), async (req, res, next) => {
  try {
    const { ids, reason } = req.body;
    if (Array.isArray(ids)) {
      await Promise.all(ids.map(id => licenseService.suspendLicense(id, reason).catch(() => {})));
    }
    return res.status(200).json({ success: true });
  } catch (err) { next(err); }
});

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
  } catch (err) { next(err); }
});

// Core License List & ID routes
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
  } catch (err) { next(err); }
});

router.post('/licenses', requireRole(['super_admin', 'support']), async (req, res, next) => {
  try {
    const result = await licenseService.createLicense(req.body);
    return res.status(200).json(result);
  } catch (err) { if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message); next(err); }
});

router.get('/licenses/:id', requireRole(['super_admin', 'support', 'viewer']), async (req, res, next) => {
  try {
    const license = await licenseService.getLicenseById(req.params.id);
    return res.status(200).json({ data: license, license });
  } catch (err) { if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message); next(err); }
});

router.put('/licenses/:id', requireRole(['super_admin', 'support']), async (req, res, next) => {
  try {
    const result = await licenseService.updateLicense(req.params.id, req.body);
    return res.status(200).json(result);
  } catch (err) { if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message); next(err); }
});

router.delete('/licenses/:id', requireRole(['super_admin', 'support']), async (req, res, next) => {
  try {
    const result = await licenseService.deleteLicense(req.params.id);
    return res.status(200).json(result);
  } catch (err) { if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message); next(err); }
});

router.post('/licenses/:id/suspend', requireRole(['super_admin', 'support']), async (req, res, next) => {
  try {
    const result = await licenseService.suspendLicense(req.params.id, req.body.reason);
    return res.status(200).json(result);
  } catch (err) { if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message); next(err); }
});

router.post('/licenses/:id/reactivate', requireRole(['super_admin', 'support']), async (req, res, next) => {
  try {
    const result = await licenseService.reactivateLicense(req.params.id);
    return res.status(200).json(result);
  } catch (err) { if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message); next(err); }
});

router.post('/licenses/:id/extend', requireRole(['super_admin', 'support']), async (req, res, next) => {
  try {
    const result = await licenseService.extendLicense(req.params.id, req.body.days);
    return res.status(200).json(result);
  } catch (err) { if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message); next(err); }
});

router.post('/licenses/:id/reset-devices', requireRole(['super_admin', 'support']), async (req, res, next) => {
  try {
    const result = await licenseService.resetDevices(req.params.id);
    return res.status(200).json(result);
  } catch (err) { if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message); next(err); }
});

router.delete('/licenses/:id/devices/:hwid', requireRole(['super_admin', 'support']), async (req, res, next) => {
  try {
    const result = await licenseService.removeDevice(req.params.id, req.params.hwid);
    return res.status(200).json(result);
  } catch (err) { if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message); next(err); }
});

// ==================== USERS (OWNERS & WORKERS) ====================

// Owners Sub-Routes (SPECIFIC FIRST)
router.get(['/users/owners/:id/workers', '/owners/:id/workers'], requireRole(['super_admin', 'support', 'viewer']), async (req, res, next) => {
  try {
    const workers = await userService.getWorkers(req.params.id);
    return res.status(200).json({ data: workers.workers || [], workers: workers.workers || [] });
  } catch (err) { next(err); }
});

router.get(['/users/owners/:id/profiles', '/owners/:id/profiles'], requireRole(['super_admin', 'support', 'viewer']), async (req, res, next) => {
  try {
    const result = await profileService.listProfilesAdmin({ owner_id: req.params.id, page: 1, perPage: 100 });
    return res.status(200).json({ data: result.profiles || [], profiles: result.profiles || [] });
  } catch (err) { next(err); }
});

router.get(['/users/owners/:id/logins', '/owners/:id/logins'], requireRole(['super_admin', 'support', 'viewer']), async (req, res, next) => {
  try {
    const owner = await userService.getOwnerById(req.params.id);
    const result = await auditService.listLoginHistory({ email: owner.email, page: 1, perPage: 100 });
    return res.status(200).json({ data: result.login_history || [], logins: result.login_history || [] });
  } catch (err) { next(err); }
});

router.post(['/users/owners/:id/reset-password', '/owners/:id/reset-password'], requireRole(['super_admin', 'support']), async (req, res, next) => {
  try {
    const newPassword = req.body.password || req.body.new_password || ('Clogin' + Math.floor(100000 + Math.random() * 900000));
    const result = await userService.resetOwnerPassword(req.params.id, newPassword);
    return res.status(200).json({ ...result, new_password: newPassword });
  } catch (err) { if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message); next(err); }
});

router.post(['/users/owners/:id/toggle-status', '/owners/:id/toggle-status'], requireRole(['super_admin', 'support']), async (req, res, next) => {
  try {
    const owner = await userService.getOwnerById(req.params.id);
    const updated = await userService.updateOwner(req.params.id, { active: !owner.active });
    return res.status(200).json({ data: updated, owner: updated });
  } catch (err) { if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message); next(err); }
});

router.get(['/users/owners', '/owners'], requireRole(['super_admin', 'support', 'viewer']), async (req, res, next) => {
  try {
    const { page, perPage } = parsePagination(req.query);
    const result = await userService.listOwners({ search: req.query.search, page, perPage });
    return res.status(200).json(result);
  } catch (err) { next(err); }
});

router.get(['/users/owners/:id', '/owners/:id'], requireRole(['super_admin', 'support', 'viewer']), async (req, res, next) => {
  try {
    const owner = await userService.getOwnerById(req.params.id);
    return res.status(200).json({ data: owner, owner });
  } catch (err) { if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message); next(err); }
});

router.put(['/users/owners/:id', '/owners/:id'], requireRole(['super_admin', 'support']), async (req, res, next) => {
  try {
    const owner = await userService.updateOwner(req.params.id, req.body);
    return res.status(200).json({ data: owner, owner });
  } catch (err) { if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message); next(err); }
});

router.delete(['/users/owners/:id', '/owners/:id'], requireRole(['super_admin', 'support']), async (req, res, next) => {
  try {
    const result = await userService.deleteOwner(req.params.id);
    return res.status(200).json(result);
  } catch (err) { if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message); next(err); }
});

// Workers Sub-Routes
router.post(['/users/workers/:id/toggle-status', '/workers/:id/toggle-status'], requireRole(['super_admin', 'support']), async (req, res, next) => {
  try {
    const worker = await userService.getWorkerById(req.params.id);
    const updated = await userService.updateWorkerAdmin(req.params.id, { active: !worker.active });
    return res.status(200).json({ data: updated, worker: updated });
  } catch (err) { if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message); next(err); }
});

router.get(['/users/workers', '/workers'], requireRole(['super_admin', 'support', 'viewer']), async (req, res, next) => {
  try {
    const { page, perPage } = parsePagination(req.query);
    const result = await userService.listWorkersAdmin({ search: req.query.search, owner_id: req.query.owner_id, page, perPage });
    return res.status(200).json(result);
  } catch (err) { next(err); }
});

router.get(['/users/workers/:id', '/workers/:id'], requireRole(['super_admin', 'support', 'viewer']), async (req, res, next) => {
  try {
    const worker = await userService.getWorkerById(req.params.id);
    return res.status(200).json({ data: worker, worker });
  } catch (err) { if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message); next(err); }
});

router.put(['/users/workers/:id', '/workers/:id'], requireRole(['super_admin', 'support']), async (req, res, next) => {
  try {
    const worker = await userService.updateWorkerAdmin(req.params.id, req.body);
    return res.status(200).json({ data: worker, worker });
  } catch (err) { if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message); next(err); }
});

router.delete(['/users/workers/:id', '/workers/:id'], requireRole(['super_admin', 'support']), async (req, res, next) => {
  try {
    const result = await userService.deleteWorkerAdmin(req.params.id);
    return res.status(200).json(result);
  } catch (err) { if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message); next(err); }
});

// ==================== PROFILES ====================

router.get('/workspaces', requireRole(['super_admin', 'support', 'viewer']), async (req, res, next) => {
  try {
    const { page = 1, perPage = 20, search } = req.query;
    const skip = (page - 1) * perPage;
    const where = search ? { name: { contains: search, mode: 'insensitive' } } : {};
    const [rows, total] = await Promise.all([
      prisma.workspace.findMany({
        where,
        include: {
          owner: { select: { id: true, email: true, name: true } },
          _count: { select: { members: true, profiles: true, tasks: true, auditEvents: true, sops: true } }
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: perPage
      }),
      prisma.workspace.count({ where })
    ]);
    const workspaces = rows.map(w => ({
      id: w.id,
      name: w.name,
      description: w.description,
      owner_id: w.owner_id,
      owner_email: w.owner ? w.owner.email : '',
      policy_revision: w.policy_revision,
      archived: !!w.archived_at,
      member_count: w._count.members,
      profile_count: w._count.profiles,
      task_count: w._count.tasks,
      audit_count: w._count.auditEvents,
      sop_count: w._count.sops,
      created_at: w.created_at.toISOString(),
      updated_at: w.updated_at.toISOString()
    }));
    return res.status(200).json({ data: workspaces, workspaces, total, page, per_page: perPage, total_pages: Math.ceil(total / perPage) });
  } catch (err) {
    next(err);
  }
});

router.get('/workspaces/:id', requireRole(['super_admin', 'support', 'viewer']), async (req, res, next) => {
  try {
    const ws = await prisma.workspace.findUnique({
      where: { id: req.params.id },
      include: {
        owner: { select: { id: true, email: true } },
        members: { include: { worker: { select: { id: true, email: true, name: true } } } },
        _count: { select: { profiles: true, tasks: true, auditEvents: true, sops: true } }
      }
    });
    if (!ws) return sendError(res, 404, 'NOT_FOUND', 'Workspace không tồn tại');
    return res.status(200).json({
      workspace: {
        id: ws.id,
        name: ws.name,
        owner_email: ws.owner.email,
        policy_revision: ws.policy_revision,
        archived: !!ws.archived_at,
        member_count: ws._count.members,
        profile_count: ws._count.profiles,
        task_count: ws._count.tasks,
        audit_count: ws._count.auditEvents,
        sop_count: ws._count.sops,
        members: ws.members.map(m => ({
          worker_id: m.worker_id,
          email: m.worker.email,
          name: m.worker.name,
          preset_role: m.preset_role,
          capabilities: m.capabilities,
          active: m.active
        }))
      }
    });
  } catch (err) {
    next(err);
  }
});

router.get('/migration/status', requireRole(['super_admin', 'support', 'viewer']), async (req, res, next) => {
  try {
    const owners = await prisma.owner.findMany({ select: { id: true, email: true } });
    const rows = [];
    for (const o of owners) {
      const ws = await prisma.workspace.findFirst({ where: { owner_id: o.id } });
      rows.push({
        owner_id: o.id,
        owner_email: o.email,
        has_default_workspace: !!ws,
        migration_complete: !!ws
      });
    }
    return res.status(200).json({ data: rows, migration: rows });
  } catch (err) {
    next(err);
  }
});

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
  } catch (err) { next(err); }
});

router.post('/profiles/:id/transfer', requireRole(['super_admin', 'support']), async (req, res, next) => {
  try {
    const result = await profileService.transferProfile(req.params.id, req.body.new_owner_id || req.body.owner_id);
    return res.status(200).json(result);
  } catch (err) { if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message); next(err); }
});

router.get('/profiles/:id', requireRole(['super_admin', 'support', 'viewer']), async (req, res, next) => {
  try {
    const profile = await profileService.getProfileByIdAdmin(req.params.id);
    return res.status(200).json({ data: profile, profile });
  } catch (err) { if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message); next(err); }
});

router.delete('/profiles/:id', requireRole(['super_admin', 'support']), async (req, res, next) => {
  try {
    const result = await profileService.deleteProfileAdmin(req.params.id);
    return res.status(200).json(result);
  } catch (err) { if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message); next(err); }
});

// ==================== AUDIT & SECURITY ====================

router.get(['/audit/logs', '/audit'], requireRole(['super_admin', 'support', 'viewer']), async (req, res, next) => {
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
  } catch (err) { next(err); }
});

router.get(['/audit/logins', '/login-history'], requireRole(['super_admin', 'support', 'viewer']), async (req, res, next) => {
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
  } catch (err) { next(err); }
});

router.get('/security/suspicious', requireRole(['super_admin', 'support', 'viewer']), async (req, res, next) => {
  try {
    const result = await auditService.getSuspiciousLogins();
    return res.status(200).json(result);
  } catch (err) { next(err); }
});

router.get(['/security/blocked-ips', '/security/ip-blocks'], requireRole(['super_admin', 'support', 'viewer']), async (req, res, next) => {
  try {
    const result = await auditService.listIpBlocks();
    return res.status(200).json(result);
  } catch (err) { next(err); }
});

router.post(['/security/blocked-ips', '/security/ip-block'], requireRole(['super_admin', 'support']), async (req, res, next) => {
  try {
    const result = await auditService.addIpBlock(req.body);
    return res.status(200).json({ data: result, ...result });
  } catch (err) { if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message); next(err); }
});

router.delete(['/security/blocked-ips/:ip', '/security/ip-block/:ip'], requireRole(['super_admin', 'support']), async (req, res, next) => {
  try {
    const result = await auditService.removeIpBlock(req.params.ip);
    return res.status(200).json(result);
  } catch (err) { if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message); next(err); }
});

// ==================== RELEASES ====================

router.get('/releases', requireRole(['super_admin', 'support', 'viewer']), async (req, res, next) => {
  try {
    const result = await releaseService.listReleases();
    return res.status(200).json(result);
  } catch (err) { next(err); }
});

router.post('/releases', requireRole(['super_admin']), async (req, res, next) => {
  try {
    const release = await releaseService.createRelease(req.body);
    return res.status(200).json(release);
  } catch (err) { if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message); next(err); }
});

router.post('/releases/import-github', requireRole(['super_admin']), async (req, res, next) => {
  try {
    const result = await releaseService.importGitHubRelease(req.body);
    return res.status(200).json(result);
  } catch (err) { if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message); next(err); }
});

router.post('/releases/:id/build', requireRole(['super_admin']), async (req, res, next) => {
  try {
    const result = await releaseService.startBuild(req.params.id);
    return res.status(202).json(result);
  } catch (err) { if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message); next(err); }
});

router.get('/releases/updater-signing', requireRole(['super_admin']), async (req, res, next) => {
  try {
    const result = await releaseService.getUpdaterSigningStatus();
    return res.status(200).json(result);
  } catch (err) { if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message); next(err); }
});

router.put('/releases/updater-signing', requireRole(['super_admin']), async (req, res, next) => {
  try {
    const result = await releaseService.configureUpdaterSigning(req.body);
    return res.status(200).json(result);
  } catch (err) { if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message); next(err); }
});

router.get('/releases/:id/build-status', requireRole(['super_admin', 'support', 'viewer']), async (req, res, next) => {
  try {
    const release = await releaseService.getBuildStatus(req.params.id);
    return res.status(200).json(release);
  } catch (err) { if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message); next(err); }
});

router.post('/releases/:id/publish', requireRole(['super_admin']), async (req, res, next) => {
  try {
    const release = await releaseService.publishRelease(req.params.id);
    return res.status(200).json(release);
  } catch (err) { if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message); next(err); }
});

router.get('/releases/:id', requireRole(['super_admin', 'support', 'viewer']), async (req, res, next) => {
  try {
    const release = await prisma.release.findUnique({ where: { id: req.params.id } });
    if (!release) return sendError(res, 404, 'NOT_FOUND', 'Release không tồn tại');
    return res.status(200).json({ data: release, release });
  } catch (err) { next(err); }
});

router.put('/releases/:id', requireRole(['super_admin']), async (req, res, next) => {
  try {
    const release = await releaseService.updateRelease(req.params.id, req.body);
    return res.status(200).json(release);
  } catch (err) { if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message); next(err); }
});

router.delete('/releases/:id', requireRole(['super_admin']), async (req, res, next) => {
  try {
    const result = await releaseService.deleteRelease(req.params.id);
    return res.status(200).json(result);
  } catch (err) { if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message); next(err); }
});

// ==================== ANNOUNCEMENTS ====================

router.get('/announcements', requireRole(['super_admin', 'support', 'viewer']), async (req, res, next) => {
  try {
    const announcements = await systemService.listAnnouncements();
    return res.status(200).json(announcements);
  } catch (err) { next(err); }
});

router.post('/announcements', requireRole(['super_admin', 'support']), async (req, res, next) => {
  try {
    const announcement = await systemService.createAnnouncement(req.body);
    return res.status(200).json(announcement);
  } catch (err) { if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message); next(err); }
});

router.put('/announcements/:id', requireRole(['super_admin', 'support']), async (req, res, next) => {
  try {
    const announcement = await systemService.updateAnnouncement(req.params.id, req.body);
    return res.status(200).json(announcement);
  } catch (err) { if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message); next(err); }
});

router.delete('/announcements/:id', requireRole(['super_admin', 'support']), async (req, res, next) => {
  try {
    const result = await systemService.deleteAnnouncement(req.params.id);
    return res.status(200).json(result);
  } catch (err) { if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message); next(err); }
});

// ==================== SETTINGS (ADMINS, FEATURE FLAGS, CONFIG) ====================

// Admin Users
router.get(['/settings/admins', '/admin-users'], requireRole(['super_admin']), async (req, res, next) => {
  try {
    const result = await systemService.listAdminUsers();
    return res.status(200).json(result);
  } catch (err) { next(err); }
});

router.post(['/settings/admins', '/admin-users'], requireRole(['super_admin']), async (req, res, next) => {
  try {
    const user = await systemService.createAdminUser(req.body);
    return res.status(200).json({ data: user, ...user });
  } catch (err) { if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message); next(err); }
});

router.put(['/settings/admins/:id', '/admin-users/:id'], requireRole(['super_admin']), async (req, res, next) => {
  try {
    const user = await systemService.updateAdminUser(req.params.id, req.body);
    return res.status(200).json({ data: user, ...user });
  } catch (err) { if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message); next(err); }
});

router.delete(['/settings/admins/:id', '/admin-users/:id'], requireRole(['super_admin']), async (req, res, next) => {
  try {
    const result = await systemService.deleteAdminUser(req.params.id);
    return res.status(200).json(result);
  } catch (err) { if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message); next(err); }
});

// Feature Flags
router.get(['/settings/feature-flags', '/feature-flags'], requireRole(['super_admin', 'viewer']), async (req, res, next) => {
  try {
    const result = await systemService.listFeatureFlags();
    return res.status(200).json(result);
  } catch (err) { next(err); }
});

router.post(['/settings/feature-flags', '/feature-flags'], requireRole(['super_admin']), async (req, res, next) => {
  try {
    const flag = await systemService.createFeatureFlag(req.body);
    return res.status(200).json({ data: flag, ...flag });
  } catch (err) { if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message); next(err); }
});

router.put(['/settings/feature-flags/:id', '/feature-flags/:id'], requireRole(['super_admin']), async (req, res, next) => {
  try {
    const flag = await systemService.updateFeatureFlag(req.params.id, req.body);
    return res.status(200).json({ data: flag, ...flag });
  } catch (err) { if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message); next(err); }
});

router.delete(['/settings/feature-flags/:id', '/feature-flags/:id'], requireRole(['super_admin']), async (req, res, next) => {
  try {
    const result = await systemService.deleteFeatureFlag(req.params.id);
    return res.status(200).json(result);
  } catch (err) { if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message); next(err); }
});

// System Config
router.get(['/settings/config', '/config'], requireRole(['super_admin', 'viewer']), async (req, res, next) => {
  try {
    const config = await systemService.getConfig();
    return res.status(200).json({ data: config, config });
  } catch (err) { next(err); }
});

router.put(['/settings/config', '/config'], requireRole(['super_admin']), async (req, res, next) => {
  try {
    const config = await systemService.updateConfig(req.body);
    return res.status(200).json({ data: config, config });
  } catch (err) { if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message); next(err); }
});

// ==================== UPSTREAM SYNC ====================

router.get('/upstream/config', requireRole(['super_admin', 'viewer']), async (req, res, next) => {
  try {
    const config = await upstreamService.getConfig();
    return res.status(200).json({ data: config, ...config });
  } catch (err) { next(err); }
});

router.put('/upstream/config', requireRole(['super_admin']), async (req, res, next) => {
  try {
    const config = await upstreamService.updateConfig(req.body);
    return res.status(200).json({ data: config, ...config });
  } catch (err) { if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message); next(err); }
});

router.get('/upstream/status', requireRole(['super_admin', 'support', 'viewer']), async (req, res, next) => {
  try {
    const status = await upstreamService.getUpstreamStatus();
    return res.status(200).json(status);
  } catch (err) { next(err); }
});

router.get('/upstream/commits', requireRole(['super_admin', 'support', 'viewer']), async (req, res, next) => {
  try {
    const commits = await upstreamService.listUpstreamCommits();
    return res.status(200).json(commits);
  } catch (err) { if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message); next(err); }
});

router.post('/upstream/create-pr', requireRole(['super_admin']), async (req, res, next) => {
  try {
    const result = await upstreamService.createSyncPullRequest();
    return res.status(200).json(result);
  } catch (err) { if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message); next(err); }
});

router.post('/upstream/trigger-release', requireRole(['super_admin']), async (req, res, next) => {
  try {
    const result = await upstreamService.triggerReleaseWorkflow();
    return res.status(200).json(result);
  } catch (err) { if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message); next(err); }
});

module.exports = router;
