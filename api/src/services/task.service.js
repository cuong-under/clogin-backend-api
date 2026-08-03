const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const STATUSES = ['todo', 'in_progress', 'blocked', 'done', 'cancelled'];
const TERMINAL = ['done', 'cancelled'];
const TRANSITIONS = {
  todo: ['in_progress', 'blocked', 'done', 'cancelled'],
  in_progress: ['blocked', 'done', 'cancelled', 'todo'],
  blocked: ['in_progress', 'done', 'cancelled', 'todo'],
  done: [],
  cancelled: []
};

function fail(statusCode, code, message, extra = {}) {
  throw { statusCode, code, message, ...extra };
}

function assertPriority(priority) {
  if (priority === undefined) return undefined;
  if (!PRIORITIES.includes(priority)) fail(400, 'VALIDATION_ERROR', 'priority không hợp lệ');
  return priority;
}

function parseDate(value) {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) fail(400, 'VALIDATION_ERROR', 'due_at không phải ISO date hợp lệ');
  return date;
}

function actorData(actor) {
  if (typeof actor === 'string') return { sub: actor, type: 'user', name: '' };
  return actor || { sub: 'system', type: 'system', name: '' };
}

class TaskService {
  formatTask(task) {
    return {
      id: task.id,
      workspace_id: task.workspace_id,
      title: task.title,
      description: task.description,
      objective: task.objective,
      priority: task.priority,
      status: task.status,
      assignee_type: task.assignee_type,
      assignee_id: task.assignee_id,
      sop_id: task.sop_id,
      sop_version: task.sop_version,
      sop_snapshot: task.sop_snapshot,
      due_at: task.due_at ? task.due_at.toISOString() : null,
      started_at: task.started_at ? task.started_at.toISOString() : null,
      completed_at: task.completed_at ? task.completed_at.toISOString() : null,
      created_at: task.created_at.toISOString(),
      updated_at: task.updated_at.toISOString(),
      profile_ids: (task.profileLinks || task.profiles || []).map(p => p.workspace_profile_id)
    };
  }

  async getTask(auth, workspaceId, taskId) {
    const task = await prisma.workspaceTask.findFirst({
      where: { id: taskId, workspace_id: workspaceId },
      include: { profileLinks: true }
    });
    if (!task) fail(404, 'NOT_FOUND', 'Task không tồn tại');
    return { task: this.formatTask(task) };
  }

  async listTasks(auth, workspaceId, { assignee_id, status, priority, from_due, to_due, overdue, page = 1, per_page = 20 }) {
    const where = { workspace_id: workspaceId };
    if (assignee_id) where.assignee_id = assignee_id;
    if (status) {
      if (!STATUSES.includes(status)) fail(400, 'VALIDATION_ERROR', 'status không hợp lệ');
      where.status = status;
    }
    if (priority) {
      assertPriority(priority);
      where.priority = priority;
    }
    if (from_due || to_due) {
      where.due_at = {};
      if (from_due) where.due_at.gte = parseDate(from_due);
      if (to_due) where.due_at.lte = parseDate(to_due);
    }
    if (overdue === 'true' || overdue === true) {
      where.status = { in: ['todo', 'in_progress', 'blocked'] };
      where.due_at = { lt: new Date() };
    }
    const safePage = Math.max(1, Number(page) || 1);
    const safePerPage = Math.min(100, Math.max(1, Number(per_page) || 20));
    const [rows, total] = await Promise.all([
      prisma.workspaceTask.findMany({
        where,
        include: { profileLinks: true },
        orderBy: [{ due_at: 'asc' }, { created_at: 'desc' }],
        skip: (safePage - 1) * safePerPage,
        take: safePerPage
      }),
      prisma.workspaceTask.count({ where })
    ]);
    return { tasks: rows.map(t => this.formatTask(t)), total, page: safePage, per_page: safePerPage, total_pages: Math.ceil(total / safePerPage) };
  }

  async listOverdue(workspaceId, { now = new Date() } = {}) {
    const rows = await prisma.workspaceTask.findMany({
      where: { workspace_id: workspaceId, status: { in: ['todo', 'in_progress', 'blocked'] }, due_at: { lt: now } },
      include: { profileLinks: true },
      orderBy: { due_at: 'asc' }
    });
    return rows.map(task => ({ ...this.formatTask(task), overdue_days: Math.max(0, Math.floor((now - task.due_at) / 86400000)) }));
  }

  async assertAssigneeValid(workspaceId, assigneeType, assigneeId) {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { owner_id: true } });
    if (!workspace) fail(404, 'NOT_FOUND', 'Workspace không tồn tại');
    if (assigneeType === 'owner') {
      if (assigneeId !== workspace.owner_id) fail(400, 'VALIDATION_ERROR', 'Assignee owner không hợp lệ');
      return;
    }
    if (assigneeType !== 'worker') fail(400, 'VALIDATION_ERROR', 'assignee_type không hợp lệ');
    const member = await prisma.workspaceMember.findUnique({
      where: { workspace_id_worker_id: { workspace_id: workspaceId, worker_id: assigneeId } },
      include: { worker: { select: { active: true } } }
    });
    if (!member || !member.active || !member.worker.active) fail(400, 'VALIDATION_ERROR', 'Assignee worker phải là member active của workspace');
  }

  async validateProfiles(workspaceId, profileIds) {
    if (profileIds === undefined) return undefined;
    if (!Array.isArray(profileIds)) fail(400, 'VALIDATION_ERROR', 'profile_ids phải là mảng');
    const ids = [...new Set(profileIds.filter(id => typeof id === 'string' && id.trim()))];
    const rows = await prisma.workspaceProfile.findMany({ where: { workspace_id: workspaceId, id: { in: ids } }, select: { id: true } });
    const found = new Set(rows.map(row => row.id));
    const missing = ids.filter(id => !found.has(id));
    if (missing.length) fail(400, 'VALIDATION_ERROR', `Profile không thuộc workspace: ${missing.join(', ')}`);
    return ids;
  }

  async getActiveSop(workspaceId, sopId) {
    if (!sopId) return null;
    const sop = await prisma.sopTemplate.findFirst({ where: { id: sopId, workspace_id: workspaceId, is_active: true } });
    if (!sop) fail(400, 'VALIDATION_ERROR', 'Task chỉ được chọn SOP active thuộc workspace');
    return sop;
  }

  async createActivity(tx, workspaceId, task, actor, eventType, message = '', metadata = null) {
    const a = actorData(actor);
    return tx.taskActivity.create({
      data: {
        workspace_id: workspaceId,
        task_id: task?.id || null,
        task_title_snapshot: task?.title || '',
        actor_id: a.sub,
        actor_type: a.type,
        actor_name: a.name || '',
        event_type: eventType,
        message: String(message || '').slice(0, 2000),
        metadata
      }
    });
  }

  async createTask(workspaceId, data, actor) {
    const title = String(data.title || '').trim();
    if (!title) fail(400, 'VALIDATION_ERROR', 'Thiếu title');
    const priority = assertPriority(data.priority || 'medium');
    const assigneeType = data.assignee_type || 'owner';
    if (!data.assignee_id) fail(400, 'VALIDATION_ERROR', 'Thiếu assignee_id');
    await this.assertAssigneeValid(workspaceId, assigneeType, data.assignee_id);
    const profileIds = await this.validateProfiles(workspaceId, data.profile_ids || []);
    const sop = await this.getActiveSop(workspaceId, data.sop_id);
    const dueAt = parseDate(data.due_at);
    const a = actorData(actor);

    const task = await prisma.$transaction(async tx => {
      const created = await tx.workspaceTask.create({
        data: {
          workspace_id: workspaceId,
          title,
          description: String(data.description || ''),
          objective: String(data.objective || ''),
          priority,
          assignee_type: assigneeType,
          assignee_id: data.assignee_id,
          sop_id: sop?.id || null,
          sop_version: sop?.version || null,
          sop_snapshot: sop ? { name: sop.name, version: sop.version, content_markdown: sop.content_markdown, checklist: sop.checklist } : null,
          due_at: dueAt,
          created_by: a.sub || null
        }
      });
      if (profileIds.length) {
        await tx.taskWorkspaceProfileLink.createMany({ data: profileIds.map(id => ({ task_id: created.id, workspace_profile_id: id })), skipDuplicates: true });
      }
      await this.createActivity(tx, workspaceId, created, actor, 'created', '', { priority, assignee_type: assigneeType, assignee_id: data.assignee_id, profile_ids: profileIds });
      return created;
    });
    return { id: task.id, success: true };
  }

  async updateTask(workspaceId, taskId, data, actor, trusted = true) {
    const existing = await prisma.workspaceTask.findFirst({ where: { id: taskId, workspace_id: workspaceId }, include: { profileLinks: true } });
    if (!existing) fail(404, 'NOT_FOUND', 'Task không tồn tại');
    const allowedFields = ['title', 'description', 'objective', 'priority', 'due_at', 'assignee_type', 'assignee_id', 'profile_ids', 'sop_id'];
    const supplied = Object.keys(data).filter(key => data[key] !== undefined);
    if (!trusted) {
      fail(403, 'FORBIDDEN', 'Operator chỉ được đổi status hoặc thêm note cho task được giao');
    }
    if (supplied.some(key => !allowedFields.includes(key)) && trusted) fail(400, 'VALIDATION_ERROR', 'Field task không được hỗ trợ');
    const patch = {};
    if (data.title !== undefined) {
      patch.title = String(data.title).trim();
      if (!patch.title) fail(400, 'VALIDATION_ERROR', 'title không được rỗng');
      if (patch.title.length > 500) fail(400, 'VALIDATION_ERROR', 'title tối đa 500 ký tự');
    }
    if (data.description !== undefined) patch.description = String(data.description).slice(0, 100000);
    if (data.objective !== undefined) patch.objective = String(data.objective).slice(0, 10000);
    if (data.priority !== undefined) patch.priority = assertPriority(data.priority);
    if (data.due_at !== undefined) patch.due_at = parseDate(data.due_at);
    if (data.assignee_id !== undefined || data.assignee_type !== undefined) {
      await this.assertAssigneeValid(workspaceId, data.assignee_type || existing.assignee_type, data.assignee_id || existing.assignee_id);
      patch.assignee_type = data.assignee_type || existing.assignee_type;
      patch.assignee_id = data.assignee_id || existing.assignee_id;
    }
    const profileIds = await this.validateProfiles(workspaceId, data.profile_ids);
    const sop = data.sop_id !== undefined ? await this.getActiveSop(workspaceId, data.sop_id) : undefined;
    if (sop !== undefined) {
      patch.sop_id = sop?.id || null;
      patch.sop_version = sop?.version || null;
      patch.sop_snapshot = sop ? { name: sop.name, version: sop.version, content_markdown: sop.content_markdown, checklist: sop.checklist } : null;
    }
    if (!Object.keys(patch).length && profileIds === undefined) return { success: true };
    const before = this.formatTask(existing);
    const updated = await prisma.$transaction(async tx => {
      const row = await tx.workspaceTask.update({ where: { id: taskId }, data: patch });
      if (profileIds !== undefined) {
        await tx.taskWorkspaceProfileLink.deleteMany({ where: { task_id: taskId } });
        if (profileIds.length) await tx.taskWorkspaceProfileLink.createMany({ data: profileIds.map(id => ({ task_id: taskId, workspace_profile_id: id })), skipDuplicates: true });
      }
      const after = { ...this.formatTask({ ...row, profileLinks: profileIds === undefined ? existing.profileLinks : profileIds.map(id => ({ workspace_profile_id: id })) }) };
      const changed = {};
      for (const field of ['title', 'description', 'objective', 'priority', 'due_at', 'assignee_type', 'assignee_id', 'sop_id', 'sop_version', 'profile_ids']) {
        if (JSON.stringify(before[field]) !== JSON.stringify(after[field])) changed[field] = { before: before[field], after: after[field] };
      }
      await this.createActivity(tx, workspaceId, row, actor, 'updated', '', changed);
      return row;
    });
    return { success: true, task: this.formatTask({ ...updated, profileLinks: profileIds === undefined ? existing.profileLinks : profileIds.map(id => ({ workspace_profile_id: id })) }) };
  }

  async updateStatus(workspaceId, taskId, { status, actor }) {
    if (!STATUSES.includes(status)) fail(400, 'VALIDATION_ERROR', 'status không hợp lệ');
    const existing = await prisma.workspaceTask.findFirst({ where: { id: taskId, workspace_id: workspaceId } });
    if (!existing) fail(404, 'NOT_FOUND', 'Task không tồn tại');
    if (!TRANSITIONS[existing.status].includes(status)) fail(400, 'INVALID_TRANSITION', `Không thể chuyển ${existing.status} -> ${status}`);
    const patch = { status, updated_at: new Date() };
    if (status === 'in_progress' && !existing.started_at) patch.started_at = new Date();
    if (TERMINAL.includes(status)) patch.completed_at = new Date();
    if (!TERMINAL.includes(status)) patch.completed_at = null;
    const updated = await prisma.$transaction(async tx => {
      const row = await tx.workspaceTask.update({ where: { id: taskId }, data: patch });
      await this.createActivity(tx, workspaceId, row, actor, 'status_changed', '', { before: existing.status, after: status });
      return row;
    });
    return { success: true, status: updated.status };
  }

  async reopenTask(workspaceId, taskId, status, reason, actor) {
    if (!['todo', 'in_progress'].includes(status)) fail(400, 'VALIDATION_ERROR', 'Reopen status phải là todo hoặc in_progress');
    const note = String(reason || '').trim();
    if (!note || note.length > 2000) fail(400, 'VALIDATION_ERROR', 'Lý do reopen bắt buộc, tối đa 2.000 ký tự');
    const existing = await prisma.workspaceTask.findFirst({ where: { id: taskId, workspace_id: workspaceId } });
    if (!existing) fail(404, 'NOT_FOUND', 'Task không tồn tại');
    if (!TERMINAL.includes(existing.status)) fail(400, 'INVALID_TRANSITION', 'Chỉ task done/cancelled mới được reopen');
    const row = await prisma.$transaction(async tx => {
      const updated = await tx.workspaceTask.update({ where: { id: taskId }, data: { status, completed_at: null, started_at: status === 'in_progress' ? new Date() : null } });
      await this.createActivity(tx, workspaceId, updated, actor, 'reopened', note, { before: existing.status, after: status });
      return updated;
    });
    return { success: true, status: row.status };
  }

  async addNote(workspaceId, taskId, message, actor) {
    const note = String(message || '').trim();
    if (!note || note.length > 2000) fail(400, 'VALIDATION_ERROR', 'Note bắt buộc, tối đa 2.000 ký tự');
    const task = await prisma.workspaceTask.findFirst({ where: { id: taskId, workspace_id: workspaceId } });
    if (!task) fail(404, 'NOT_FOUND', 'Task không tồn tại');
    const activity = await prisma.taskActivity.create({
      data: {
        workspace_id: workspaceId,
        task_id: taskId,
        task_title_snapshot: task.title,
        actor_id: actor.sub,
        actor_type: actor.type,
        actor_name: actor.name || '',
        event_type: 'note_added',
        message: note
      }
    });
    return { success: true, activity: this.formatActivity(activity) };
  }

  async deleteTask(workspaceId, taskId, actor) {
    const task = await prisma.workspaceTask.findFirst({ where: { id: taskId, workspace_id: workspaceId } });
    if (!task) fail(404, 'NOT_FOUND', 'Task không tồn tại');
    await prisma.$transaction(async tx => {
      await this.createActivity(tx, workspaceId, task, actor, 'deleted');
      await tx.workspaceTask.delete({ where: { id: taskId } });
    });
    return { success: true };
  }

  normalizeBatchIds(taskIds) {
    if (!Array.isArray(taskIds) || taskIds.length === 0) fail(400, 'VALIDATION_ERROR', 'task_ids phải là mảng không rỗng');
    if (taskIds.length > 20) fail(400, 'BATCH_LIMIT_EXCEEDED', 'Batch tối đa 20 task');
    const ids = [...new Set(taskIds.filter(id => typeof id === 'string' && id.trim()))];
    if (ids.length !== taskIds.length) fail(400, 'VALIDATION_ERROR', 'task_ids chứa giá trị trùng hoặc không hợp lệ');
    return ids;
  }

  async getBatchTasks(workspaceId, taskIds) {
    const ids = this.normalizeBatchIds(taskIds);
    const tasks = await prisma.workspaceTask.findMany({ where: { workspace_id: workspaceId, id: { in: ids } } });
    if (tasks.length !== ids.length) {
      const found = new Set(tasks.map(task => task.id));
      fail(404, 'NOT_FOUND', `Không tìm thấy task: ${ids.find(id => !found.has(id))}`);
    }
    const byId = new Map(tasks.map(task => [task.id, task]));
    return ids.map(id => byId.get(id));
  }

  async assertBatchManage(auth) {
    if (!auth.isOwner && !auth.capabilities.has('tasks.manage')) {
      fail(403, 'FORBIDDEN', 'Batch action yêu cầu tasks.manage');
    }
  }

  async batchStatus(auth, workspaceId, taskIds, status) {
    await this.assertBatchManage(auth);
    if (!STATUSES.includes(status)) fail(400, 'VALIDATION_ERROR', 'status không hợp lệ');
    const tasks = await this.getBatchTasks(workspaceId, taskIds);
    for (const task of tasks) {
      if (!TRANSITIONS[task.status].includes(status)) {
        fail(400, 'INVALID_TRANSITION', `Task ${task.id} không thể chuyển ${task.status} -> ${status}`);
      }
    }
    const now = new Date();
    const results = await prisma.$transaction(async tx => {
      const output = [];
      for (const task of tasks) {
        const data = { status, updated_at: now };
        if (status === 'in_progress' && !task.started_at) data.started_at = now;
        data.completed_at = TERMINAL.includes(status) ? now : null;
        const row = await tx.workspaceTask.update({ where: { id: task.id }, data });
        await this.createActivity(tx, workspaceId, row, auth.actor, 'status_changed', '', { before: task.status, after: status, batch: true });
        output.push({ id: row.id, status: row.status });
      }
      return output;
    });
    return { success: true, atomic: true, results };
  }

  async batchAssignment(auth, workspaceId, taskIds, assigneeType, assigneeId) {
    await this.assertBatchManage(auth);
    await this.assertAssigneeValid(workspaceId, assigneeType, assigneeId);
    const tasks = await this.getBatchTasks(workspaceId, taskIds);
    const results = await prisma.$transaction(async tx => {
      const output = [];
      for (const task of tasks) {
        const row = await tx.workspaceTask.update({
          where: { id: task.id },
          data: { assignee_type: assigneeType, assignee_id: assigneeId }
        });
        await this.createActivity(tx, workspaceId, row, auth.actor, 'assignee_changed', '', {
          before: { assignee_type: task.assignee_type, assignee_id: task.assignee_id },
          after: { assignee_type: assigneeType, assignee_id: assigneeId },
          batch: true
        });
        output.push({ id: row.id, assignee_type: row.assignee_type, assignee_id: row.assignee_id });
      }
      return output;
    });
    return { success: true, atomic: true, results };
  }

  async batchNote(auth, workspaceId, taskIds, message) {
    const note = String(message || '').trim();
    if (!note || note.length > 2000) fail(400, 'VALIDATION_ERROR', 'Note bắt buộc, tối đa 2.000 ký tự');
    const tasks = await this.getBatchTasks(workspaceId, taskIds);
    for (const task of tasks) {
      const allowed = auth.isOwner || auth.capabilities.has('tasks.manage') ||
        (auth.capabilities.has('tasks.update_own') && task.assignee_type === 'worker' && task.assignee_id === auth.actor.sub);
      if (!allowed) fail(403, 'FORBIDDEN', `Bạn không có quyền thêm note cho task ${task.id}`);
    }
    const results = await prisma.$transaction(async tx => {
      const output = [];
      for (const task of tasks) {
        const activity = await this.createActivity(tx, workspaceId, task, auth.actor, 'note_added', note, { batch: true });
        output.push({ id: task.id, activity_id: activity.id });
      }
      return output;
    });
    return { success: true, atomic: true, results };
  }

  formatActivity(activity) {
    return {
      id: activity.id,
      workspace_id: activity.workspace_id,
      task_id: activity.task_id,
      task_title_snapshot: activity.task_title_snapshot,
      actor_id: activity.actor_id,
      actor_type: activity.actor_type,
      actor_name: activity.actor_name,
      event_type: activity.event_type,
      message: activity.message,
      metadata: activity.metadata,
      created_at: activity.created_at.toISOString()
    };
  }

  async listActivity(workspaceId, taskId, { cursor, limit = 50 } = {}) {
    const take = Math.min(100, Math.max(1, Number(limit) || 50));
    const rows = await prisma.taskActivity.findMany({
      where: { workspace_id: workspaceId, ...(taskId ? { task_id: taskId } : {}) },
      orderBy: { created_at: 'desc' },
      take: take + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {})
    });
    const hasMore = rows.length > take;
    const items = rows.slice(0, take);
    return { activities: items.map(row => this.formatActivity(row)), next_cursor: hasMore ? items[items.length - 1].id : null };
  }

  async canMutate(auth, workspaceId, taskId, manageCapability, updateOwnCapability) {
    const task = await prisma.workspaceTask.findFirst({ where: { id: taskId, workspace_id: workspaceId } });
    if (!task) return { allowed: false, missing: true };
    if (auth.isOwner || auth.capabilities.has(manageCapability)) return { allowed: true, trusted: true, task };
    const isAssignee = task.assignee_id === auth.actor.sub && task.assignee_type === 'worker';
    if (isAssignee && auth.capabilities.has(updateOwnCapability)) return { allowed: true, trusted: false, assignee: true, task };
    return { allowed: false, task };
  }
}

module.exports = new TaskService();
