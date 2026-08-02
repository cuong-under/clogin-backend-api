const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { CAPABILITIES } = require('../config/capabilities');

// Authorities that an authorityed tool execution can carry, keyed to the
// action-class the server will record. Never accepts prompt/raw/DOM/credentials.
const POLICY_MODES = ['plan', 'ask', 'full'];

class AiAuditService {
  /**
   * Authorize an AI tool execution for the actor within a workspace.
   * Loads actor + membership + capability live from DB (provided via `auth`,
   * already resolved by rbac.service). Read/plan tools still record an audit
   * allowance event. Writes require the capability.
   */
  async authorize({ workspaceId, auth, capability, toolName, actionClass, targetId, parameterDigest, correlationId }) {
    const capDef = Object.values(CAPABILITIES).includes(capability)
      ? capability
      : (CAPABILITIES[capability] || null);
    if (!capDef) {
      throw { statusCode: 400, code: 'VALIDATION_ERROR', message: 'Capability không hợp lệ' };
    }
    const has = auth.isOwner || auth.capabilities.has(capDef);
    const policyMode = auth.policyMode || (auth.isOwner ? 'full' : 'ask');

    await prisma.workspaceAuditEvent.create({
      data: {
        owner_id: auth.workspace.owner_id,
        workspace_id: workspaceId,
        actor_id: auth.actor.sub,
        actor_type: auth.actor.type,
        actor_name: auth.actor.name || '',
        user_role: auth.role,
        policy_mode: policyMode,
        tool_name: toolName || '',
        capability: capDef,
        action_class: actionClass || '',
        target_id: targetId || '',
        confirmed: has,
        status: has ? 'authorized' : 'denied',
        correlation_id: correlationId || null,
        parameter_digest: parameterDigest || null
      }
    });

    if (!has) {
      return { allowed: false, deny_reason: 'capability', policy_revision: auth.policy, policy_mode: policyMode };
    }
    return { allowed: true, policy_mode: policyMode, policy_revision: auth.policy, capability: capDef };
  }

  async recordToolStarted(workspace, data) {
    return prisma.workspaceAuditEvent.create({
      data: {
        owner_id: data.owner_id,
        workspace_id: workspace,
        actor_id: data.actor_id,
        actor_type: data.actor_type || 'user',
        actor_name: data.actor_name || '',
        user_role: data.user_role || '',
        policy_mode: data.policy_mode || 'ask',
        tool_name: data.tool_name,
        capability: data.capability || '',
        action_class: data.action_class || '',
        target_id: data.target_id || '',
        confirmed: data.confirmed !== undefined ? data.confirmed : true,
        status: 'started',
        correlation_id: data.correlation_id || null,
        parameter_digest: data.parameter_digest || null,
        ip_address: null
      }
    });
  }

  async recordToolFinished(workspace, data) {
    return prisma.workspaceAuditEvent.create({
      data: {
        owner_id: data.owner_id,
        workspace_id: workspace,
        actor_id: data.actor_id,
        actor_type: data.actor_type || 'user',
        actor_name: data.actor_name || '',
        user_role: data.user_role || '',
        policy_mode: data.policy_mode || 'ask',
        tool_name: data.tool_name,
        capability: data.capability || '',
        action_class: data.action_class || '',
        target_id: data.target_id || '',
        confirmed: data.confirmed !== undefined,
        status: data.status || 'finished',
        correlation_id: data.correlation_id || null,
        parameter_digest: data.parameter_digest || null,
        result_digest: data.result_digest || null,
        ip_address: null
      }
    });
  }

  async logBusiness({ workspace_id, actor, tool_name = '', capability = '', action_class = '', target_id = '', status = '', correlation_id = null }) {
    return prisma.workspaceAuditEvent.create({
      data: {
        owner_id: actor.ownerId,
        workspace_id,
        actor_id: actor.sub,
        actor_type: actor.type,
        actor_name: actor.name || '',
        user_role: actor.roleName || '',
        policy_mode: actor.policy_mode || 'read',
        tool_name,
        capability,
        action_class,
        target_id,
        status,
        correlation_id
      }
    });
  }

  // Aggregate summary for UI/dashboard; uses filters + pagination, never raw blobs.
  async summary(workspaceId, { from, to, tool_name, actor_id, action_class, status, page = 1, per_page = 20 }) {
    const where = { workspace_id: workspaceId };
    if (from || to) {
      where.created_at = {};
      if (from) where.created_at.gte = new Date(from);
      if (to) where.created_at.lte = new Date(to);
    }
    if (tool_name) where.tool_name = tool_name;
    if (actor_id) where.actor_id = actor_id;
    if (action_class) where.action_class = action_class;
    if (status) where.status = status;

    const [recent, total, agg] = await Promise.all([
      prisma.workspaceAuditEvent.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * per_page,
        take: per_page
      }),
      prisma.workspaceAuditEvent.count({ where }),
      prisma.workspaceAuditEvent.groupBy({
        by: ['tool_name', 'action_class', 'status'],
        where,
        _count: { _all: true }
      })
    ]);

    return {
      total,
      page,
      per_page,
      aggregation: agg.map(g => ({
        tool_name: g.tool_name,
        action_class: g.action_class,
        status: g.status,
        count: g._count._all
      })),
      events: recent.map(e => ({
        id: e.id,
        actor_id: e.actor_id,
        user_role: e.user_role,
        policy_mode: e.policy_mode,
        tool_name: e.tool_name,
        capability: e.capability,
        action_class: e.action_class,
        status: e.status,
        target_id: e.target_id,
        correlation_id: e.correlation_id,
        timestamp: e.created_at.toISOString()
      }))
    };
  }
}

function hasCap(auth, capKey) {
  return auth.capabilities.has(capKey);
}

module.exports = new AiAuditService();