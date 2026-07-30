const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class AuditService {
  async logAudit({ owner_id, user_id, user_type, user_name, action, target = '', ip_address, user_agent, metadata }) {
    try {
      await prisma.auditLog.create({
        data: {
          owner_id: owner_id || null,
          user_id: user_id || 'system',
          user_type: user_type || 'system',
          user_name: user_name || 'System',
          action,
          target: target || '',
          ip_address,
          user_agent,
          metadata
        }
      });
    } catch (e) {
      console.error('[AuditService.logAudit Error]:', e);
    }
  }

  async getOwnerAuditLogs(ownerId) {
    const logs = await prisma.auditLog.findMany({
      where: { owner_id: ownerId },
      orderBy: { timestamp: 'desc' },
      take: 100
    });

    return {
      audit: logs.map(l => ({
        id: l.id,
        owner_id: l.owner_id,
        user_id: l.user_id,
        user_type: l.user_type,
        user_name: l.user_name,
        action: l.action,
        target: l.target,
        timestamp: l.timestamp.getTime(),
        created_at: l.timestamp.toISOString()
      }))
    };
  }

  async listAdminAuditLogs({ action, user_type, from, to, page = 1, perPage = 50 }) {
    const skip = (page - 1) * perPage;
    const where = {};

    if (action) where.action = action;
    if (user_type) where.user_type = user_type;
    if (from || to) {
      where.timestamp = {};
      if (from) where.timestamp.gte = new Date(from);
      if (to) where.timestamp.lte = new Date(to);
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip,
        take: perPage
      }),
      prisma.auditLog.count({ where })
    ]);

    const formatted = logs.map(l => ({
      id: l.id,
      owner_id: l.owner_id,
      user_id: l.user_id,
      user_type: l.user_type,
      user_name: l.user_name,
      action: l.action,
      target: l.target,
      ip_address: l.ip_address,
      user_agent: l.user_agent,
      metadata: l.metadata,
      timestamp: l.timestamp.getTime(),
      created_at: l.timestamp.toISOString()
    }));

    return { data: formatted, audit: formatted, total, page, per_page: perPage, limit: perPage, total_pages: Math.ceil(total / perPage) };
  }

  async listLoginHistory({ email, success, from, to, page = 1, perPage = 50 }) {
    const skip = (page - 1) * perPage;
    const where = {};

    if (email) where.email = { contains: email, mode: 'insensitive' };
    if (success !== undefined && success !== null && success !== '') {
      where.success = success === 'true' || success === true;
    }
    if (from || to) {
      where.created_at = {};
      if (from) where.created_at.gte = new Date(from);
      if (to) where.created_at.lte = new Date(to);
    }

    const [history, total] = await Promise.all([
      prisma.loginHistory.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: perPage
      }),
      prisma.loginHistory.count({ where })
    ]);

    return { data: history, login_history: history, total, page, per_page: perPage, limit: perPage, total_pages: Math.ceil(total / perPage) };
  }

  async getSuspiciousLogins() {
    const oneHourAgo = new Date(Date.now() - 3600000);
    const failedLogins = await prisma.loginHistory.groupBy({
      by: ['ip_address'],
      where: {
        success: false,
        created_at: { gte: oneHourAgo }
      },
      _count: { id: true },
      having: {
        id: { _count: { gte: 5 } }
      }
    });

    const formatted = failedLogins.map(f => ({
      ip_address: f.ip_address,
      failed_count: f._count.id
    }));
    return { data: formatted, suspicious_ips: formatted };
  }

  async listIpBlocks() {
    const blocks = await prisma.ipBlock.findMany({
      orderBy: { created_at: 'desc' }
    });
    return { data: blocks, ip_blocks: blocks };
  }

  async addIpBlock({ ip, reason = '', expires_at }) {
    if (!ip) throw { statusCode: 400, code: 'VALIDATION_ERROR', message: 'Thiếu địa chỉ IP' };

    const block = await prisma.ipBlock.upsert({
      where: { ip },
      update: {
        reason,
        expires_at: expires_at ? new Date(expires_at) : null
      },
      create: {
        ip,
        reason,
        expires_at: expires_at ? new Date(expires_at) : null
      }
    });

    return block;
  }

  async removeIpBlock(ip) {
    await prisma.ipBlock.deleteMany({ where: { ip } });
    return { success: true, message: `Đã gỡ khóa IP ${ip}` };
  }
}

module.exports = new AuditService();
