const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { CAPABILITIES, PRESET_CAPABILITIES } = require('../config/capabilities');

class RbacService {
  /**
   * Resolve the actor's access to a workspace, live from DB.
   * Owner bypasses entirely; Worker requires an active WorkspaceMember row.
   * Returns { allowed, role, capabilities:Set, member, workspace } or throws
   * a 403-ish error object when the workspace is missing.
   */
  async resolveAccess({ actor, workspaceId }) {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace || workspace.archived_at) {
      throw { statusCode: 404, code: 'NOT_FOUND', message: 'Không tìm thấy workspace' };
    }

    if (actor.type === 'owner') {
      if (workspace.owner_id !== actor.sub) {
        throw { statusCode: 403, code: 'FORBIDDEN', message: 'Workspace không thuộc quyền sở hữu của bạn' };
      }
      return {
        allowed: true,
        role: 'owner',
        capabilities: new Set(Object.values(CAPABILITIES)),
        isOwner: true,
        workspace,
        member: null,
        policy: workspace.policy_revision
      };
    }

    if (actor.type !== 'worker') {
      throw { statusCode: 403, code: 'FORBIDDEN', message: 'Không được phép truy cập workspace' };
    }

    const member = await prisma.workspaceMember.findUnique({
      where: {
        workspace_id_worker_id: { workspace_id: workspaceId, worker_id: actor.sub }
      }
    });

    if (!member || !member.active) {
      throw { statusCode: 403, code: 'FORBIDDEN', message: 'Bạn không phải thành viên của workspace này' };
    }

    let caps = member.capabilities && member.capabilities.length
      ? member.capabilities
      : (PRESET_CAPABILITIES[member.preset_role] || []);

    return {
      allowed: true,
      role: member.preset_role,
      capabilities: new Set(caps),
      isOwner: false,
      workspace,
      member,
      policy: workspace.policy_revision
    };
  }

  /**
   * Owner is implicitly full-access and bypasses capability checks.
   * Others require the capability in their live membership set.
   */
  hasCapability(auth, capability) {
    if (auth.isOwner) return true;
    return auth.capabilities.has(capability);
  }

  /**
   * Resolve a workspace-profile (WSProfile) for access scoping.
   * Workers access profiles only through WorkspaceProfileAssignment —
   * Manager/Operator see assigned profiles; the check is enforced by checking
   * membership in WorkspaceProfileAssignment via the member row.
   */
  async assertProfileScope(auth, workspaceProfileId) {
    if (auth.isOwner) {
      const wp = await prisma.workspaceProfile.findFirst({
        where: { id: workspaceProfileId, workspace_id: auth.workspace.id }
      });
      if (!wp) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Profile không trong workspace' };
      return wp;
    }
    const wp = await prisma.workspaceProfile.findFirst({
      where: {
        id: workspaceProfileId,
        workspace_id: auth.workspace.id,
        assignments: { some: { worker_id: auth.actor.sub } }
      }
    });
    if (!wp) throw { statusCode: 403, code: 'FORBIDDEN', message: 'Profile không được gán cho bạn' };
    return wp;
  }
}

module.exports = new RbacService();