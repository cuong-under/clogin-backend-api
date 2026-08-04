const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class AnalyticsService {
  async getDashboardStats(range = '7d') {
    let days = 7;
    if (range === '30d') days = 30;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const last24h = new Date(Date.now() - 86400000);
    const now = new Date();

    const [
      totalLicenses,
      activeLicenses,
      suspendedLicenses,
      expiredLicenses,
      totalDevices,
      totalOwners,
      totalWorkers,
      totalProfiles,
      recentAuditCount,
      recentAuditLogs,
      recentLogins,
      recentOwners,
      totalWorkspaces,
      archivedWorkspaces,
      totalWorkspaceMembers,
      totalTasks,
      activeTasks,
      overdueTasks,
      totalSops,
      totalVaultEntries,
      aiAuditEvents24h,
      aiAuditDenied24h
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
        where: { timestamp: { gte: last24h } }
      }),
      prisma.auditLog.findMany({
        orderBy: { timestamp: 'desc' },
        take: 10
      }),
      prisma.loginHistory.findMany({
        where: { created_at: { gte: startDate } },
        select: { created_at: true }
      }),
      prisma.owner.findMany({
        where: { created_at: { gte: startDate } },
        select: { created_at: true }
      }),
      prisma.workspace.count({ where: { archived_at: null } }),
      prisma.workspace.count({ where: { archived_at: { not: null } } }),
      prisma.workspaceMember.count(),
      prisma.workspaceTask.count(),
      prisma.workspaceTask.count({ where: { status: { notIn: ['done', 'cancelled'] } } }),
      prisma.workspaceTask.count({
        where: { due_at: { lt: now }, status: { notIn: ['done', 'cancelled'] } }
      }),
      prisma.sopTemplate.count({ where: { is_active: true } }),
      prisma.proxyVaultEntry.count(),
      prisma.workspaceAuditEvent.count({ where: { created_at: { gte: last24h } } }),
      prisma.workspaceAuditEvent.count({
        where: { created_at: { gte: last24h }, status: 'denied' }
      })
    ]);

    // Group logins and new users by day
    const dateMap = new Map();
    for (let i = 0; i < days; i++) {
      const d = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().split('T')[0];
      dateMap.set(dateStr, { date: dateStr, logins: 0, new_users: 0 });
    }

    recentLogins.forEach(log => {
      const dStr = log.created_at.toISOString().split('T')[0];
      if (dateMap.has(dStr)) dateMap.get(dStr).logins += 1;
    });

    recentOwners.forEach(o => {
      const dStr = o.created_at.toISOString().split('T')[0];
      if (dateMap.has(dStr)) dateMap.get(dStr).new_users += 1;
    });

    const logins_by_day = Array.from(dateMap.values()).map(item => ({ date: item.date, count: item.logins }));
    const new_users_by_day = Array.from(dateMap.values()).map(item => ({ date: item.date, count: item.new_users }));

    const recent_activity = recentAuditLogs.map(l => ({
      id: l.id,
      user_id: l.user_id,
      user_email: l.user_name || l.user_id,
      user_type: l.user_type,
      action: l.action,
      action_type: l.user_type === 'system' ? 'SYSTEM' : 'USER',
      action_name: l.action,
      target: l.target,
      ip: l.ip_address || '',
      ip_address: l.ip_address || '',
      user_agent: l.user_agent,
      timestamp: l.timestamp.toISOString(),
      created_at: l.timestamp.toISOString()
    }));

    return {
      total_licenses: totalLicenses,
      active_users: totalOwners,
      cloud_profiles: totalProfiles,
      active_devices: totalDevices,
      total_workspaces: totalWorkspaces,
      archived_workspaces: archivedWorkspaces,
      total_workspace_members: totalWorkspaceMembers,
      total_tasks: totalTasks,
      active_tasks: activeTasks,
      overdue_tasks: overdueTasks,
      total_sops: totalSops,
      total_vault_entries: totalVaultEntries,
      ai_audit_events_24h: aiAuditEvents24h,
      ai_audit_denied_24h: aiAuditDenied24h,
      logins_by_day,
      new_users_by_day,
      recent_activity,
      overview: {
        total_licenses: totalLicenses,
        active_licenses: activeLicenses,
        suspended_licenses: suspendedLicenses,
        expired_licenses: expiredLicenses,
        total_devices: totalDevices,
        total_owners: totalOwners,
        total_workers: totalWorkers,
        total_profiles: totalProfiles,
        audit_events_24h: recentAuditCount,
        total_workspaces: totalWorkspaces,
        archived_workspaces: archivedWorkspaces,
        total_workspace_members: totalWorkspaceMembers,
        total_tasks: totalTasks,
        active_tasks: activeTasks,
        overdue_tasks: overdueTasks,
        total_sops: totalSops,
        total_vault_entries: totalVaultEntries,
        ai_audit_events_24h: aiAuditEvents24h,
        ai_audit_denied_24h: aiAuditDenied24h
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
