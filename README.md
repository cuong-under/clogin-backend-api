# Clogin Backend API & Admin Portal

Backend API service built with Express.js, Prisma ORM, and PostgreSQL for Clogin Studio desktop application and Admin Portal management.

## Project Structure

```
clogin-backend-api/
├── api/
│   ├── src/
│   │   ├── index.js          # Entry point
│   │   ├── middleware/       # Auth, Admin RBAC, Rate-limit, Error handling
│   │   ├── routes/           # Express Routers (auth, license, team, profiles, app, admin)
│   │   ├── services/         # Business logic & Prisma DB operations
│   │   ├── utils/            # JWT, Crypto Hash, Validators
│   │   └── migrate.js        # JSON file migration & seed script
│   ├── prisma/
│   │   └── schema.prisma     # Database schema & models
│   ├── package.json
│   ├── Dockerfile
│   └── .env.example
├── admin/                    # Next.js Admin Portal
└── README.md
```

## Features

- **Desktop App API**: Fully backward compatible endpoints for authentication, licensing, team management, cloud profile sync, and app updates.
- **Admin Portal API**: Comprehensive management suite for licenses, plans, coupons, users, profiles, audit logs, releases, announcements, system config, feature flags, and admin users.
- **Prisma & PostgreSQL**: Robust database schema supporting relationships, security audit logs, login history, and IP blocking.
- **RBAC**: Admin role-based access control (`super_admin`, `support`, `viewer`).

## Phát Hành Desktop Thật

Admin Portal không tự biên dịch hay tạo file cài đặt. Nó quản lý metadata của artifact đã được GitHub Actions build và ký. Một release chỉ có thể trở thành **Current** khi có đủ artifact updater Windows và chữ ký Tauri tương ứng.

1. Tăng đồng bộ phiên bản trong `package.json`, `src-tauri/Cargo.toml`, và `src-tauri/tauri.conf.json` của `CloginStudio`.
2. Thiết lập GitHub Actions secrets `TAURI_SIGNING_PRIVATE_KEY` và, nếu khóa có mật khẩu, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` trong repo `cuong-under/CloginStudio`.
3. Push tag dạng `vX.Y.Z`. Workflow `Release` kiểm tra tag khớp ba file version, build artifact, ký updater, và publish GitHub Release.
4. Mở Admin Portal > **Releases** > **Nhập từ GitHub**, nhập `X.Y.Z`. API đọc artifact `.nsis.zip` và file `.nsis.zip.sig`, lưu URL trực tiếp và signature vào PostgreSQL.
5. Xác nhận trạng thái **Auto-update: Sẵn sàng**, sau đó bấm **Publish Current**.

Endpoint `GET /v1/app/update/manifest` chỉ trả JSON updater Tauri hợp lệ khi release Current có đủ URL HTTPS và signature. Nếu chưa có artifact thật, endpoint trả `204 No Content`, Desktop App sẽ không hiện bản update giả.

## Environment Variables

Copy `api/.env.example` to `api/.env` and update values:

```env
PORT=3000
DATABASE_URL=postgres://clogin:CloginDB2026%21SecurePass@oc5h6epf3f1pdronbhbt44sy:5432/clogin
JWT_SECRET=clogin-jwt-secret-2026
ADMIN_JWT_SECRET=clogin-admin-jwt-secret-2026
ADMIN_DEFAULT_EMAIL=admin@clogin.nghemmo.com
ADMIN_DEFAULT_PASSWORD=CloginAdmin2026!
```

## Running & Migration

1. Install dependencies:
   ```bash
   cd api
   npm install
   ```

2. Push database schema & generate Prisma Client:
   ```bash
   npx prisma db push
   npx prisma generate
   ```

3. Run data migration / seed:
   ```bash
   npm run migrate
   ```

4. Start API server:
   ```bash
   npm start
   ```
