const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { hashPw } = require('../utils/hash');

class SystemService {
  // --- License Plans ---
  async listPlans() {
    const plans = await prisma.licensePlan.findMany({
      orderBy: { sort_order: 'asc' }
    });
    return { data: plans, plans };
  }

  async createPlan(data) {
    if (!data.name || !data.slug) {
      throw { statusCode: 400, code: 'VALIDATION_ERROR', message: 'Thiếu name hoặc slug cho gói dịch vụ' };
    }
    return prisma.licensePlan.create({ data });
  }

  async updatePlan(id, data) {
    return prisma.licensePlan.update({
      where: { id },
      data
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
    return { data: coupons, coupons };
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
  async getConfig() {
    const configs = await prisma.systemConfig.findMany();
    const configMap = {};
    configs.forEach(c => {
      configMap[c.key] = c.value;
    });
    return configMap;
  }

  async updateConfig(keyValues) {
    const operations = Object.entries(keyValues).map(([key, value]) =>
      prisma.systemConfig.upsert({
        where: { key },
        update: { value, updated_at: new Date() },
        create: { key, value }
      })
    );
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
    if (data.role) updateData.role = data.role;
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
    await prisma.adminUser.delete({ where: { id } });
    return { success: true };
  }
}

module.exports = new SystemService();
