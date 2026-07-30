const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class AnalyticsService {
  async getDashboardStats() {
    const [
      totalLicenses,
      activeLicenses,
      suspendedLicenses,
      expiredLicenses,
      totalDevices,
      totalOwners,
      totalWorkers,
      totalProfiles,
      recentAuditLogs
    ] = await Promise.all([
      prisma.license.count(),
      prisma.license.count({ where: { status: 'active' } }),
      prisma.license.count({ where: { status: 'suspended' } }),
      prisma.license.count({ where: { status: 'expired' } }),
      prisma.device.count(),
      prisma.owner.count(),
      prisma.worker.count(),
      prisma.cloudProfile.count(),
      prisma.auditLog.count({
        where: { timestamp: { gte: new Date(Date.now() - 86400000) } }
      })
    ]);

    return {
      overview: {
        total_licenses: totalLicenses,
        active_licenses: activeLicenses,
        suspended_licenses: suspendedLicenses,
        expired_licenses: expiredLicenses,
        total_devices: totalDevices,
        total_owners: totalOwners,
        total_workers: totalWorkers,
        total_profiles: totalProfiles,
        audit_events_24h: recentAuditLogs
      }
    };
  }

  async getAnalytics(period = '7d') {
    let days = 7;
    if (period === '30d') days = 30;
    if (period === '90d') days = 90;

    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [recentOwners, recentLicenses, recentLogins] = await Promise.all([
      prisma.owner.findMany({
        where: { created_at: { gte: startDate } },
        select: { created_at: true }
      }),
      prisma.license.findMany({
        where: { created_at: { gte: startDate } },
        select: { created_at: true }
      }),
      prisma.loginHistory.findMany({
        where: { created_at: { gte: startDate } },
        select: { created_at: true, success: true }
      })
    ]);

    // Group by date (YYYY-MM-DD)
    const timelineMap = new Map();
    for (let i = 0; i < days; i++) {
      const d = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().split('T')[0];
      timelineMap.set(dateStr, { date: dateStr, new_owners: 0, new_licenses: 0, total_logins: 0, failed_logins: 0 });
    }

    recentOwners.forEach(o => {
      const dateStr = o.created_at.toISOString().split('T')[0];
      if (timelineMap.has(dateStr)) timelineMap.get(dateStr).new_owners += 1;
    });

    recentLicenses.forEach(l => {
      const dateStr = l.created_at.toISOString().split('T')[0];
      if (timelineMap.has(dateStr)) timelineMap.get(dateStr).new_licenses += 1;
    });

    recentLogins.forEach(log => {
      const dateStr = log.created_at.toISOString().split('T')[0];
      if (timelineMap.has(dateStr)) {
        const item = timelineMap.get(dateStr);
        item.total_logins += 1;
        if (!log.success) item.failed_logins += 1;
      }
    });

    return {
      period,
      timeline: Array.from(timelineMap.values())
    };
  }
}

module.exports = new AnalyticsService();
