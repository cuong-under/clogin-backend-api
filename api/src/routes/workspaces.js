const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { authMw, requireOwner } = require('../middleware/auth');
const {
  requireWorkspaceAuth,
  requireCapability,
  requireOwnerWs
} = require('../middleware/workspace');
const workspaceService = require('../services/workspace.service');
const sopService = require('../services/sop.service');
const taskService = require('../services/task.service');
const aiAudit = require('../services/ai-audit.service');
const vaultService = require('../services/vault.service');
const { CAPABILITIES } = require('../config/capabilities');
const { createGrant, verifyGrant, sha256, TTL_MS } = require('../utils/grant');
const { sendError } = require('../middleware/error');

const ACTION_CLASSES = ['read', 'write', 'destructive', 'sensitive'];

router.use(authMw);

// ---------- Workspace CRUD ----------
router.get('/', async (req, res, next) => {
  try {
    const result = await workspaceService.listWorkspaces({ type: req.user.type, sub: req.user.sub });
    res.status(200).json({ workspaces: result });
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.post('/', requireOwner, async (req, res, next) => {
  try {
    const ws = await workspaceService.createWorkspace(req.owner.id, req.body);
    res.status(201).json({ workspace: ws });
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.get('/:workspaceId', requireWorkspaceAuth, async (req, res, next) => {
  try {
    const ws = await workspaceService.getWorkspace(req.wsAuth, req.params.workspaceId);
    res.status(200).json({ workspace: ws });
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.patch('/:workspaceId', requireWorkspaceAuth, requireOwnerWs, async (req, res, next) => {
  try {
    const ws = await workspaceService.updateWorkspace(req.wsAuth, req.params.workspaceId, req.body);
    res.status(200).json({ workspace: ws });
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.delete('/:workspaceId', requireWorkspaceAuth, requireOwnerWs, async (req, res, next) => {
  try {
    const result = await workspaceService.deleteWorkspace(req.wsAuth, req.params.workspaceId, req.body?.confirm_name);
    res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message, { workspaces: err.workspaces });
    next(err);
  }
});

// ---------- Members ----------
router.get('/:workspaceId/members', requireWorkspaceAuth, async (req, res, next) => {
  try {
    const result = await workspaceService.listMembers(req.wsAuth, req.params.workspaceId);
    res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.put('/:workspaceId/members/:workerId', requireWorkspaceAuth, requireOwnerWs, async (req, res, next) => {
  try {
    if (req.body?.active === false) {
      const result = await workspaceService.deactivateMember(
        req.wsAuth,
        req.params.workspaceId,
        req.params.workerId,
        false,
        req.body?.reassign_to
      );
      return res.status(200).json(result);
    }
    const result = await workspaceService.upsertMember(req.wsAuth, req.params.workspaceId, req.params.workerId, req.body);
    res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.delete('/:workspaceId/members/:workerId', requireWorkspaceAuth, requireOwnerWs, async (req, res, next) => {
  try {
    const result = await workspaceService.deleteMember(req.wsAuth, req.params.workspaceId, req.params.workerId, req.body?.reassign_to);
    res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message, { tasks: err.tasks, assignees: err.assignees });
    next(err);
  }
});

router.patch('/:workspaceId/members/:workerId', requireWorkspaceAuth, requireOwnerWs, async (req, res, next) => {
  try {
    const result = await workspaceService.deactivateMember(
      req.wsAuth,
      req.params.workspaceId,
      req.params.workerId,
      req.body?.active !== false,
      req.body?.reassign_to
    );
    res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message, { tasks: err.tasks, assignees: err.assignees });
    next(err);
  }
});

// ---------- Workspace profiles ----------
router.get('/:workspaceId/profiles', requireWorkspaceAuth, async (req, res, next) => {
  try {
    const result = await workspaceService.listWorkspaceProfiles(req.wsAuth, req.params.workspaceId);
    res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.post('/:workspaceId/profiles', requireWorkspaceAuth, requireOwnerWs, async (req, res, next) => {
  try {
    const result = await workspaceService.addProfileToWorkspace(req.wsAuth, req.params.workspaceId, req.body.profile_id, req.body.confirm_reuse === true);
    res.status(201).json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message, { workspaces: err.workspaces });
    next(err);
  }
});

router.delete('/:workspaceId/profiles/assignments', requireWorkspaceAuth, requireCapability(CAPABILITIES.PROFILES_ASSIGN), async (req, res, next) => {
  try {
    const result = await workspaceService.removeProfileAssignments(
      req.wsAuth,
      req.params.workspaceId,
      req.body.worker_id,
      req.body.profile_ids || []
    );
    res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.post('/:workspaceId/profiles/assignments', requireWorkspaceAuth, requireCapability(CAPABILITIES.PROFILES_ASSIGN), async (req, res, next) => {
  try {
    const result = await workspaceService.assignProfilesToWorker(
      req.wsAuth,
      req.params.workspaceId,
      req.body.worker_id,
      req.body.profile_ids || []
    );
    res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message, { tasks: err.tasks });
    next(err);
  }
});

router.delete('/:workspaceId/profiles/:wpId', requireWorkspaceAuth, requireOwnerWs, async (req, res, next) => {
  try {
    const result = await workspaceService.removeProfileFromWorkspace(req.wsAuth, req.params.workspaceId, req.params.wpId);
    res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message, { tasks: err.tasks });
    next(err);
  }
});

// ---------- Proxy Vault ----------
function vaultEnabled(req, res, next) {
  if (!vaultService.isConfigured()) {
    return sendError(res, 503, 'VAULT_NOT_CONFIGURED', 'Proxy Vault chưa được cấu hình PROXY_VAULT_MASTER_KEY');
  }
  return next();
}

router.get('/:workspaceId/proxy-vault', requireWorkspaceAuth, requireCapability(CAPABILITIES.PROXIES_READ), async (req, res, next) => {
  try {
    const result = await vaultService.listMeta(req.params.workspaceId, req.query);
    res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.post('/:workspaceId/proxy-vault', requireWorkspaceAuth, vaultEnabled, requireCapability(CAPABILITIES.PROXIES_MANAGE), async (req, res, next) => {
  try {
    const result = await vaultService.create({
      workspaceId: req.params.workspaceId,
      createdBy: req.wsAuth.actor.sub,
      data: req.body
    });
    res.status(201).json({ proxy: result });
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.patch('/:workspaceId/proxy-vault/:vaultId', requireWorkspaceAuth, vaultEnabled, requireCapability(CAPABILITIES.PROXIES_MANAGE), async (req, res, next) => {
  try {
    const result = await vaultService.updateMeta(req.params.workspaceId, req.params.vaultId, req.body);
    res.status(200).json({ proxy: result });
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.delete('/:workspaceId/proxy-vault/:vaultId', requireWorkspaceAuth, vaultEnabled, requireCapability(CAPABILITIES.PROXIES_MANAGE), async (req, res, next) => {
  try {
    const result = await vaultService.revoke(req.params.workspaceId, req.params.vaultId);
    res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

// Credential resolution: proxies.use + profile scope, TLS-only, no-store.
router.post('/:workspaceId/proxy-vault/:vaultId/resolve', requireWorkspaceAuth, vaultEnabled, requireCapability(CAPABILITIES.PROXIES_USE), async (req, res, next) => {
  try {
    const result = await vaultService.resolve({
      workspaceId: req.params.workspaceId,
      id: req.params.vaultId,
      auth: req.wsAuth
    });
    res.set('Cache-Control', 'no-store');
    res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

// Map a vault proxy to a workspace profile (proxies.assign).
router.post('/:workspaceId/profiles/:wpId/assign-vault', requireWorkspaceAuth, requireCapability(CAPABILITIES.PROXIES_ASSIGN), async (req, res, next) => {
  try {
    const vaultId = req.body.vault_id;
    const entry = await prisma.proxyVaultEntry.findFirst({ where: { id: vaultId, workspace_id: req.params.workspaceId } });
    if (!entry) return sendError(res, 404, 'NOT_FOUND', 'Vault entry không thuộc workspace này');
    const updated = await prisma.workspaceProfile.updateMany({
      where: { id: req.params.wpId, workspace_id: req.params.workspaceId },
      data: { vault_proxy_id: vaultId, updated_at: new Date() }
    });
    if (updated.count === 0) return sendError(res, 404, 'NOT_FOUND', 'Workspace profile không tồn tại');
    res.status(200).json({ success: true, vault_proxy_id: vaultId });
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

// ---------- SOPs ----------
router.get('/:workspaceId/sops', requireWorkspaceAuth, requireCapability(CAPABILITIES.SOP_READ), async (req, res, next) => {
  try {
    const result = await sopService.listSops(req.params.workspaceId, req.query);
    res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.post('/:workspaceId/sops', requireWorkspaceAuth, requireCapability(CAPABILITIES.SOP_MANAGE), async (req, res, next) => {
  try {
    const result = await sopService.createVersion(req.params.workspaceId, { ...req.body, created_by: req.wsAuth.actor.sub });
    res.status(201).json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.post('/:workspaceId/sops/:name/activate', requireWorkspaceAuth, requireCapability(CAPABILITIES.SOP_MANAGE), async (req, res, next) => {
  try {
    const result = await sopService.activateVersion(req.params.workspaceId, req.params.name, req.body.version);
    res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

// ---------- Tasks ----------
router.get('/:workspaceId/tasks/overdue', requireWorkspaceAuth, requireCapability(CAPABILITIES.TASKS_READ), async (req, res, next) => {
  try {
    const result = await taskService.listOverdue(req.params.workspaceId, { now: new Date() });
    res.status(200).json({ tasks: result });
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.get('/:workspaceId/tasks', requireWorkspaceAuth, requireCapability(CAPABILITIES.TASKS_READ), async (req, res, next) => {
  try {
    const result = await taskService.listTasks(req.wsAuth, req.params.workspaceId, req.query);
    res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.post('/:workspaceId/tasks', requireWorkspaceAuth, requireCapability(CAPABILITIES.TASKS_MANAGE), async (req, res, next) => {
  try {
    const result = await taskService.createTask(req.params.workspaceId, req.body, req.wsAuth.actor);
    res.status(201).json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.get('/:workspaceId/tasks/:taskId', requireWorkspaceAuth, requireCapability(CAPABILITIES.TASKS_READ), async (req, res, next) => {
  try {
    const result = await taskService.getTask(req.wsAuth, req.params.workspaceId, req.params.taskId);
    res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

// Batch routes must be registered before /tasks/:taskId/status because
// Express would otherwise interpret "batch" as a task id.
router.post('/:workspaceId/tasks/batch/status', requireWorkspaceAuth, requireCapability(CAPABILITIES.TASKS_MANAGE), async (req, res, next) => {
  try {
    const result = await taskService.batchStatus(req.wsAuth, req.params.workspaceId, req.body.task_ids, req.body.status);
    res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.post('/:workspaceId/tasks/batch/assign', requireWorkspaceAuth, requireCapability(CAPABILITIES.TASKS_MANAGE), async (req, res, next) => {
  try {
    const result = await taskService.batchAssignment(req.wsAuth, req.params.workspaceId, req.body.task_ids, req.body.assignee_type, req.body.assignee_id);
    res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.post('/:workspaceId/tasks/batch/note', requireWorkspaceAuth, async (req, res, next) => {
  try {
    const result = await taskService.batchNote(req.wsAuth, req.params.workspaceId, req.body.task_ids, req.body.message);
    res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.patch('/:workspaceId/tasks/:taskId', requireWorkspaceAuth, async (req, res, next) => {
  try {
    const perm = await taskService.canMutate(req.wsAuth, req.params.workspaceId, req.params.taskId, CAPABILITIES.TASKS_MANAGE, CAPABILITIES.TASKS_UPDATE_OWN);
    if (!perm.allowed) return sendError(res, perm.missing ? 404 : 403, perm.missing ? 'NOT_FOUND' : 'FORBIDDEN', perm.missing ? 'Task không tồn tại' : 'Bạn không có quyền sửa task này');
    const result = await taskService.updateTask(req.params.workspaceId, req.params.taskId, req.body, req.wsAuth.actor, perm.trusted);
    res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.post('/:workspaceId/tasks/:taskId/status', requireWorkspaceAuth, async (req, res, next) => {
  try {
    const perm = await taskService.canMutate(req.wsAuth, req.params.workspaceId, req.params.taskId, CAPABILITIES.TASKS_MANAGE, CAPABILITIES.TASKS_UPDATE_OWN);
    if (!perm.allowed) return sendError(res, perm.missing ? 404 : 403, perm.missing ? 'NOT_FOUND' : 'FORBIDDEN', perm.missing ? 'Task không tồn tại' : 'Bạn không có quyền đổi trạng thái task này');
    const result = await taskService.updateStatus(req.params.workspaceId, req.params.taskId, { status: req.body.status, actor: req.wsAuth.actor });
    res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.delete('/:workspaceId/tasks/:taskId', requireWorkspaceAuth, requireOwnerWs, async (req, res, next) => {
  try {
    const result = await taskService.deleteTask(req.params.workspaceId, req.params.taskId, req.wsAuth.actor);
    res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.post('/:workspaceId/tasks/:taskId/reopen', requireWorkspaceAuth, requireCapability(CAPABILITIES.TASKS_MANAGE), async (req, res, next) => {
  try {
    const result = await taskService.reopenTask(req.params.workspaceId, req.params.taskId, req.body.status, req.body.reason, req.wsAuth.actor);
    res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.post('/:workspaceId/tasks/:taskId/activity', requireWorkspaceAuth, async (req, res, next) => {
  try {
    const perm = await taskService.canMutate(req.wsAuth, req.params.workspaceId, req.params.taskId, CAPABILITIES.TASKS_MANAGE, CAPABILITIES.TASKS_UPDATE_OWN);
    if (!perm.allowed) return sendError(res, perm.missing ? 404 : 403, perm.missing ? 'NOT_FOUND' : 'FORBIDDEN', 'Bạn không có quyền thêm note cho task này');
    const result = await taskService.addNote(req.params.workspaceId, req.params.taskId, req.body.message, req.wsAuth.actor);
    res.status(201).json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.get('/:workspaceId/tasks/:taskId/activity', requireWorkspaceAuth, requireCapability(CAPABILITIES.TASKS_READ), async (req, res, next) => {
  try {
    const result = await taskService.listActivity(req.params.workspaceId, req.params.taskId, req.query);
    res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.get('/:workspaceId/task-activity', requireWorkspaceAuth, requireCapability(CAPABILITIES.TASKS_READ), async (req, res, next) => {
  try {
    const result = await taskService.listActivity(req.params.workspaceId, null, req.query);
    res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

// ---------- Audit ----------
router.get('/:workspaceId/audit/summary', requireWorkspaceAuth, requireCapability(CAPABILITIES.AUDIT_READ), async (req, res, next) => {
  try {
    const result = await aiAudit.summary(req.params.workspaceId, req.query);
    res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

// ---------- AI authorization & audit lifecycle ----------
// authorize: worker/owner requesting a tool execution. Returns a short-lived grant
// for writes when the capability is present; reads return allow without grant.
router.post('/:workspaceId/ai/authorize', requireWorkspaceAuth, requireCapability(CAPABILITIES.AI_USE), async (req, res, next) => {
  try {
    const { capability, tool_name, action_class, target_id, parameters } = req.body;
    if (!capability || !ACTION_CLASSES.includes(action_class)) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Thiếu capability hoặc action_class không hợp lệ');
    }
    const digest = parameters !== undefined ? sha256(parameters) : null;
    const correlationId = req.body.correlation_id || null;
    const decision = await aiAudit.authorize({
      workspaceId: req.params.workspaceId,
      auth: req.wsAuth,
      capability,
      toolName: tool_name,
      actionClass: action_class,
      targetId: target_id || '',
      parameterDigest: digest,
      correlationId
    });

    if (!decision.allowed) {
      return res.status(200).json(decision);
    }

    // Writes get a short-lived grant bound to actor/workspace/tool/digest + policy revision.
    let grant = null;
    if (action_class !== 'read') {
      grant = createGrant({
        actorId: req.wsAuth.actor.sub,
        workspaceId: req.params.workspaceId,
        toolName: tool_name,
        capability,
        actionClass: action_class,
        parameterDigest: digest,
        policyRevision: decision.policy_revision
      });
    }
    res.status(200).json({
      ...decision,
      grant: grant ? grant.token : null,
      grant_expires_at: grant ? grant.expiresAt : null,
      grant_ttl_ms: TTL_MS
    });
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

// Any write whose grant has expired or whose policy_revision increased is denied.
router.post('/:workspaceId/ai/verify-grant', requireWorkspaceAuth, async (req, res, next) => {
  try {
    const grant = verifyGrant(req.body.grant);
    if (!grant.valid) return res.status(403).json({ allowed: false, reason: grant.reason });
    if (grant.payload.workspaceId !== req.params.workspaceId || grant.payload.actorId !== req.wsAuth.actor.sub) {
      return res.status(403).json({ allowed: false, reason: 'BOUND_MISMATCH' });
    }
    if (grant.payload.policyRevision !== req.wsAuth.policy) {
      return res.status(403).json({ allowed: false, reason: 'POLICY_CHANGED' });
    }
    res.status(200).json({ allowed: true, grant: grant.payload });
  } catch (err) {
    next(err);
  }
});

// tool-started / tool-finished bound to a grant correlation id for write auditing.
function auditGrant(req, res, next) {
  const grant = verifyGrant(req.body.grant || req.headers['x-grant']);
  if (!grant.valid) {
    return sendError(res, 403, 'GRANT_INVALID', `Grant không hợp lệ (${grant.reason})`);
  }
  if (grant.payload.workspaceId !== req.params.workspaceId || grant.payload.actorId !== req.wsAuth.actor.sub) {
    return sendError(res, 403, 'GRANT_BOUND', 'Grant không thuộc workspace/actor này');
  }
  if (grant.payload.policyRevision !== req.wsAuth.policy) {
    return sendError(res, 403, 'POLICY_CHANGED', 'Chính sách workspace đã thay đổi, cần authorize lại');
  }
  req.grant = grant.payload;
  next();
}

router.post('/:workspaceId/ai/tool-started', requireWorkspaceAuth, auditGrant, async (req, res, next) => {
  try {
    await aiAudit.recordToolStarted(req.params.workspaceId, {
      owner_id: req.wsAuth.workspace.owner_id,
      actor_id: req.wsAuth.actor.sub,
      actor_type: req.wsAuth.actor.type,
      actor_name: req.wsAuth.actor.name,
      user_role: req.wsAuth.role,
      policy_mode: req.wsAuth.policyMode,
      tool_name: req.grant.toolName,
      capability: req.grant.capability,
      action_class: req.grant.actionClass,
      correlation_id: req.body.correlation_id || null,
      parameter_digest: req.grant.parameterDigest || null,
      confirmed: true,
      status: 'started'
    });
    res.status(200).json({ success: true });
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

router.post('/:workspaceId/ai/tool-finished', requireWorkspaceAuth, auditGrant, async (req, res, next) => {
  try {
    await aiAudit.recordToolFinished(req.params.workspaceId, {
      owner_id: req.wsAuth.workspace.owner_id,
      actor_id: req.wsAuth.actor.sub,
      actor_type: req.wsAuth.actor.type,
      actor_name: req.wsAuth.actor.name,
      user_role: req.wsAuth.role,
      policy_mode: req.wsAuth.policyMode,
      tool_name: req.grant.toolName,
      capability: req.grant.capability,
      action_class: req.grant.actionClass,
      target_id: req.body.target_id || '',
      correlation_id: req.body.correlation_id || null,
      parameter_digest: req.grant.parameterDigest || null,
      result_digest: req.body.result_digest || null,
      confirmed: true,
      status: req.body.status || 'finished'
    });
    res.status(200).json({ success: true });
  } catch (err) {
    if (err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
    next(err);
  }
});

module.exports = router;
