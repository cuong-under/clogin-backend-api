const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const {
  isConfigured,
  encryptCredential,
  decryptCredential,
  credentialFingerprint
} = require('../utils/vault-crypto');

const KINDS = ['http', 'https', 'socks4', 'socks5'];

function publicMeta(e) {
  return {
    id: e.id,
    label: e.label,
    kind: e.kind,
    host: e.host,
    port: e.port,
    country: e.country,
    region: e.region,
    health_state: e.health_state,
    last_checked_at: e.last_checked_at ? e.last_checked_at.toISOString() : null,
    fingerprint: e.credential_fingerprint ? e.credential_fingerprint.slice(0, 12) : null,
    created_at: e.created_at.toISOString(),
    updated_at: e.updated_at.toISOString()
  };
}

class VaultService {
  isConfigured() {
    return isConfigured();
  }

  async listMeta(workspaceId, { kind, country, health_state } = {}) {
    const where = { workspace_id: workspaceId };
    if (kind) where.kind = kind;
    if (country) where.country = country;
    if (health_state) where.health_state = health_state;
    const rows = await prisma.proxyVaultEntry.findMany({
      where,
      orderBy: { created_at: 'desc' }
    });
    return { proxies: rows.map(publicMeta) };
  }

  async create({ workspaceId, createdBy, data }) {
    const { label, kind = 'http', host, port, country = '', region = '', username, password } = data;
    if (!label || !host || !port || username === undefined || password === undefined) {
      throw { statusCode: 400, code: 'VALIDATION_ERROR', message: 'Thiếu label/host/port/username/password' };
    }
    if (!KINDS.includes(kind)) {
      throw { statusCode: 400, code: 'VALIDATION_ERROR', message: 'kind không hợp lệ' };
    }
    const credential = { username: String(username), password: String(password) };
    const sealed = encryptCredential(credential);
    const fp = credentialFingerprint(credential);

    const entry = await prisma.proxyVaultEntry.create({
      data: {
        workspace_id: workspaceId,
        label: String(label),
        kind,
        host: String(host),
        port: Number(port),
        country,
        region,
        ...sealed,
        credential_fingerprint: fp,
        created_by: createdBy || null
      }
    });
    return publicMeta(entry);
  }

  async updateMeta(workspaceId, id, data) {
    const entry = await prisma.proxyVaultEntry.findFirst({ where: { id, workspace_id: workspaceId } });
    if (!entry) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Không tìm thấy vault entry' };

    const patch = {};
    if (data.label !== undefined) patch.label = String(data.label);
    if (data.kind !== undefined) {
      if (!KINDS.includes(data.kind)) throw { statusCode: 400, code: 'VALIDATION_ERROR', message: 'kind không hợp lệ' };
      patch.kind = data.kind;
    }
    if (data.host !== undefined) patch.host = String(data.host);
    if (data.port !== undefined) patch.port = Number(data.port);
    if (data.country !== undefined) patch.country = String(data.country);
    if (data.region !== undefined) patch.region = String(data.region);
    if (data.health_state !== undefined) patch.health_state = String(data.health_state);
    if (data.last_checked_at !== undefined) patch.last_checked_at = data.last_checked_at ? new Date(data.last_checked_at) : null;

    if (data.username !== undefined || data.password !== undefined) {
      const plain = decryptCredential(entry);
      const next = {
        username: data.username !== undefined ? String(data.username) : plain.username,
        password: data.password !== undefined ? String(data.password) : plain.password
      };
      const resealed = encryptCredential(next);
      Object.assign(patch, resealed);
      patch.credential_fingerprint = credentialFingerprint(next);
    }

    const updated = await prisma.proxyVaultEntry.update({ where: { id }, data: patch });
    return publicMeta(updated);
  }

  async revoke(workspaceId, id) {
    const entry = await prisma.proxyVaultEntry.findFirst({ where: { id, workspace_id: workspaceId } });
    if (!entry) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Không tìm thấy vault entry' };
    await prisma.$transaction([
      prisma.workspaceProfile.updateMany({
        where: { workspace_id: workspaceId, vault_proxy_id: id },
        data: { vault_proxy_id: null }
      }),
      prisma.proxyVaultEntry.delete({ where: { id } })
    ]);
    return { success: true };
  }

  // Credential resolution: only for `proxies.use`, over TLS, no-store, audited.
  async resolve({ workspaceId, id, auth }) {
    const entry = await prisma.proxyVaultEntry.findFirst({ where: { id, workspace_id: workspaceId } });
    if (!entry) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Không tìm thấy vault entry' };
    const credential = decryptCredential(entry);
    await prisma.workspaceAuditEvent.create({
      data: {
        owner_id: auth.workspace.owner_id,
        workspace_id: workspaceId,
        actor_id: auth.actor.sub,
        actor_type: auth.actor.type,
        actor_name: auth.actor.name || '',
        user_role: auth.role,
        policy_mode: 'vault-resolve',
        tool_name: 'vault.resolve',
        capability: 'proxies.use',
        action_class: 'sensitive',
        target_id: entry.id,
        status: 'resolved'
      }
    });
    return {
      username: credential.username,
      password: credential.password,
      kind: entry.kind,
      host: entry.host,
      port: entry.port
    };
  }
}

module.exports = new VaultService();