const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const rbac = require('../services/rbac.service');
const { sendError } = require('./error');

// POLICY_MODES are decided server-side, never trusted from a UI payload:
//   plan  — read-only
//   ask   — writes require an approval action card (default for workers)
//   full  — owner-only, still authorized per tool
function applyPolicyMode(declared, isOwner) {
  const safe = ['plan', 'ask', 'full'];
  const mode = safe.includes(declared) ? declared : 'ask';
  if (mode === 'full' && !isOwner) return 'ask';
  return mode;
}

/**
 * Load the actor identity, fetch display name, resolve workspace access, and
 * attach `req.wsAuth`. Must run after `authMw` and only for routes that carry
 * a `:workspaceId` param. Strict: fails closed when there is no Cloud session.
 */
async function workspaceAuth(actor, workspaceId, declaredMode) {
  const auth = await rbac.resolveAccess({ actor, workspaceId });
  const isWorker = actor.type === 'worker';
  let actorName = '';
  if (actor.type === 'owner') {
    const o = await prisma.owner.findUnique({ where: { id: actor.sub }, select: { email: true, name: true } });
    actorName = (o && o.name) || (o && o.email) || '';
  } else {
    const w = await prisma.worker.findUnique({ where: { id: actor.sub }, select: { email: true, name: true } });
    actorName = (w && w.name) || (w && w.email) || '';
  }
return {
    ...auth,
    actor: { ...actor, name: actorName, ownerId: actor.type === 'owner' ? actor.sub : actor.owner_id },
    policyMode: applyPolicyMode(declaredMode, auth.isOwner)
  };
}

function requireWorkspaceAuth(req, res, next) {
  const { workspaceId } = req.params;
  if (!workspaceId || !req.user) {
    return sendError(res, 401, 'TOKEN_INVALID', 'Thiếu quyền xác thực');
  }
  const declaredMode = req.headers['x-policy-mode'];
  workspaceAuth(req.user, workspaceId, declaredMode)
    .then(wsAuth => {
      if (!wsAuth.allowed) {
        return sendError(res, 403, 'FORBIDDEN', 'Không được phép truy cập workspace');
      }
      req.wsAuth = wsAuth;
      next();
    })
    .catch(err => {
      if (err && err.statusCode) return sendError(res, err.statusCode, err.code, err.message);
      next(err);
    });
}

// Guard: deny unless actor has the capability (Owner bypasses).
function requireCapability(capKey) {
  return (req, res, next) => {
    if (!req.wsAuth) return sendError(res, 401, 'TOKEN_INVALID', 'Thiếu phiên xác thực');
    if (req.wsAuth.isOwner || req.wsAuth.capabilities.has(capKey)) return next();
    return sendError(res, 403, 'FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này');
  };
}

// Owner-only for workspace management and membership.
function requireOwnerWs(req, res, next) {
  if (!req.wsAuth || !req.wsAuth.isOwner) {
    return sendError(res, 403, 'FORBIDDEN', 'Chỉ Owner mới có quyền thực hiện thao tác này');
  }
  return next();
}

module.exports = {
  requireWorkspaceAuth,
  requireCapability,
  requireOwnerWs,
  applyPolicyMode
};