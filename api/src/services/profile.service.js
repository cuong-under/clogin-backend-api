const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class ProfileService {
  async syncCloudProfile(ownerId, { profile_id, name, folder = '', config = {}, assigned_worker_ids = [] }) {
    if (!profile_id || !name) {
      throw { statusCode: 400, code: 'VALIDATION_ERROR', message: 'Thiếu profile_id hoặc name' };
    }

    const existing = await prisma.cloudProfile.findUnique({
      where: { id: profile_id }
    });

    if (existing) {
      if (existing.owner_id !== ownerId) {
        throw { statusCode: 403, code: 'FORBIDDEN', message: 'Profile không thuộc sở hữu của bạn' };
      }
      await prisma.cloudProfile.update({
        where: { id: profile_id },
        data: {
          name,
          folder: folder || existing.folder,
          config: config || existing.config,
          assigned_worker_ids: assigned_worker_ids || existing.assigned_worker_ids,
          updated_at: new Date()
        }
      });
    } else {
      await prisma.cloudProfile.create({
        data: {
          id: profile_id,
          owner_id: ownerId,
          name,
          folder: folder || '',
          config: config || {},
          assigned_worker_ids: assigned_worker_ids || [],
          cookies: null
        }
      });
    }

    return { success: true };
  }

  async getCloudProfiles(payload) {
    let profiles;
    if (payload.type === 'owner') {
      profiles = await prisma.cloudProfile.findMany({
        where: { owner_id: payload.sub },
        orderBy: { updated_at: 'desc' }
      });
    } else {
      profiles = await prisma.cloudProfile.findMany({
        where: {
          assigned_worker_ids: { has: payload.sub }
        },
        orderBy: { updated_at: 'desc' }
      });
    }

    const formatted = profiles.map(p => ({
      id: p.id,
      name: p.name,
      folder: p.folder,
      assigned_worker_ids: p.assigned_worker_ids,
      has_cookies: p.cookies !== null && Array.isArray(p.cookies) ? p.cookies.length > 0 : !!p.cookies,
      created_at: p.created_at.toISOString(),
      updated_at: p.updated_at.toISOString()
    }));

    return { profiles: formatted };
  }

  async getCloudProfileConfig(payload, profileId) {
    const profile = await prisma.cloudProfile.findUnique({
      where: { id: profileId }
    });

    if (!profile) {
      throw { statusCode: 404, code: 'NOT_FOUND', message: 'Không tìm thấy profile' };
    }

    if (payload.type === 'owner' && profile.owner_id !== payload.sub) {
      throw { statusCode: 403, code: 'FORBIDDEN', message: 'Không phải profile thuộc quyền sở hữu của bạn' };
    }

    if (payload.type === 'worker' && (!profile.assigned_worker_ids || !profile.assigned_worker_ids.includes(payload.sub))) {
      throw { statusCode: 403, code: 'FORBIDDEN', message: 'Bạn chưa được gán quyền truy cập profile này' };
    }

    return {
      id: profile.id,
      name: profile.name,
      folder: profile.folder,
      config: profile.config,
      assigned_worker_ids: profile.assigned_worker_ids
    };
  }

  async deleteCloudProfile(ownerId, profileId) {
    const profile = await prisma.cloudProfile.findUnique({
      where: { id: profileId }
    });

    if (!profile || profile.owner_id !== ownerId) {
      throw { statusCode: 404, code: 'NOT_FOUND', message: 'Không tìm thấy profile' };
    }

    await prisma.cloudProfile.delete({ where: { id: profileId } });
    return { success: true };
  }

  async assignCloudProfile(ownerId, profileId, workerIds = []) {
    const profile = await prisma.cloudProfile.findUnique({
      where: { id: profileId }
    });

    if (!profile || profile.owner_id !== ownerId) {
      throw { statusCode: 404, code: 'NOT_FOUND', message: 'Không tìm thấy profile' };
    }

    await prisma.cloudProfile.update({
      where: { id: profileId },
      data: {
        assigned_worker_ids: workerIds,
        updated_at: new Date()
      }
    });

    return { success: true };
  }

  async saveProfileCookies(payload, profileId, cookies = []) {
    const profile = await prisma.cloudProfile.findUnique({
      where: { id: profileId }
    });

    if (!profile) {
      throw { statusCode: 404, code: 'NOT_FOUND', message: 'Không tìm thấy profile' };
    }

    if (payload.type === 'owner' && profile.owner_id !== payload.sub) {
      throw { statusCode: 403, code: 'FORBIDDEN', message: 'Không phải profile của bạn' };
    }

    if (payload.type === 'worker' && (!profile.assigned_worker_ids || !profile.assigned_worker_ids.includes(payload.sub))) {
      throw { statusCode: 403, code: 'FORBIDDEN', message: 'Bạn chưa được gán profile này' };
    }

    await prisma.cloudProfile.update({
      where: { id: profileId },
      data: {
        cookies: cookies || [],
        updated_at: new Date()
      }
    });

    return { success: true, count: (cookies || []).length };
  }

  async getProfileCookies(payload, profileId) {
    const profile = await prisma.cloudProfile.findUnique({
      where: { id: profileId }
    });

    if (!profile) {
      throw { statusCode: 404, code: 'NOT_FOUND', message: 'Không tìm thấy profile' };
    }

    if (payload.type === 'owner' && profile.owner_id !== payload.sub) {
      throw { statusCode: 403, code: 'FORBIDDEN', message: 'Không phải profile của bạn' };
    }

    if (payload.type === 'worker' && (!profile.assigned_worker_ids || !profile.assigned_worker_ids.includes(payload.sub))) {
      throw { statusCode: 403, code: 'FORBIDDEN', message: 'Bạn chưa được gán profile này' };
    }

    return { cookies: profile.cookies || [] };
  }

  async deleteProfileCookies(ownerId, profileId) {
    const profile = await prisma.cloudProfile.findUnique({
      where: { id: profileId }
    });

    if (!profile || profile.owner_id !== ownerId) {
      throw { statusCode: 404, code: 'NOT_FOUND', message: 'Không tìm thấy profile' };
    }

    await prisma.cloudProfile.update({
      where: { id: profileId },
      data: {
        cookies: null,
        updated_at: new Date()
      }
    });

    return { success: true };
  }

  // --- Admin Profile Methods ---

  async listProfilesAdmin({ search, owner_id, page = 1, perPage = 20 }) {
    const skip = (page - 1) * perPage;
    const where = {};

    if (owner_id) where.owner_id = owner_id;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { folder: { contains: search, mode: 'insensitive' } },
        { id: { contains: search, mode: 'insensitive' } }
      ];
    }

    const [profiles, total] = await Promise.all([
      prisma.cloudProfile.findMany({
        where,
        include: { owner: { select: { id: true, email: true, name: true } } },
        orderBy: { updated_at: 'desc' },
        skip,
        take: perPage
      }),
      prisma.cloudProfile.count({ where })
    ]);

    const formatted = profiles.map(p => ({
      id: p.id,
      owner_id: p.owner_id,
      owner_email: p.owner ? p.owner.email : null,
      name: p.name,
      folder: p.folder,
      has_cookies: p.cookies !== null && Array.isArray(p.cookies) ? p.cookies.length > 0 : !!p.cookies,
      assigned_count: (p.assigned_worker_ids || []).length,
      assigned_worker_ids: p.assigned_worker_ids,
      created_at: p.created_at.toISOString(),
      updated_at: p.updated_at.toISOString()
    }));

    return { profiles: formatted, total, page, per_page: perPage, total_pages: Math.ceil(total / perPage) };
  }

  async getProfileByIdAdmin(id) {
    const profile = await prisma.cloudProfile.findUnique({
      where: { id },
      include: { owner: true }
    });
    if (!profile) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Profile không tồn tại' };
    return profile;
  }

  async deleteProfileAdmin(id) {
    await prisma.cloudProfile.delete({ where: { id } });
    return { success: true };
  }

  async transferProfile(id, newOwnerId) {
    const targetOwner = await prisma.owner.findUnique({ where: { id: newOwnerId } });
    if (!targetOwner) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Owner đích không tồn tại' };

    await prisma.cloudProfile.update({
      where: { id },
      data: {
        owner_id: newOwnerId,
        assigned_worker_ids: [],
        updated_at: new Date()
      }
    });

    return { success: true, message: 'Đã chuyển quyền sở hữu profile sang Owner mới' };
  }
}

module.exports = new ProfileService();
