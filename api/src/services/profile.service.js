const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { encryptCredential, decryptCredential } = require('../utils/vault-crypto');

const MAX_COOKIES = 5000;

class ProfileService {
  async syncCloudProfile(ownerId, { profile_id, name, folder = '', config = {}, assigned_worker_ids = [], revision: expectedRevision, idempotency_key }) {
    if (!profile_id || !name) {
      throw { statusCode: 400, code: 'VALIDATION_ERROR', message: 'Thiếu profile_id hoặc name' };
    }

    const existing = await prisma.cloudProfile.findUnique({
      where: { id: profile_id }
    });

    if (existing && existing.owner_id !== ownerId) {
      throw { statusCode: 403, code: 'FORBIDDEN', message: 'Profile không thuộc sở hữu của bạn' };
    }

    if (existing) {
      // Bắt buộc client gửi revision đúng bằng bản trên cloud. Trước đây
      // thiếu revision thì bỏ qua toàn bộ kiểm tra conflict → ghi đè im
      // lặng bản mới hơn (mất dữ liệu worker/owner).
      if (expectedRevision === undefined || expectedRevision === null) {
        throw {
          statusCode: 409,
          code: 'REVISION_REQUIRED',
          message: 'Client cần gửi revision hiện tại (sync_revision) để tránh ghi đè.',
          canonical_revision: existing.sync_revision
        };
      }
      if (expectedRevision !== existing.sync_revision) {
        throw {
          statusCode: 409,
          code: 'SYNC_CONFLICT',
          message: 'Cloud đã có revision mới hơn. Cần refresh trước khi sync.',
          canonical_revision: existing.sync_revision
        };
      }
    }

    // Revision do SERVER quản lý (monotonic). Trước đây dùng client gửi lên
    // → client gửi 999999 làm mọi client khác bị 409 vĩnh viễn.
    const newRevision = existing ? existing.sync_revision + 1 : 1;

    // Gán worker chỉ hợp lệ nếu worker thuộc chính owner này.
    let nextWorkers = assigned_worker_ids;
    if (nextWorkers !== undefined && nextWorkers.length > 0) {
      await this._assertWorkersOwned(ownerId, nextWorkers);
    }

    if (existing) {
      await prisma.cloudProfile.update({
        where: { id: profile_id },
        data: {
          name,
          folder: folder || existing.folder,
          config: config || existing.config,
          assigned_worker_ids: nextWorkers !== undefined ? nextWorkers : existing.assigned_worker_ids,
          sync_revision: newRevision,
          sync_state: 'synced',
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
          assigned_worker_ids: nextWorkers || [],
          cookies: null,
          sync_revision: newRevision,
          sync_state: 'synced'
        }
      });
    }

    return { success: true, sync_revision: newRevision };
  }

  /// Worker ids phải thuộc owner — chặn gán chéo tenant (IDOR).
  async _assertWorkersOwned(ownerId, workerIds) {
    if (!Array.isArray(workerIds) || workerIds.length === 0) return;
    const owned = await prisma.worker.count({
      where: { id: { in: workerIds }, owner_id: ownerId }
    });
    if (owned !== workerIds.length) {
      throw {
        statusCode: 400,
        code: 'WORKER_NOT_OWNED',
        message: 'Một hoặc nhiều worker không thuộc tài khoản của bạn'
      };
    }
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
      has_cookies: p.cookies !== null && p.cookies !== undefined && (Array.isArray(p.cookies) ? p.cookies.length > 0 : true),
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

    if (profile.sync_state === 'deleted') {
      throw { statusCode: 410, code: 'PROFILE_DELETED', message: 'Profile đã bị xoá trên cloud' };
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

    // Tombstone: giữ row ở trạng thái 'deleted' (worker chưa kịp pull sẽ
    // nhận 410 Gone thay vì 404 mơ hồ). Hard delete qua job dọn dẹp sau
    // grace period — trước đây xoá cứng ngay làm worker xoá nhầm data local.
    await prisma.cloudProfile.update({
      where: { id: profileId },
      data: { sync_state: 'deleted', assigned_worker_ids: [], updated_at: new Date() }
    });
    return { success: true };
  }

  async getCloudProfileSyncStatus(payload, profileId) {
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
    return {
      profile_id: profile.id,
      sync_revision: profile.sync_revision,
      sync_state: profile.sync_state,
      updated_at: profile.updated_at.toISOString()
    };
  }

  async assignCloudProfile(ownerId, profileId, workerIds = []) {
    const profile = await prisma.cloudProfile.findUnique({
      where: { id: profileId }
    });

    if (!profile || profile.owner_id !== ownerId) {
      throw { statusCode: 404, code: 'NOT_FOUND', message: 'Không tìm thấy profile' };
    }

    const nextWorkers = Array.isArray(workerIds) ? workerIds : [];
    // FIX CRITICAL: trước đây không kiểm tra worker thuộc owner → owner A
    // gán worker của owner B, worker B đọc được config (proxy/cookie) của A.
    await this._assertWorkersOwned(ownerId, nextWorkers);

    await prisma.cloudProfile.update({
      where: { id: profileId },
      data: {
        assigned_worker_ids: nextWorkers,
        // Bump revision để worker đang online biết mình vừa được gán/thu hồi
        // (trước đây không bump → worker không thấy profile mới tới sync sau).
        sync_revision: profile.sync_revision + 1,
        updated_at: new Date()
      }
    });

    return { success: true, sync_revision: profile.sync_revision + 1 };
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

    if (cookies && (!Array.isArray(cookies) || cookies.length > MAX_COOKIES)) {
      throw { statusCode: 400, code: 'VALIDATION_ERROR', message: `Cookie không hợp lệ (tối đa ${MAX_COOKIES} bản ghi)` };
    }

    // Cookie = credential đăng nhập site mục tiêu → mã hoá envelope trước
    // khi lưu DB (trước đây lưu plaintext).
    const cookiesToStore = cookies && cookies.length > 0 ? encryptCredential(cookies) : null;

    await prisma.cloudProfile.update({
      where: { id: profileId },
      data: {
        cookies: cookiesToStore,
        updated_at: new Date()
      }
    });

    return { success: true, count: (cookies || []).length };
  }

  /// Cookie có thể đang ở dạng envelope mã hoá (mới) hoặc mảng plaintext
  /// (bản ghi cũ trước khi vá) — giải mã tương thích ngược.
  _decodeCookies(stored) {
    if (stored === null || stored === undefined) return [];
    if (Array.isArray(stored)) return stored; // legacy plaintext
    if (stored && typeof stored === 'object' && stored.ciphertext) {
      return decryptCredential(stored);
    }
    return [];
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

    return { cookies: this._decodeCookies(profile.cookies) };
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
      assigned_workers_count: (p.assigned_worker_ids || []).length,
      assigned_worker_ids: p.assigned_worker_ids,
      created_at: p.created_at.toISOString(),
      updated_at: p.updated_at.toISOString()
    }));

    return { data: formatted, profiles: formatted, total, page, per_page: perPage, limit: perPage, total_pages: Math.ceil(total / perPage) };
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
