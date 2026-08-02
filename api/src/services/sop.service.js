const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class SopService {
  async listSops(workspaceId, { name, page = 1, per_page = 20 } = {}) {
    const where = {};
    if (workspaceId) where.workspace_id = workspaceId;
    if (name) {
      const active = await prisma.sopTemplate.findFirst({
        where: { workspace_id: workspaceId, name, is_active: true }
      });
      return { name, versions: active ? [this.format(active)] : [], active_version: active ? active.version : null };
    }
    const skip = (page - 1) * per_page;
    const [rows, total] = await Promise.all([
      prisma.sopTemplate.findMany({ where, orderBy: [{ name: 'asc' }, { created_at: 'desc' }], skip, take: per_page }),
      prisma.sopTemplate.count({ where })
    ]);

    // Collapse into name -> versions list
    const byName = {};
    for (const r of rows) {
      if (!byName[r.name]) byName[r.name] = { name: r.name, versions: [], active_version: null };
      byName[r.name].versions.push(this.format(r));
      if (r.is_active) byName[r.name].active_version = r.version;
    }
    return { sops: Object.values(byName), total, page, per_page };
  }

  format(r) {
    return {
      id: r.id,
      workspace_id: r.workspace_id,
      name: r.name,
      version: r.version,
      content_markdown: r.content_markdown,
      checklist: r.checklist,
      is_active: r.is_active,
      created_by: r.created_by,
      created_at: r.created_at.toISOString(),
      updated_at: r.updated_at.toISOString()
    };
  }

  listVersions(workspaceId, name) {
    return prisma.sopTemplate.findMany({
      where: { workspace_id: workspaceId, name },
      orderBy: { version: 'desc' }
    });
  }

  async createVersion(workspaceId, { name, version, content_markdown = '', checklist = [] }) {
    if (!name || !String(name).trim()) {
      throw { statusCode: 400, code: 'VALIDATION_ERROR', message: 'Thiếu tên SOP' };
    }
    if (!version || !String(version).trim()) {
      throw { statusCode: 400, code: 'VALIDATION_ERROR', message: 'Thiếu version' };
    }
    const existing = await prisma.sopTemplate.findUnique({
      where: { workspace_id_name_version: { workspace_id: workspaceId, name: String(name), version: String(version) } }
    });
    if (existing) {
      throw { statusCode: 409, code: 'DUPLICATE', message: 'Version đã tồn tại' };
    }
    const first = await prisma.sopTemplate.findFirst({
      where: { workspace_id: workspaceId, name: String(name) }
    });
    const sop = await prisma.sopTemplate.create({
      data: {
        workspace_id: workspaceId,
        name: String(name).trim(),
        version: String(version).trim(),
        content_markdown,
        checklist: Array.isArray(checklist) ? checklist : [],
        is_active: !first
      }
    });
    return this.format(sop);
  }

  async activateVersion(workspaceId, name, version) {
    const target = await prisma.sopTemplate.findUnique({
      where: { workspace_id_name_version: { workspace_id: workspaceId, name, version } }
    });
    if (!target) {
      throw { statusCode: 404, code: 'NOT_FOUND', message: 'Không tìm thấy version SOP' };
    }
    await prisma.$transaction([
      prisma.sopTemplate.updateMany({
        where: { workspace_id: workspaceId, name },
        data: { is_active: false }
      }),
      prisma.sopTemplate.update({
        where: { id: target.id },
        data: { is_active: true }
      })
    ]);
    return { success: true, name, active_version: version };
  }

  async getWithSnapshot(workspaceId, sopId) {
    return prisma.sopTemplate.findFirst({ where: { id: sopId, workspace_id: workspaceId } });
  }
}

module.exports = new SopService();