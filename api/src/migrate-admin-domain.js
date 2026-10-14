/**
 * Một-lần migration: đổi email admin + set lại mật khẩu khi đổi domain.
 *
 * Chạy TẠM trong container API (qua scheduled task run_once của Coolify):
 *   node src/migrate-admin-domain.js
 *
 * Env (thông qua Coolify runtime env của app backend):
 *   ADMIN_MIGRATE_OLD_EMAIL  (mặc định admin@clogin.nghemmo.com)
 *   ADMIN_MIGRATE_NEW_EMAIL  (mặc định admin@clogin.cuong.tech)
 *   ADMIN_MIGRATE_PASSWORD   (BẮT BUỘC — mật khẩu mới, không hardcode trong code)
 *
 * Idempotent: chạy lại nhiều lần chỉ cập nhật password (cùng giá trị),
 * không tạo user thứ hai, không phá dữ liệu.
 */
const path = require('path');
require('dotenv').config(); // trong image không có .env — env thật đến từ container
const { PrismaClient } = require('@prisma/client');
const { hashPw } = require(path.join(__dirname, 'utils/hash'));

const prisma = new PrismaClient();

const OLD_EMAIL = process.env.ADMIN_MIGRATE_OLD_EMAIL || 'admin@clogin.nghemmo.com';
const NEW_EMAIL = process.env.ADMIN_MIGRATE_NEW_EMAIL || 'admin@clogin.cuong.tech';
const PASSWORD = process.env.ADMIN_MIGRATE_PASSWORD;

async function run() {
  if (!PASSWORD) {
    throw new Error('Thiếu ADMIN_MIGRATE_PASSWORD (không hardcode mật khẩu vào source)');
  }
  const pwHash = hashPw(PASSWORD);

  // 1) Email mới đã tồn tại (chạy lần 2+) → chỉ giữ password cập nhật. Idempotent.
  const existsNew = await prisma.adminUser.findUnique({ where: { email: NEW_EMAIL } });
  if (existsNew) {
    await prisma.adminUser.update({ where: { id: existsNew.id }, data: { password_hash: pwHash } });
    console.log(`[admin-migrate] ${NEW_EMAIL} đã tồn tại → cập nhật password (idempotent)`);
    return;
  }

  // 2) Email cũ tồn tại → cập nhật in-place thành email mới + password mới.
  const old = await prisma.adminUser.findUnique({ where: { email: OLD_EMAIL } });
  if (old) {
    await prisma.adminUser.update({
      where: { id: old.id },
      data: { email: NEW_EMAIL, password_hash: pwHash, role: 'super_admin', active: true }
    });
    console.log(`[admin-migrate] ${OLD_EMAIL} → ${NEW_EMAIL} (cập nhật email + password)`);
    return;
  }

  // 3) Chưa có user nào (DB trống) → tạo mới.
  await prisma.adminUser.create({
    data: { email: NEW_EMAIL, password_hash: pwHash, name: 'Super Admin', role: 'super_admin', active: true }
  });
  console.log(`[admin-migrate] tạo mới ${NEW_EMAIL}`);
}

run()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error('[admin-migrate] LỖI:', e.message || e);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
