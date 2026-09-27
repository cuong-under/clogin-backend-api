// Thực thi danh sách IP bị chặn (bảng ip_blocks do admin quản lý).
//
// Trước đây admin "khóa IP" chỉ ghi DB — chẳng có request nào bị từ chối.
// Guard này kiểm tra ip_blocks còn hiệu lực (expires_at null hoặc > now),
// cache 30s để không query mỗi request.
//
// Fail-open theo thiết kế: nếu DB lỗi, request đi tiếp (API không sập vì
// guard) và log cảnh báo.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { sendError } = require('./error');
const { getClientIp } = require('../utils/validators');

const CACHE_TTL_MS = Number(process.env.IP_BLOCK_CACHE_MS) || 30000;
let cache = { at: 0, blocks: new Map() }; // ip -> reason

async function loadBlocks() {
  const now = Date.now();
  if (now - cache.at < CACHE_TTL_MS) return cache.blocks;
  try {
    const rows = await prisma.ipBlock.findMany();
    const next = new Map();
    for (const row of rows) {
      // Bỏ qua block đã hết hạn.
      if (row.expires_at && new Date(row.expires_at).getTime() < now) continue;
      next.set(row.ip, row.reason || 'Bị chặn bởi quản trị viên');
    }
    cache = { at: now, blocks: next };
  } catch (err) {
    // Prisma error object dài; chỉ log 1 dòng đầu cho gọn.
    console.error('[blockedIpGuard] Không đọc được ip_blocks:', String(err?.message || err).split('\n')[0]);
  }
  return cache.blocks;
}

async function blockedIpGuard(req, res, next) {
  const ip = getClientIp(req);
  if (!ip) return next();
  const blocks = await loadBlocks();
  if (blocks.has(ip)) {
    return sendError(res, 403, 'IP_BLOCKED', `IP của bạn đã bị chặn: ${blocks.get(ip)}`);
  }
  next();
}

module.exports = { blockedIpGuard };
