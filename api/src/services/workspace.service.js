const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const rbac = require('./rbac.service');
const {
  PRESET_CAPABILITIES,
  isValidCapability,
  isValidPreset
} = require('../config/capabilities');
const { CAPABILITIES } = require('../config/capabilities');

class WorkspaceService {
  async getWorkspaceOrThrow(workspaceId) {
    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!ws) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Workspace không tồn tại' };
    return ws;
  }

  async bumpRevision(tx, workspaceId) {
    await tx.workspace.update({
      where: { id: workspaceId },
      data: { policy_revision: { increment: 1 } }
    });
  }

  async listWorkspaces(actor) {
    if (actor.type === 'owner') {
      const rows = await prisma.workspace.findMany({
        where: { owner_id: actor.sub, archived_at: null },
        include: { _count: { select: { members: true, profiles: true, tasks: true } } },
        orderBy: { created_at: 'desc' }
      });
      // Owner nhìn thấy toàn quyền trên mọi workspace của mình; kèm role/capabilities
      // để desktop UI bật đúng nút quản trị (khớp với getWorkspace).
      return rows.map(w => ({
        ...this.formatWorkspace(w),
        role: 'owner',
        capabilities: Object.values(CAPABILITIES)
      }));
    }

    const memberships = await prisma.workspaceMember.findMany({
      where: { worker_id: actor.sub, active: true },
      include: {
        workspace: {
          include: { _count: { select: { profiles: true, tasks: true } } }
        }
      },
      orderBy: { created_at: 'desc' }
    });
    return memberships.map(m => ({
      ...this.formatWorkspace(m.workspace),
      role: m.preset_role,
      capabilities: m.capabilities
    }));
  }

  formatWorkspace(w) {
    return {
      id: w.id,
      name: w.name,
      description: w.description,
      policy_revision: w.policy_revision,
      archived: !!w.archived_at,
      created_at: w.created_at.toISOString(),
      updated_at: w.updated_at.toISOString(),
      member_count: w._count?.members || 0,
      profile_count: w._count?.profiles || 0,
      task_count: w._count?.tasks || 0
    };
  }

  async createWorkspace(ownerId, { name, description = '' }) {
    if (!name || !String(name).trim()) {
      throw { statusCode: 400, code: 'VALIDATION_ERROR', message: 'Thiếu tên workspace' };
    }
    const ws = await prisma.workspace.create({
      data: { owner_id: ownerId, name: String(name).trim(), description }
    });
    return this.formatWorkspace(ws);
  }

  async updateWorkspace(auth, workspaceId, data) {
    if (!auth.isOwner) {
      throw { statusCode: 403, code: 'FORBIDDEN', message: 'Chỉ Owner mới quản lý workspace' };
    }
    const patch = {};
    if (data.name !== undefined) patch.name = String(data.name).trim();
    if (data.description !== undefined) patch.description = data.description;
    if (data.archived !== undefined) patch.archived_at = data.archived ? new Date() : null;
    if (patch.archived || (patch.archived === undefined)) {
      // bump policy revision on any management change for capability invalidation
    }
    const ws = await prisma.workspace.update({
      where: { id: workspaceId },
      data: { ...patch, policy_revision: { increment: 1 } }
    });
    return this.formatWorkspace(ws);
  }

  async getWorkspace(auth, workspaceId) {
    const ws = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        members: {
          include: { worker: { select: { id: true, email: true, name: true, active: true } } },
          orderBy: { created_at: 'asc' }
        },
        _count: { select: { profiles: true, tasks: true, sops: true, auditEvents: true } }
      }
    });
    if (!ws) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Workspace không tồn tại' };
    const formatted = this.formatWorkspace(ws);
    formatted.role = auth.isOwner ? 'owner' : auth.role;
    formatted.capabilities = auth.isOwner ? Object.values(CAPABILITIES) : [...auth.capabilities];
    formatted.members = ws.members.map(m => ({
      id: m.id,
      worker_id: m.worker_id,
      email: m.worker.email,
      name: m.worker.name,
      active: m.active,
      preset_role: m.preset_role,
      capabilities: m.capabilities,
      created_at: m.created_at.toISOString(),
      updated_at: m.updated_at.toISOString()
    }));
    return formatted;
  }

  async deleteWorkspace(auth, workspaceId, confirmName) {
    if (!auth.isOwner) {
      throw { statusCode: 403, code: 'FORBIDDEN', message: 'Chỉ Owner mới xóa workspace' };
    }
    const ws = await this.getWorkspaceOrThrow(workspaceId);
    if (confirmName !== ws.name) {
      throw { statusCode: 400, code: 'CONFIRM_NAME_MISMATCH', message: 'Tên xác nhận workspace không khớp' };
    }
    await prisma.workspace.delete({ where: { id: workspaceId } });
    return { success: true };
  }

  // ----- Members -----

  async listMembers(auth, workspaceId) {
    const ws = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { owner_id: true, owner: { select: { id: true, email: true, name: true } } }
    });
    const members = await prisma.workspaceMember.findMany({
      where: { workspace_id: workspaceId },
      include: { worker: { select: { id: true, email: true, name: true, active: true } } }
    });
    return {
      owner: { ...ws.owner, role: 'owner' },
      members: members.map(m => ({
        id: m.id,
        worker_id: m.worker_id,
        email: m.worker.email,
        name: m.worker.name,
        worker_active: m.worker.active,
        preset_role: m.preset_role,
        capabilities: m.capabilities,
        active: m.active,
        updated_at: m.updated_at.toISOString()
      }))
    };
  }

  async upsertMember(auth, workspaceId, workerId, { preset_role, capabilities, active }) {
    const worker = await prisma.worker.findFirst({
      where: { id: workerId, owner_id: auth.workspace.owner_id }
    });
    if (!worker) {
      throw { statusCode: 404, code: 'NOT_FOUND', message: 'Worker không thuộc Owner này' };
    }

    let role = preset_role;
    let caps = capabilities;
    if (!isValidPreset(role)) {
      throw { statusCode: 400, code: 'VALIDATION_ERROR', message: 'preset_role không hợp lệ' };
    }
    if (caps !== undefined && !Array.isArray(caps)) {
      throw { statusCode: 400, code: 'VALIDATION_ERROR', message: 'capabilities phải là mảng' };
    }
    if (caps === undefined) {
      caps = [...(PRESET_CAPABILITIES[role] || [])];
    } else {
      const unknown = caps.filter(c => !isValidCapability(c));
      if (unknown.length) {
        throw { statusCode: 400, code: 'VALIDATION_ERROR', message: `Capability không hợp lệ: ${unknown.join(', ')}` };
      }
    }

    const member = await prisma.workspaceMember.upsert({
      where: { workspace_id_worker_id: { workspace_id: workspaceId, worker_id: workerId } },
      update: {
        preset_role: role,
        capabilities: caps,
        active: active !== undefined ? active : true
      },
      create: {
        workspace_id: workspaceId,
        worker_id: workerId,
        preset_role: role,
        capabilities: caps,
        active: active !== undefined ? active : true
      }
    });

    // bump revision so live grants invalidate
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { policy_revision: { increment: 1 } }
    });
    return { success: true, member_id: member.id };
  }

  async deleteMember(auth, workspaceId, workerId, reassignTo) {
    const member = await prisma.workspaceMember.findUnique({
      where: { workspace_id_worker_id: { workspace_id: workspaceId, worker_id: workerId } },
      include: { worker: { select: { id: true, name: true, email: true } } }
    });
    if (!member) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Member không tồn tại' };
    const openTasks = await prisma.workspaceTask.findMany({
      where: {
        workspace_id: workspaceId,
        assignee_type: 'worker',
        assignee_id: workerId,
        status: { notIn: ['done', 'cancelled'] }
      },
      select: { id: true, title: true, status: true }
    });
    if (openTasks.length && !reassignTo) {
      throw {
        statusCode: 409,
        code: 'TASK_HANDOFF_REQUIRED',
        message: 'Member còn task chưa hoàn tất, cần bàn giao trước khi gỡ',
        tasks: openTasks,
        assignees: await this.listValidAssignees(workspaceId, workerId)
      };
    }
    const replacement = reassignTo ? await this.assertValidAssignee(workspaceId, reassignTo, workerId) : null;
    await prisma.$transaction(async tx => {
      for (const task of openTasks) {
        await tx.workspaceTask.update({
          where: { id: task.id },
          data: { assignee_type: replacement.type, assignee_id: replacement.id }
        });
        await this.createActivity(tx, workspaceId, task, auth.actor, 'assignee_changed', {
          metadata: {
          before: { assignee_type: 'worker', assignee_id: workerId },
          after: { assignee_type: replacement.type, assignee_id: replacement.id },
          reason: 'member_removed'
          }
        });
      }
      await tx.workspaceMember.delete({ where: { id: member.id } });
      await this.bumpRevision(tx, workspaceId);
    });
    return { success: true, handed_off_tasks: openTasks.length };
  }

  async deactivateMember(auth, workspaceId, workerId, active, reassignTo) {
    if (active) {
      const member = await prisma.workspaceMember.findUnique({
        where: { workspace_id_worker_id: { workspace_id: workspaceId, worker_id: workerId } }
      });
      if (!member) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Member không tồn tại' };
      await prisma.workspaceMember.update({ where: { id: member.id }, data: { active: true } });
      await this.bumpRevision(prisma, workspaceId);
      return { success: true };
    }
    const member = await prisma.workspaceMember.findUnique({
      where: { workspace_id_worker_id: { workspace_id: workspaceId, worker_id: workerId } }
    });
    if (!member) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Member không tồn tại' };
    const openTasks = await prisma.workspaceTask.findMany({
      where: { workspace_id: workspaceId, assignee_type: 'worker', assignee_id: workerId, status: { notIn: ['done', 'cancelled'] } },
      select: { id: true, title: true, status: true }
    });
    if (openTasks.length && !reassignTo) {
      throw {
        statusCode: 409,
        code: 'TASK_HANDOFF_REQUIRED',
        message: 'Member còn task chưa hoàn tất, cần bàn giao trước khi khóa',
        tasks: openTasks,
        assignees: await this.listValidAssignees(workspaceId, workerId)
      };
    }
    const replacement = reassignTo ? await this.assertValidAssignee(workspaceId, reassignTo, workerId) : null;
    await prisma.$transaction(async tx => {
      for (const task of openTasks) {
        await tx.workspaceTask.update({ where: { id: task.id }, data: { assignee_type: replacement.type, assignee_id: replacement.id } });
        await this.createActivity(tx, workspaceId, task, auth.actor, 'assignee_changed', {
          metadata: {
          before: { assignee_type: 'worker', assignee_id: workerId },
          after: { assignee_type: replacement.type, assignee_id: replacement.id },
          reason: 'member_deactivated'
          }
        });
      }
      await tx.workspaceMember.update({ where: { id: member.id }, data: { active: false } });
      await this.bumpRevision(tx, workspaceId);
    });
    return { success: true, handed_off_tasks: openTasks.length };
  }

  async listValidAssignees(workspaceId, excludeWorkerId) {
    const ws = await this.getWorkspaceOrThrow(workspaceId);
    const members = await prisma.workspaceMember.findMany({
      where: { workspace_id: workspaceId, active: true, worker_id: excludeWorkerId ? { not: excludeWorkerId } : undefined },
      include: { worker: { select: { id: true, name: true, email: true, active: true } } }
    });
    return [
      { type: 'owner', id: ws.owner_id, name: 'Owner' },
      ...members.filter(m => m.worker.active).map(m => ({ type: 'worker', id: m.worker_id, name: m.worker.name || m.worker.email }))
    ];
  }

  async assertValidAssignee(workspaceId, value, excludeWorkerId) {
    const type = value.type || value.assignee_type;
    const id = value.id || value.assignee_id;
    const ws = await this.getWorkspaceOrThrow(workspaceId);
    if (type === 'owner' && id === ws.owner_id) return { type, id };
    if (type !== 'worker' || !id || id === excludeWorkerId) {
      throw { statusCode: 400, code: 'VALIDATION_ERROR', message: 'Assignee thay thế không hợp lệ' };
    }
    const member = await prisma.workspaceMember.findUnique({
      where: { workspace_id_worker_id: { workspace_id: workspaceId, worker_id: id } },
      include: { worker: { select: { active: true } } }
    });
    if (!member || !member.active || !member.worker.active) {
      throw { statusCode: 400, code: 'VALIDATION_ERROR', message: 'Assignee thay thế phải là member active' };
    }
    return { type, id };
  }

  // ----- Profiles ---
  async listWorkspaceProfiles(auth, workspaceId) {
    const canSeeAll = auth.isOwner || auth.capabilities.has('profiles.assign');
    const rows = await prisma.workspaceProfile.findMany({
      where: {
        workspace_id: workspaceId,
        ...(canSeeAll ? {} : { assignments: { some: { worker_id: auth.actor.sub } } })
      },
      include: {
        profile: { select: { id: true, name: true, folder: true, sync_revision: true, sync_state: true } },
        assignments: { include: { worker: { select: { id: true, email: true, name: true } } } }
      }
    });
    return {
      profiles: rows.map(r => ({
        workspace_profile_id: r.id,
        profile_id: r.profile_id,
        name: r.profile.name,
        folder: r.profile.folder,
        sync_state: r.profile.sync_state,
        sync_revision: r.profile.sync_revision,
        vault_proxy_id: r.vault_proxy_id,
        assigned_worker_ids: r.assignments.map(a => a.worker_id),
        assignments: r.assignments.map(a => ({ worker_id: a.worker_id, email: a.worker.email, name: a.worker.name })),
        created_at: r.created_at.toISOString()
      }))
    };
  }

  async addProfileToWorkspace(auth, workspaceId, profileId, confirmReuse = false) {
    const profile = await prisma.cloudProfile.findFirst({ where: { id: profileId, owner_id: auth.actor.sub } });
    if (!profile) {
      throw { statusCode: 404, code: 'NOT_FOUND', message: 'Profile cloud không tồn tại' };
    }
    const linked = await prisma.workspaceProfile.findMany({
      where: { profile_id: profileId, workspace_id: { not: workspaceId } },
      include: { workspace: { select: { id: true, name: true } } }
    });
    if (linked.length && !confirmReuse) {
      throw {
        statusCode: 409,
        code: 'PROFILE_REUSE_CONFIRMATION_REQUIRED',
        message: 'Profile đã được liên kết với workspace khác',
        workspaces: linked.map(row => row.workspace)
      };
    }
    const ws = await prisma.workspaceProfile.upsert({
      where: { workspace_id_profile_id: { workspace_id: workspaceId, profile_id: profileId } },
      create: { workspace_id: workspaceId, profile_id: profileId },
      update: {}
    });
    return { workspace_profile_id: ws.id };
  }

  async removeProfileFromWorkspace(auth, workspaceId, wpId) {
    const activeLinks = await prisma.taskWorkspaceProfileLink.findMany({
      where: { workspace_profile_id: wpId, task: { workspace_id: workspaceId, status: { notIn: ['done', 'cancelled'] } } },
      select: { task: { select: { id: true, title: true, status: true } } }
    });
    if (activeLinks.length) {
      throw {
        statusCode: 409,
        code: 'PROFILE_IN_ACTIVE_TASK',
        message: 'Profile đang được dùng bởi task chưa hoàn tất',
        tasks: activeLinks.map(row => row.task)
      };
    }
    await prisma.workspaceProfile.deleteMany({
      where: { id: wpId, workspace_id: workspaceId }
    });
    return { success: true };
  }

  async assignProfilesToWorker(auth, workspaceId, workerId, ids = []) {
    // Owner or a member with profiles.assign
    const member = await prisma.workspaceMember.findUnique({
      where: { workspace_id_worker_id: { workspace_id: workspaceId, worker_id: workerId } }
    });
    if (!member || !member.active) {
      throw { statusCode: 404, code: 'NOT_FOUND', message: 'Worker chưa là thành viên workspace' };
    }
    const wpRows = await prisma.workspaceProfile.findMany({
      where: { id: { in: ids }, workspace_id: workspaceId }
    });
    const found = new Set(wpRows.map(r => r.id));
    const missing = ids.filter(id => !found.has(id));
    if (missing.length) {
      throw { statusCode: 400, code: 'VALIDATION_ERROR', message: `Một vài profile không thuộc workspace: ${missing.join(', ')}` };
    }
    await prisma.workspaceProfileAssignment.deleteMany({
      where: { workspace_profile_id: { in: ids }, worker_id: workerId }
    });
    await prisma.workspaceProfileAssignment.createMany({
      data: ids.map(id => ({ workspace_profile_id: id, worker_id: workerId, member_id: member.id })),
      skipDuplicates: true
    });
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { policy_revision: { increment: 1 } }
    });
    return { success: true, assigned: ids.length };
  }

  async removeProfileAssignments(auth, workspaceId, workerId, ids = []) {
    const member = await prisma.workspaceMember.findUnique({
      where: { workspace_id_worker_id: { workspace_id: workspaceId, worker_id: workerId } }
    });
    if (!member) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Worker chưa là thành viên workspace' };
    if (!Array.isArray(ids) || ids.length === 0) {
      throw { statusCode: 400, code: 'VALIDATION_ERROR', message: 'Thiếu profile_ids' };
    }
    await prisma.workspaceProfileAssignment.deleteMany({
      where: { worker_id: workerId, workspace_profile_id: { in: ids }, workspace_profile: { workspace_id: workspaceId } }
    });
    await this.bumpRevision(prisma, workspaceId);
    return { success: true, removed: ids.length };
  }

  async createActivity(tx, workspaceId, task, actor, eventType, { message = '', metadata = null } = {}) {
    return tx.taskActivity.create({
      data: {
        workspace_id: workspaceId,
        task_id: task?.id || null,
        task_title_snapshot: task?.title || '',
        actor_id: actor?.sub || 'system',
        actor_type: actor?.type || 'system',
        actor_name: actor?.name || '',
        event_type: eventType,
        message: String(message || '').slice(0, 2000),
        metadata
      }
    });
  }

  async listAssignments(workerId) {
    const rows = await prisma.workspaceProfileAssignment.findMany({
      where: { worker_id: workerId },
      include: { workspace_profile: { include: { workspace: { select: { id: true, name: true } } } } }
    });
    return rows.map(r => ({
      workspace_profile_id: r.workspace_profile_id,
      profile_id: r.workspace_profile.profile_id,
      workspace_id: r.workspace_profile.workspace_id,
      workspace_name: r.workspace_profile.workspace.name
    }));
  }
}

module.exports = new WorkspaceService();
