const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const TRANSITIONS = {
  todo: ['in_progress', 'blocked', 'done', 'cancelled'],
  in_progress: ['blocked', 'done', 'cancelled', 'todo'],
  blocked: ['in_progress', 'done', 'cancelled', 'todo'],
  done: [],
  cancelled: []
};

function assertPriority(p) {
  if (p === undefined) return undefined;
  if (!PRIORITIES.includes(p)) {
    throw { statusCode: 400, code: 'VALIDATION_ERROR', message: 'priority không hợp lệ' };
  }
  return p;
}

class TaskService {
  formatTask(t) {
    return {
      id: t.id,
      workspace_id: t.workspace_id,
      title: t.title,
      description: t.description,
      objective: t.objective,
      priority: t.priority,
      status: t.status,
      assignee_type: t.assignee_type,
      assignee_id: t.assignee_id,
      sop_id: t.sop_id,
      sop_version: t.sop_version,
      sop_snapshot: t.sop_snapshot,
      due_at: t.due_at ? t.due_at.toISOString() : null,
      started_at: t.started_at ? t.started_at.toISOString() : null,
      completed_at: t.completed_at ? t.completed_at.toISOString() : null,
      created_at: t.created_at.toISOString(),
      updated_at: t.updated_at.toISOString(),
      profile_ids: (t.profiles || []).map(p => p.workspace_profile_id)
    };
  }

  async listTasks(auth, workspaceId, { assignee_id, status, priority, from_due, to_due, overdue, page = 1, per_page = 20 }) {
    const where = { workspace_id: workspaceId };
    if (assignee_id) where.assignee_id = assignee_id;
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (from_due || to_due) {
      where.due_at = {};
      if (from_due) where.due_at.gte = new Date(from_due);
      if (to_due) where.due_at.lte = new Date(to_due);
    }
    if (overdue === 'true' || overdue === true) {
      where.status = { in: ['todo', 'in_progress', 'blocked'] };
      where.due_at = { lt: new Date() };
    }
    const skip = (page - 1) * per_page;
    const [rows, total] = await Promise.all([
      prisma.workspaceTask.findMany({
        where,
        include: { profiles: true },
        orderBy: [{ due_at: 'asc' }, { created_at: 'desc' }],
        skip,
        take: per_page
      }),
      prisma.workspaceTask.count({ where })
    ]);
    return { tasks: rows.map(t => this.formatTask(t)), total, page, per_page, total_pages: Math.ceil(total / per_page) };
  }

  async listOverdue(workspaceId, { now = new Date() } = {}) {
    const rows = await prisma.workspaceTask.findMany({
      where: {
        workspace_id: workspaceId,
        status: { in: ['todo', 'in_progress', 'blocked'] },
        due_at: { lt: now }
      },
      include: { profiles: true },
      orderBy: { due_at: 'asc' }
    });
    return rows.map(t => ({
      ...this.formatTask(t),
      overdue_days: Math.max(0, Math.floor((now - t.due_at) / 86400000))
    }));
  }

  async createTask(workspaceId, data, createdBy) {
    const {
      title, description = '', objective = '', priority = 'medium',
      assignee_type = 'owner', assignee_id, due_at, sop_id, sop_version, sop_snapshot
    } = data;
    if (!title || !String(title).trim()) {
      throw { statusCode: 400, code: 'VALIDATION_ERROR', message: 'Thiếu title' };
    }
    const pr = assertPriority(priority);
    if (!assignee_id) {
      throw { statusCode: 400, code: 'VALIDATION_ERROR', message: 'Thiếu assignee_id' };
    }

    // Validate assignee belongs to workspace: must be Owner (owner_id) or a member worker
    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { owner_id: true } });
    if (!ws) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Workspace không tồn tại' };
    if (assignee_type === 'owner') {
      if (assignee_id !== ws.owner_id) {
        throw { statusCode: 400, code: 'VALIDATION_ERROR', message: 'Assignee owner không hợp lệ' };
      }
    } else {
      const member = await prisma.workspaceMember.findUnique({
        where: { workspace_id_worker_id: { workspace_id: workspaceId, worker_id: assignee_id } }
      });
      if (!member) {
        throw { statusCode: 400, code: 'VALIDATION_ERROR', message: 'Assignee worker không thuộc workspace' };
      }
    }

    const task = await prisma.workspaceTask.create({
      data: {
        workspace_id: workspaceId,
        title: String(title).trim(),
        description,
        objective,
        priority: pr || 'medium',
        assignee_type,
        assignee_id,
        sop_id: sop_id || null,
        sop_version: sop_version || null,
        sop_snapshot: sop_snapshot !== undefined ? sop_snapshot : undefined,
        due_at: due_at ? new Date(due_at) : null,
        created_by: createdBy || null
      }
    });
    if (Array.isArray(data.profile_ids) && data.profile_ids.length) {
      await prisma.taskProfile.createMany({
        data: data.profile_ids.map(id => ({ task_id: task.id, workspace_profile_id: id })),
        skipDuplicates: true
      });
    }
    return { id: task.id, success: true };
  }

  async assertAssigneeValid(workspaceId, assigneeType, assigneeId) {
    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { owner_id: true } });
    if (!ws) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Workspace không tồn tại' };
    if (assigneeType === 'owner') {
      if (assigneeId !== ws.owner_id) {
        throw { statusCode: 400, code: 'VALIDATION_ERROR', message: 'Assignee owner không hợp lệ' };
      }
      return;
    }
    const member = await prisma.workspaceMember.findUnique({
      where: { workspace_id_worker_id: { workspace_id: workspaceId, worker_id: assigneeId } }
    });
    if (!member) {
      throw { statusCode: 400, code: 'VALIDATION_ERROR', message: 'Assignee worker không thuộc workspace' };
    }
  }

  async assertAssigneeValid(workspaceId, assigneeType, assigneeId) {
    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { owner_id: true } });
    if (!ws) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Workspace không tồn tại' };
    if (assigneeType === 'owner') {
      if (assigneeId !== ws.owner_id) {
        throw { statusCode: 400, code: 'VALIDATION_ERROR', message: 'Assignee owner không hợp lệ' };
      }
      return;
    }
    const member = await prisma.workspaceMember.findUnique({
      where: { workspace_id_worker_id: { workspace_id: workspaceId, worker_id: assigneeId } }
    });
    if (!member) {
      throw { statusCode: 400, code: 'VALIDATION_ERROR', message: 'Assignee worker không thuộc workspace' };
    }
  }

  async updateTask(workspaceId, taskId, data) {
    const existing = await prisma.workspaceTask.findFirst({ where: { id: taskId, workspace_id: workspaceId } });
    if (!existing) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Task không tồn tại' };

    const patch = {};
    if (data.title !== undefined) patch.title = String(data.title).trim();
    if (data.description !== undefined) patch.description = data.description;
    if (data.objective !== undefined) patch.objective = data.objective;
    if (data.priority !== undefined) patch.priority = assertPriority(data.priority);
    if (data.due_at !== undefined) patch.due_at = data.due_at ? new Date(data.due_at) : null;
    if (data.sop_id !== undefined) patch.sop_id = data.sop_id || null;
    if (data.sop_version !== undefined) patch.sop_version = data.sop_version || null;
    if (data.sop_snapshot !== undefined) patch.sop_snapshot = data.sop_snapshot;

    await prisma.workspaceTask.update({ where: { id: taskId }, data: patch });

    if (data.profile_ids !== undefined && Array.isArray(data.profile_ids)) {
      await prisma.taskProfile.deleteMany({ where: { task_id: taskId } });
      await prisma.taskProfile.createMany({
        data: data.profile_ids.map(id => ({ task_id: taskId, workspace_profile_id: id })),
        skipDuplicates: true
      });
    }
    return { success: true };
  }

  async updateStatus(workspaceId, taskId, { status, actor }) {
    const existing = await prisma.workspaceTask.findUnique({ where: { id: taskId, workspace_id: workspaceId } });
    if (!existing) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Task không tồn tại' };
    if (!TRANSITIONS[existing.status].includes(status)) {
      throw { statusCode: 400, code: 'INVALID_TRANSITION', message: `Không thể chuyển ${existing.status} -> ${status}` };
    }
    const patch = { status, updated_at: new Date() };
    if (status === 'in_progress' && !existing.started_at) patch.started_at = new Date();
    if (status === 'done' || status === 'cancelled') {
      patch.completed_at = new Date();
      patch.started_at = patch.started_at || existing.started_at;
    }
    await prisma.workspaceTask.update({ where: { id: taskId }, data: patch });
    return { success: true, status };
  }

  // Whether the actor may update/delete a task.
  // Owner always; Manager with tasks.manage; otherwise a worker assignee with
  // tasks.update_own may only act on their own task (trusted=false).
  async canMutate(auth, taskId, manageCapability, updateOwnCapability) {
    if (auth.isOwner) return { allowed: true, trusted: true };
    if (auth.capabilities.has(manageCapability)) return { allowed: true, trusted: true };
    const task = await prisma.workspaceTask.findUnique({ where: { id: taskId } });
    if (!task) return { allowed: false };
    const isAssignee = task.assignee_id === auth.actor.sub && task.assignee_type === 'worker';
    if (isAssignee && auth.capabilities.has(updateOwnCapability)) return { allowed: true, trusted: false, assignee: true };
    return { allowed: false };
  }
}

module.exports = new TaskService();