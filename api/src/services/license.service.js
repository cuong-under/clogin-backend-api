const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { uuid } = require('../utils/validators');

class LicenseService {
  async activateLicense({ key, hwid, device_name = 'Desktop PC', ip_address }) {
    if (!key || !hwid) {
      throw { statusCode: 400, code: 'VALIDATION_ERROR', message: 'Thiếu thông tin license_key hoặc hwid' };
    }

    const lic = await prisma.license.findUnique({
      where: { key },
      include: { devices: true }
    });

    if (!lic) {
      throw { statusCode: 404, code: 'LICENSE_INVALID', message: 'License Key không hợp lệ' };
    }

    if (lic.status === 'suspended') {
      throw { statusCode: 400, code: 'LICENSE_SUSPENDED', message: `License Key đã bị đình chỉ: ${lic.suspend_reason || 'Vi phạm điều khoản'}` };
    }

    if (lic.status === 'revoked') {
      throw { statusCode: 400, code: 'LICENSE_REVOKED', message: 'License Key đã bị thu hồi' };
    }

    if (lic.expires_at && new Date(lic.expires_at) < new Date()) {
      throw { statusCode: 400, code: 'LICENSE_EXPIRED', message: 'License Key đã hết hạn' };
    }

    const existingDevice = lic.devices.find(d => d.hwid === hwid);
    if (!existingDevice && lic.devices.length >= lic.max_devices) {
      throw { statusCode: 400, code: 'LICENSE_LIMIT', message: 'License đã đạt giới hạn thiết bị cho phép' };
    }

    if (existingDevice) {
      await prisma.device.update({
        where: { id: existingDevice.id },
        data: {
          device_name,
          ip_address,
          last_seen_at: new Date()
        }
      });
    } else {
      await prisma.device.create({
        data: {
          license_id: lic.id,
          hwid,
          device_name,
          ip_address
        }
      });
    }

    const updatedDevicesCount = existingDevice ? lic.devices.length : lic.devices.length + 1;

    return {
      key: lic.key,
      hwid,
      status: 'active',
      expires_at: lic.expires_at ? lic.expires_at.toISOString() : null,
      max_devices: lic.max_devices,
      active_devices: updatedDevicesCount
    };
  }

  async verifyLicense({ key, hwid }) {
    if (!key || !hwid) {
      throw { statusCode: 400, code: 'VALIDATION_ERROR', message: 'Thiếu thông tin license_key hoặc hwid' };
    }

    const lic = await prisma.license.findUnique({
      where: { key },
      include: { devices: true }
    });

    if (!lic) {
      throw { statusCode: 404, code: 'LICENSE_INVALID', message: 'License Key không tồn tại' };
    }

    if (lic.status === 'suspended' || lic.status === 'revoked') {
      throw { statusCode: 400, code: 'LICENSE_INVALID', message: 'License Key không còn hoạt động' };
    }

    if (lic.expires_at && new Date(lic.expires_at) < new Date()) {
      throw { statusCode: 400, code: 'LICENSE_EXPIRED', message: 'License Key đã hết hạn' };
    }

    const dev = lic.devices.find(d => d.hwid === hwid);
    if (!dev) {
      throw { statusCode: 400, code: 'LICENSE_INVALID', message: 'Thiết bị chưa được kích hoạt cho License này' };
    }

    // Touch last_seen_at asynchronously
    prisma.device.update({
      where: { id: dev.id },
      data: { last_seen_at: new Date() }
    }).catch(() => {});

    return {
      key: lic.key,
      hwid,
      status: 'active',
      expires_at: lic.expires_at ? lic.expires_at.toISOString() : null,
      max_devices: lic.max_devices,
      active_devices: lic.devices.length
    };
  }

  // --- Admin Methods ---

  async listLicenses({ search, status, plan, page = 1, perPage = 20 }) {
    const skip = (page - 1) * perPage;
    const where = {};

    if (status) where.status = status;
    if (plan) where.plan_name = { contains: plan, mode: 'insensitive' };
    if (search) {
      where.OR = [
        { key: { contains: search, mode: 'insensitive' } },
        { plan_name: { contains: search, mode: 'insensitive' } },
        { notes: { contains: search, mode: 'insensitive' } }
      ];
    }

    const [licenses, total] = await Promise.all([
      prisma.license.findMany({
        where,
        include: {
          devices: true,
          owner: { select: { id: true, email: true, name: true } }
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: perPage
      }),
      prisma.license.count({ where })
    ]);

    const formatted = licenses.map(l => ({
      id: l.id,
      key: l.key,
      plan: l.plan_name,
      plan_name: l.plan_name,
      plan_id: l.plan_id,
      max_devices: l.max_devices,
      active_devices: l.devices.length,
      status: l.status,
      expires_at: l.expires_at ? l.expires_at.toISOString() : null,
      suspended_at: l.suspended_at ? l.suspended_at.toISOString() : null,
      suspend_reason: l.suspend_reason,
      notes: l.notes,
      created_at: l.created_at.toISOString(),
      owner: l.owner,
      devices: l.devices.map(d => ({
        id: d.id,
        hwid: d.hwid,
        device_name: d.device_name,
        ip_address: d.ip_address,
        activated_at: d.activated_at.toISOString(),
        last_seen_at: d.last_seen_at.toISOString()
      }))
    }));

    return { licenses: formatted, total, page, per_page: perPage, total_pages: Math.ceil(total / perPage) };
  }

  async getLicenseById(id) {
    const lic = await prisma.license.findUnique({
      where: { id },
      include: { devices: true, owner: true, plan: true }
    });
    if (!lic) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Không tìm thấy license' };
    return lic;
  }

  async createLicense({ plan, plan_id, plan_name, max_devices = 1, days_valid, notes = '', coupon_code }) {
    const name = plan_name || plan || 'Standard';
    const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
    const key = `CLOGIN-${name.replace(/\s+/g, '').toUpperCase()}-${randomStr}`;
    const expires_at = days_valid ? new Date(Date.now() + days_valid * 24 * 60 * 60 * 1000) : null;

    const lic = await prisma.license.create({
      data: {
        key,
        plan_id,
        plan_name: name,
        max_devices,
        expires_at,
        notes,
        coupon_code
      }
    });

    return {
      id: lic.id,
      key: lic.key,
      plan: lic.plan_name,
      plan_name: lic.plan_name,
      max_devices: lic.max_devices,
      expires_at: lic.expires_at ? lic.expires_at.toISOString() : null,
      created_at: lic.created_at.toISOString()
    };
  }

  async updateLicense(id, data) {
    const lic = await prisma.license.update({
      where: { id },
      data: {
        plan_name: data.plan_name || data.plan,
        max_devices: data.max_devices,
        expires_at: data.expires_at ? new Date(data.expires_at) : undefined,
        notes: data.notes,
        status: data.status
      }
    });
    return lic;
  }

  async deleteLicense(id) {
    await prisma.license.delete({ where: { id } });
    return { success: true };
  }

  async suspendLicense(id, reason = 'Phát hiện vi phạm') {
    return prisma.license.update({
      where: { id },
      data: {
        status: 'suspended',
        suspended_at: new Date(),
        suspend_reason: reason
      }
    });
  }

  async reactivateLicense(id) {
    return prisma.license.update({
      where: { id },
      data: {
        status: 'active',
        suspended_at: null,
        suspend_reason: null
      }
    });
  }

  async extendLicense(id, days) {
    const lic = await prisma.license.findUnique({ where: { id } });
    if (!lic) throw { statusCode: 404, code: 'NOT_FOUND', message: 'License không tồn tại' };

    const baseDate = (lic.expires_at && new Date(lic.expires_at) > new Date()) ? new Date(lic.expires_at) : new Date();
    const newExpiresAt = new Date(baseDate.getTime() + (days || 30) * 24 * 60 * 60 * 1000);

    return prisma.license.update({
      where: { id },
      data: {
        expires_at: newExpiresAt,
        status: 'active'
      }
    });
  }

  async resetDevices(id) {
    await prisma.device.deleteMany({ where: { license_id: id } });
    return { success: true, message: 'Đã reset toàn bộ thiết bị của Key' };
  }

  async removeDevice(id, hwid) {
    await prisma.device.deleteMany({
      where: {
        license_id: id,
        hwid
      }
    });
    return { success: true, message: 'Đã giải phóng thiết bị khỏi Key' };
  }

  async bulkCreateLicenses({ count = 5, plan_name = 'Standard', max_devices = 1, days_valid }) {
    const created = [];
    for (let i = 0; i < count; i++) {
      const item = await this.createLicense({ plan_name, max_devices, days_valid });
      created.push(item);
    }
    return { count: created.length, licenses: created };
  }
}

module.exports = new LicenseService();
