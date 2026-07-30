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
└── README.md
```

## Features

- **Desktop App API**: Fully backward compatible endpoints for authentication, licensing, team management, cloud profile sync, and app updates.
- **Admin Portal API**: Comprehensive management suite for licenses, plans, coupons, users, profiles, audit logs, releases, announcements, system config, feature flags, and admin users.
- **Prisma & PostgreSQL**: Robust database schema supporting relationships, security audit logs, login history, and IP blocking.
- **RBAC**: Admin role-based access control (`super_admin`, `support`, `viewer`).

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
