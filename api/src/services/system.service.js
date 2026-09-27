const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { hashPw } = require('../utils/hash');

class SystemService {
  // --- License Plans ---
  async listPlans() {
    const plans = await prisma.licensePlan.findMany({
      orderBy: { sort_order: 'asc' }
    });
    const formatted = plans.map(p => ({
      ...p,
      price: p.price_vnd,
      price_vnd: p.price_vnd
    }));
    return { data: formatted, plans: formatted };
  }

  async createPlan(data) {
    if (!data.name || !data.slug) {
      throw { statusCode: 400, code: 'VALIDATION_ERROR', message: 'Thiếu name hoặc slug cho gói dịch vụ' };
    }
    const createData = { ...data };
    if (createData.price !== undefined && createData.price_vnd === undefined) {
      createData.price_vnd = parseInt(createData.price) || 0;
    }
    delete createData.price;
    return prisma.licensePlan.create({ data: createData });
  }

  async updatePlan(id, data) {
    const updateData = { ...data };
    if (updateData.price !== undefined && updateData.price_vnd === undefined) {
      updateData.price_vnd = parseInt(updateData.price) || 0;
    }
    delete updateData.price;
    return prisma.licensePlan.update({
      where: { id },
      data: updateData
    });
  }

  async deletePlan(id) {
    await prisma.licensePlan.delete({ where: { id } });
    return { success: true };
  }

  // --- Coupons ---
  async listCoupons() {
    const coupons = await prisma.coupon.findMany({
      orderBy: { created_at: 'desc' }
    });

    const planIds = coupons.map(c => c.plan_id).filter(Boolean);
    const plans = planIds.length > 0 ? await prisma.licensePlan.findMany({ where: { id: { in: planIds } } }) : [];
    const planMap = new Map(plans.map(p => [p.id, p.name]));

    const formatted = coupons.map(c => ({
      ...c,
      plan_name: c.plan_id ? (planMap.get(c.plan_id) || 'Không xác định') : 'Tất cả các gói'
    }));

    return { data: formatted, coupons: formatted };
  }

  async createCoupon(data) {
    if (!data.code) {
      throw { statusCode: 400, code: 'VALIDATION_ERROR', message: 'Thiếu mã giảm giá (code)' };
    }
    return prisma.coupon.create({
      data: {
        code: data.code.toUpperCase(),
        discount_percent: data.discount_percent || 0,
        plan_id: data.plan_id,
        max_uses: data.max_uses || 1,
        expires_at: data.expires_at ? new Date(data.expires_at) : null
      }
    });
  }

  async updateCoupon(id, data) {
    return prisma.coupon.update({
      where: { id },
      data: {
        discount_percent: data.discount_percent,
        max_uses: data.max_uses,
        active: data.active,
        expires_at: data.expires_at ? new Date(data.expires_at) : null
      }
    });
  }

  async deleteCoupon(id) {
    await prisma.coupon.delete({ where: { id } });
    return { success: true };
  }

  // --- Announcements ---
  async getActiveAnnouncements() {
    const now = new Date();
    return prisma.announcement.findMany({
      where: {
        active: true,
        starts_at: { lte: now },
        OR: [
          { ends_at: null },
          { ends_at: { gte: now } }
        ]
      },
      orderBy: { created_at: 'desc' }
    });
  }

  async listAnnouncements() {
    const announcements = await prisma.announcement.findMany({
      orderBy: { created_at: 'desc' }
    });
    return { data: announcements, announcements };
  }

  async createAnnouncement(data) {
    if (!data.title || !data.body) {
      throw { statusCode: 400, code: 'VALIDATION_ERROR', message: 'Thiếu title hoặc body thông báo' };
    }
    return prisma.announcement.create({
      data: {
        title: data.title,
        body: data.body,
        type: data.type || 'info',
        target: data.target || 'all',
        active: data.active !== undefined ? data.active : true,
        starts_at: data.starts_at ? new Date(data.starts_at) : new Date(),
        ends_at: data.ends_at ? new Date(data.ends_at) : null
      }
    });
  }

  async updateAnnouncement(id, data) {
    return prisma.announcement.update({
      where: { id },
      data: {
        title: data.title,
        body: data.body,
        type: data.type,
        target: data.target,
        active: data.active,
        starts_at: data.starts_at ? new Date(data.starts_at) : undefined,
        ends_at: data.ends_at ? new Date(data.ends_at) : null
      }
    });
  }

  async deleteAnnouncement(id) {
    await prisma.announcement.delete({ where: { id } });
    return { success: true };
  }

  // --- Feature Flags ---
  async getActiveFeatureFlags() {
    return prisma.featureFlag.findMany({
      where: { enabled: true }
    });
  }

  async listFeatureFlags() {
    const featureFlags = await prisma.featureFlag.findMany({
      orderBy: { created_at: 'desc' }
    });
    return { data: featureFlags, feature_flags: featureFlags };
  }

  async createFeatureFlag(data) {
    if (!data.key || !data.name) {
      throw { statusCode: 400, code: 'VALIDATION_ERROR', message: 'Thiếu key hoặc name feature flag' };
    }
    return prisma.featureFlag.create({
      data: {
        key: data.key,
        name: data.name,
        description: data.description || '',
        enabled: data.enabled !== undefined ? data.enabled : true,
        target_plans: data.target_plans || []
      }
    });
  }

  async updateFeatureFlag(id, data) {
    return prisma.featureFlag.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        enabled: data.enabled,
        target_plans: data.target_plans
      }
    });
  }

  async deleteFeatureFlag(id) {
    await prisma.featureFlag.delete({ where: { id } });
    return { success: true };
  }

  // --- System Config ---
  // Chỉ cho phép ghi các key cấu hình đã biết. Trước đây upsert BẤT KỲ key
  // nào client gửi → kể cả 'upstream_sync_config' chứa GitHub PAT (ghi đè
  // token), chỉ cần quyền admin thường.
  static CONFIG_KEYS = [
    'upstream_sync_config',
    'app_settings',
    'telemetry_config',
    'registration_enabled',
    'maintenance_mode',
    'maintenance_message',
    'jwt_expiry',
    'rate_limit_login',
    'rate_limit_api'
  ];

  // Key chứa secret — không bao giờ trả raw về client.
  static SENSITIVE_CONFIG_KEYS = ['upstream_sync_config'];

  // Mask secret trong response. Generic /v1/admin/settings/config trả MỌI
  // row system_config, từng bao gồm github_token nguyên văn (kể cả cho role
  // viewer) — C5.
  static sanitizeConfig(configMap) {
    const out = { ...configMap };
    for (const key of SystemService.SENSITIVE_CONFIG_KEYS) {
      const val = out[key];
      if (val && typeof val === 'object' && val.github_token) {
        const token = String(val.github_token);
        out[key] = {
          ...val,
          github_token: token.length > 8 ? `${token.slice(0, 4)}…${token.slice(-4)}` : '****',
          github_token_configured: true
        };
      } else if (val && typeof val === 'object') {
        out[key] = { ...val, github_token_configured: false };
      }
    }
    return out;
  }

  async getConfig() {
    const configs = await prisma.systemConfig.findMany();
    const configMap = {};
    configs.forEach(c => {
      configMap[c.key] = c.value;
    });
    return SystemService.sanitizeConfig(configMap);
  }

  async updateConfig(keyValues) {
    if (!keyValues || typeof keyValues !== 'object' || Array.isArray(keyValues)) {
      throw { statusCode: 400, code: 'VALIDATION_ERROR', message: 'Cấu hình không hợp lệ' };
    }
    const rejected = Object.keys(keyValues).filter((key) => !SystemService.CONFIG_KEYS.includes(key));
    if (rejected.length > 0) {
      throw {
        statusCode: 400,
        code: 'CONFIG_KEY_NOT_ALLOWED',
        message: `Key cấu hình không được phép: ${rejected.join(', ')}`
      };
    }
    const operations = Object.entries(keyValues).map(async ([key, value]) => {
      // Token nhạy cảm: portal Settings gửi lại CẢ object config vừa đọc —
      // trong đó github_token đã bị mask. Nếu ghi đè bằng giá trị mask thì
      // token thật mất. Token mask (chứa '…' hoặc '****') = chưa nhập mới
      // → giữ nguyên token hiện tại trong DB.
      let nextValue = value;
      if (key === 'upstream_sync_config' && value && typeof value === 'object') {
        const current = await prisma.systemConfig.findUnique({ where: { key } });
        const currentVal = (current && current.value) || {};
        const token = value.github_token;
        if (token === undefined || token === '' || token === '****' || String(token).includes('…')) {
          nextValue = { ...value, github_token: currentVal.github_token };
        }
      }
      return prisma.systemConfig.upsert({
        where: { key },
        update: { value: nextValue, updated_at: new Date() },
        create: { key, value: nextValue }
      });
    });
    await Promise.all(operations);
    return this.getConfig();
  }

  // --- Admin Users ---
  async listAdminUsers() {
    const users = await prisma.adminUser.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        active: true,
        last_login_at: true,
        created_at: true
      },
      orderBy: { created_at: 'desc' }
    });
    return { data: users, admin_users: users };
  }

  async createAdminUser({ email, password, name = '', role = 'viewer' }) {
    if (!email || !password) {
      throw { statusCode: 400, code: 'VALIDATION_ERROR', message: 'Thiếu email hoặc password cho tài khoản quản trị' };
    }
    // Whitelist role — trước đây role chuỗi tự do, verifyJwt cast thẳng
    // req.admin.role nên tạo được admin với role bất kỳ.
    const ALLOWED_ROLES = ['super_admin', 'admin', 'operator', 'viewer'];
    if (!ALLOWED_ROLES.includes(role)) {
      throw { statusCode: 400, code: 'VALIDATION_ERROR', message: `Role không hợp lệ (chọn: ${ALLOWED_ROLES.join(', ')})` };
    }

    const existing = await prisma.adminUser.findUnique({ where: { email } });
    if (existing) {
      throw { statusCode: 409, code: 'DUPLICATE_EMAIL', message: 'Email admin đã tồn tại' };
    }

    const user = await prisma.adminUser.create({
      data: {
        email,
        password_hash: hashPw(password),
        name,
        role,
        active: true
      }
    });

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      created_at: user.created_at
    };
  }

  async updateAdminUser(id, data) {
    const updateData = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.role) {
      const ALLOWED_ROLES = ['super_admin', 'admin', 'operator', 'viewer'];
      if (!ALLOWED_ROLES.includes(data.role)) {
        throw { statusCode: 400, code: 'VALIDATION_ERROR', message: 'Role không hợp lệ' };
      }
      updateData.role = data.role;
    }
    // Không cho tự khóa/tự hạ quyền super_admin cuối cùng → tránh mất
    // quyền quản trị toàn hệ thống.
    const target = await prisma.adminUser.findUnique({ where: { id } });
    if (!target) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Không tìm thấy tài khoản quản trị' };
    if (target.role === 'super_admin') {
      const activeSuperAdmins = await prisma.adminUser.count({ where: { role: 'super_admin', active: true } });
      if ((data.active === false || (data.role && data.role !== 'super_admin')) && activeSuperAdmins <= 1) {
        throw { statusCode: 409, code: 'LAST_SUPER_ADMIN', message: 'Không thể vô hiệu hoặc hạ quyền super_admin cuối cùng' };
      }
    }
    if (data.active !== undefined) updateData.active = data.active;
    if (data.password) updateData.password_hash = hashPw(data.password);

    return prisma.adminUser.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        active: true,
        updated_at: true
      }
    });
  }

  async deleteAdminUser(id) {
    const target = await prisma.adminUser.findUnique({ where: { id } });
    if (!target) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Không tìm thấy tài khoản quản trị' };
    if (target.role === 'super_admin') {
      const activeSuperAdmins = await prisma.adminUser.count({ where: { role: 'super_admin', active: true } });
      if (activeSuperAdmins <= 1) {
        throw { statusCode: 409, code: 'LAST_SUPER_ADMIN', message: 'Không thể xoá super_admin cuối cùng' };
      }
    }
    await prisma.adminUser.delete({ where: { id } });
    return { success: true };
  }
}

module.exports = new SystemService();
