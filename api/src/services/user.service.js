const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { hashPw, verifyPw } = require('../utils/hash');
const { signUserJwt } = require('../utils/jwt');

class UserService {
  async registerOwner({ email, password, license_key }) {
    if (!email || !password || !license_key) {
      throw { statusCode: 400, code: 'VALIDATION_ERROR', message: 'Thiếu email, password hoặc license_key' };
    }

    const lic = await prisma.license.findUnique({
      where: { key: license_key },
      include: { owner: true }
    });

    if (!lic) {
      throw { statusCode: 404, code: 'LICENSE_INVALID', message: 'License Key không hợp lệ' };
    }

    if (lic.expires_at && new Date(lic.expires_at) < new Date()) {
      throw { statusCode: 400, code: 'LICENSE_EXPIRED', message: 'License Key đã hết hạn' };
    }

    if (lic.owner) {
      throw { statusCode: 409, code: 'LICENSE_ALREADY_USED', message: 'License Key đã được liên kết với một tài khoản Owner khác' };
    }

    const existingOwner = await prisma.owner.findUnique({ where: { email } });
    if (existingOwner) {
      throw { statusCode: 409, code: 'DUPLICATE_EMAIL', message: 'Email đã được đăng ký' };
    }

    const owner = await prisma.owner.create({
      data: {
        email,
        password_hash: hashPw(password),
        license_id: lic.id,
        max_worker_slots: lic.max_workers || 3
      }
    });

    const token = signUserJwt({ sub: owner.id, type: 'owner', owner_id: owner.id });

    return {
      owner_id: owner.id,
      token
    };
  }

  async loginUser({ email, password, ip = '127.0.0.1', userAgent = '' }) {
    if (!email || !password) {
      throw { statusCode: 400, code: 'VALIDATION_ERROR', message: 'Thiếu email hoặc password' };
    }

    let user = await prisma.owner.findUnique({ where: { email } });
    let userType = 'owner';

    if (!user) {
      user = await prisma.worker.findFirst({ where: { email } });
      userType = 'worker';
    }

    if (!user || !verifyPw(password, user.password_hash)) {
      // Record failed attempt
      prisma.loginHistory.create({
        data: {
          user_id: user ? user.id : 'unknown',
          user_type: user ? userType : 'unknown',
          email,
          ip_address: ip,
          user_agent: userAgent,
          success: false,
          fail_reason: 'INVALID_CREDENTIALS'
        }
      }).catch(() => {});

      throw { statusCode: 401, code: 'INVALID_CREDENTIALS', message: 'Email hoặc mật khẩu không đúng' };
    }

    if (userType === 'worker' && !user.active) {
      prisma.loginHistory.create({
        data: {
          user_id: user.id,
          user_type: 'worker',
          email,
          ip_address: ip,
          user_agent: userAgent,
          success: false,
          fail_reason: 'WORKER_DISABLED'
        }
      }).catch(() => {});

      throw { statusCode: 403, code: 'FORBIDDEN', message: 'Tài khoản worker đã bị vô hiệu hóa' };
    }

    const ownerId = userType === 'owner' ? user.id : user.owner_id;

    // Record success login
    prisma.loginHistory.create({
      data: {
        user_id: user.id,
        user_type: userType,
        email,
        ip_address: ip,
        user_agent: userAgent,
        success: true
      }
    }).catch(() => {});

    // Update last login
    if (userType === 'owner') {
      prisma.owner.update({
        where: { id: user.id },
        data: { last_login_at: new Date(), last_login_ip: ip }
      }).catch(() => {});
    } else {
      prisma.worker.update({
        where: { id: user.id },
        data: { last_login_at: new Date(), last_login_ip: ip }
      }).catch(() => {});
    }

    const token = signUserJwt({ sub: user.id, type: userType, owner_id: ownerId });

    return {
      token,
      user_type: userType,
      user_id: user.id,
      owner_id: ownerId,
      email: user.email,
      name: user.name || ''
    };
  }

  async getUserMe(payload) {
    if (payload.type === 'owner') {
      const owner = await prisma.owner.findUnique({ where: { id: payload.sub } });
      if (!owner) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Không tìm thấy tài khoản' };
      return {
        user_id: owner.id,
        user_type: 'owner',
        email: owner.email,
        name: owner.name || '',
        owner_id: owner.id
      };
    }

    const worker = await prisma.worker.findUnique({ where: { id: payload.sub } });
    if (!worker) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Không tìm thấy tài khoản' };
    return {
      user_id: worker.id,
      user_type: 'worker',
      email: worker.email,
      name: worker.name || '',
      owner_id: worker.owner_id
    };
  }

  // --- Worker Operations for Owner ---

  async getWorkers(ownerId) {
    const workers = await prisma.worker.findMany({
      where: { owner_id: ownerId },
      select: {
        id: true,
        email: true,
        name: true,
        active: true,
        created_at: true
      },
      orderBy: { created_at: 'desc' }
    });

    return {
      workers: workers.map(w => ({
        id: w.id,
        email: w.email,
        name: w.name,
        active: w.active,
        created_at: w.created_at.toISOString()
      }))
    };
  }

  async createWorker(ownerId, { email, password, name }) {
    if (!email || !password) {
      throw { statusCode: 400, code: 'VALIDATION_ERROR', message: 'Thiếu email hoặc password' };
    }

    const owner = await prisma.owner.findUnique({ where: { id: ownerId } });
    if (!owner) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Owner không tồn tại' };

    const existingWorker = await prisma.worker.findFirst({
      where: { owner_id: ownerId, email }
    });
    if (existingWorker) {
      throw { statusCode: 409, code: 'DUPLICATE_EMAIL', message: 'Email worker đã tồn tại' };
    }

    const activeCount = await prisma.worker.count({
      where: { owner_id: ownerId, active: true }
    });

    if (activeCount >= owner.max_worker_slots) {
      throw { statusCode: 400, code: 'WORKER_LIMIT', message: `Đã đạt giới hạn ${owner.max_worker_slots} worker slots` };
    }

    const worker = await prisma.worker.create({
      data: {
        owner_id: ownerId,
        email,
        password_hash: hashPw(password),
        name: name || '',
        active: true
      }
    });

    return {
      worker_id: worker.id,
      email: worker.email,
      name: worker.name
    };
  }

  async updateWorker(ownerId, workerId, { name, password, active }) {
    const worker = await prisma.worker.findFirst({
      where: { id: workerId, owner_id: ownerId }
    });
    if (!worker) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Không tìm thấy worker' };

    const data = {};
    if (name !== undefined) data.name = name;
    if (password) data.password_hash = hashPw(password);
    if (active !== undefined) data.active = active;

    await prisma.worker.update({
      where: { id: workerId },
      data
    });

    return { success: true };
  }

  async deleteWorker(ownerId, workerId) {
    const worker = await prisma.worker.findFirst({
      where: { id: workerId, owner_id: ownerId }
    });
    if (!worker) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Không tìm thấy worker' };

    await prisma.worker.delete({ where: { id: workerId } });
    return { success: true };
  }

  // --- Admin User Methods ---

  async listOwners({ search, page = 1, perPage = 20 }) {
    const skip = (page - 1) * perPage;
    const where = {};

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } }
      ];
    }

    const [owners, total] = await Promise.all([
      prisma.owner.findMany({
        where,
        include: {
          license: true,
          workers: { select: { id: true, email: true, name: true, active: true } },
          _count: { select: { workers: true, profiles: true } }
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: perPage
      }),
      prisma.owner.count({ where })
    ]);

    const formatted = owners.map(o => ({
      id: o.id,
      email: o.email,
      name: o.name,
      license_key: o.license ? o.license.key : null,
      license_id: o.license_id,
      max_worker_slots: o.max_worker_slots,
      worker_count: o._count.workers,
      profile_count: o._count.profiles,
      active: o.active,
      last_login_at: o.last_login_at ? o.last_login_at.toISOString() : null,
      created_at: o.created_at ? o.created_at.toISOString() : null,
      workers: o.workers
    }));

    return { owners: formatted, total, page, per_page: perPage, total_pages: Math.ceil(total / perPage) };
  }

  async getOwnerById(id) {
    const owner = await prisma.owner.findUnique({
      where: { id },
      include: {
        license: { include: { devices: true } },
        workers: true,
        profiles: true
      }
    });
    if (!owner) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Owner không tồn tại' };
    return owner;
  }

  async updateOwner(id, data) {
    const updateData = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.max_worker_slots !== undefined) updateData.max_worker_slots = data.max_worker_slots;
    if (data.active !== undefined) updateData.active = data.active;
    if (data.password) updateData.password_hash = hashPw(data.password);

    return prisma.owner.update({
      where: { id },
      data: updateData
    });
  }

  async deleteOwner(id) {
    await prisma.owner.delete({ where: { id } });
    return { success: true };
  }

  async resetOwnerPassword(id, newPassword) {
    if (!newPassword) throw { statusCode: 400, code: 'VALIDATION_ERROR', message: 'Thiếu mật khẩu mới' };
    await prisma.owner.update({
      where: { id },
      data: { password_hash: hashPw(newPassword) }
    });
    return { success: true, message: 'Đã đặt lại mật khẩu cho Owner' };
  }

  async listWorkersAdmin({ search, owner_id, page = 1, perPage = 20 }) {
    const skip = (page - 1) * perPage;
    const where = {};

    if (owner_id) where.owner_id = owner_id;
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } }
      ];
    }

    const [workers, total] = await Promise.all([
      prisma.worker.findMany({
        where,
        include: { owner: { select: { id: true, email: true } } },
        orderBy: { created_at: 'desc' },
        skip,
        take: perPage
      }),
      prisma.worker.count({ where })
    ]);

    return { workers, total, page, per_page: perPage, total_pages: Math.ceil(total / perPage) };
  }

  async getWorkerById(id) {
    const worker = await prisma.worker.findUnique({
      where: { id },
      include: { owner: true }
    });
    if (!worker) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Worker không tồn tại' };
    return worker;
  }

  async updateWorkerAdmin(id, data) {
    const updateData = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.active !== undefined) updateData.active = data.active;
    if (data.password) updateData.password_hash = hashPw(data.password);

    return prisma.worker.update({
      where: { id },
      data: updateData
    });
  }

  async deleteWorkerAdmin(id) {
    await prisma.worker.delete({ where: { id } });
    return { success: true };
  }
}

module.exports = new UserService();
