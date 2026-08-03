require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { hashPw } = require('./utils/hash');

const ADMIN_DEFAULT_EMAIL = process.env.ADMIN_DEFAULT_EMAIL || 'admin@clogin.nghemmo.com';
const ADMIN_DEFAULT_PASSWORD = process.env.ADMIN_DEFAULT_PASSWORD || process.env.ADMIN_PASSWORD || 'CloginAdmin2026!';

function loadJsonFile(fp) {
  try {
    if (fs.existsSync(fp)) {
      return JSON.parse(fs.readFileSync(fp, 'utf8'));
    }
  } catch (e) {
    console.error(`Failed to read JSON file at ${fp}:`, e.message);
  }
  return null;
}

async function runMigration() {
  console.log('--- Starting Clogin Backend DB Migration & Seed ---');

  // 1. Seed Default Super Admin User
  const existingAdmin = await prisma.adminUser.findUnique({ where: { email: ADMIN_DEFAULT_EMAIL } });
  if (!existingAdmin) {
    await prisma.adminUser.create({
      data: {
        email: ADMIN_DEFAULT_EMAIL,
        password_hash: hashPw(ADMIN_DEFAULT_PASSWORD),
        name: 'Super Admin',
        role: 'super_admin',
        active: true
      }
    });
    console.log(`[Seed] Created super_admin user: ${ADMIN_DEFAULT_EMAIL}`);
  } else {
    console.log(`[Seed] Super admin user already exists: ${ADMIN_DEFAULT_EMAIL}`);
  }

  // 2. Seed Default License Plans
  const defaultPlans = [
    {
      name: 'Standard Monthly',
      slug: 'standard-monthly',
      max_devices: 1,
      max_workers: 3,
      max_profiles: 100,
      price_vnd: 200000,
      duration_days: 30,
      sort_order: 1
    },
    {
      name: 'Trial 30 Days',
      slug: 'trial-30-days',
      max_devices: 1,
      max_workers: 1,
      max_profiles: 20,
      price_vnd: 0,
      duration_days: 30,
      sort_order: 2
    },
    {
      name: 'Pro Lifetime',
      slug: 'pro-lifetime',
      max_devices: 5,
      max_workers: 10,
      max_profiles: 1000,
      price_vnd: 2500000,
      duration_days: null,
      sort_order: 3
    }
  ];

  for (const p of defaultPlans) {
    await prisma.licensePlan.upsert({
      where: { slug: p.slug },
      update: {},
      create: p
    });
  }
  console.log('[Seed] Default license plans verified/created.');

  // 3. Seed Default System Config
  const defaultConfigs = [
    { key: 'app_title', value: 'Clogin Studio' },
    { key: 'maintenance_mode', value: false },
    { key: 'support_telegram', value: 'https://t.me/clogin_support' }
  ];

  for (const c of defaultConfigs) {
    await prisma.systemConfig.upsert({
      where: { key: c.key },
      update: {},
      create: c
    });
  }
  console.log('[Seed] Default system configs verified/created.');

  // 4. Seed Default Feature Flags
  const defaultFlags = [
    { key: 'cloud_cookie_sync', name: 'Cloud Cookie Synchronization', description: 'Enable syncing browser cookies to cloud', enabled: true },
    { key: 'team_management', name: 'Team Worker Slots', description: 'Enable team member creation and assignment', enabled: true }
  ];

  for (const f of defaultFlags) {
    await prisma.featureFlag.upsert({
      where: { key: f.key },
      update: {},
      create: f
    });
  }
  console.log('[Seed] Default feature flags verified/created.');

  // 5. Seed Initial Release (v0.1.10)
  const existingRelease = await prisma.release.findUnique({ where: { version: '0.1.10' } });
  if (!existingRelease) {
    await prisma.release.create({
      data: {
        version: '0.1.10',
        channel: 'stable',
        changelog: 'Phiên bản phát hành Clogin Studio v0.1.10',
        download_url: 'https://github.com/cuong-under/CloginStudio/releases/tag/v0.1.10',
        is_current: true
      }
    });
    console.log('[Seed] Created initial release entry v0.1.10.');
  }

  // 6. Migrate legacy JSON DB files if present
  const baseDir = path.join(__dirname, '..');
  const dataDir = path.join(baseDir, 'data');

  const getPath = (fileName) => {
    if (fs.existsSync(path.join(dataDir, fileName))) return path.join(dataDir, fileName);
    if (fs.existsSync(path.join(baseDir, fileName))) return path.join(baseDir, fileName);
    return null;
  };

  // Migrate Licenses & Devices
  const licensesFile = getPath('licenses_db.json');
  if (licensesFile) {
    const licensesData = loadJsonFile(licensesFile) || [];
    console.log(`[Migration] Found ${licensesData.length} licenses in ${licensesFile}`);
    for (const lic of licensesData) {
      const dbLic = await prisma.license.upsert({
        where: { key: lic.key },
        update: {
          plan_name: lic.plan || 'Standard',
          max_devices: lic.max_devices || 1,
          expires_at: lic.expires_at ? new Date(lic.expires_at) : null
        },
        create: {
          key: lic.key,
          plan_name: lic.plan || 'Standard',
          max_devices: lic.max_devices || 1,
          expires_at: lic.expires_at ? new Date(lic.expires_at) : null
        }
      });

      // Migrate HWID Devices
      if (lic.active_hwids) {
        const hwidEntries = Object.entries(lic.active_hwids);
        for (const [hwid, devInfo] of hwidEntries) {
          await prisma.device.upsert({
            where: {
              license_id_hwid: {
                license_id: dbLic.id,
                hwid
              }
            },
            update: {
              device_name: devInfo.device_name || 'Desktop PC'
            },
            create: {
              license_id: dbLic.id,
              hwid,
              device_name: devInfo.device_name || 'Desktop PC',
              activated_at: devInfo.activated_at ? new Date(devInfo.activated_at) : new Date()
            }
          });
        }
      }
    }
    console.log('[Migration] Licenses & Devices migrated successfully.');
  }

  // Migrate Owners
  const ownersFile = getPath('owners_db.json');
  if (ownersFile) {
    const ownersData = loadJsonFile(ownersFile) || [];
    console.log(`[Migration] Found ${ownersData.length} owners in ${ownersFile}`);
    for (const o of ownersData) {
      let licenseId = null;
      if (o.license_key) {
        const lic = await prisma.license.findUnique({ where: { key: o.license_key } });
        if (lic) licenseId = lic.id;
      }

      await prisma.owner.upsert({
        where: { id: o.id },
        update: {
          email: o.email,
          password_hash: o.password_hash,
          license_id: licenseId,
          max_worker_slots: o.max_worker_slots || 3
        },
        create: {
          id: o.id,
          email: o.email,
          password_hash: o.password_hash,
          license_id: licenseId,
          max_worker_slots: o.max_worker_slots || 3,
          created_at: o.created_at ? new Date(o.created_at) : new Date()
        }
      });
    }
    console.log('[Migration] Owners migrated successfully.');
  }

  // Migrate Workers
  const workersFile = getPath('workers_db.json');
  if (workersFile) {
    const workersData = loadJsonFile(workersFile) || [];
    console.log(`[Migration] Found ${workersData.length} workers in ${workersFile}`);
    for (const w of workersData) {
      // Ensure owner exists
      const owner = await prisma.owner.findUnique({ where: { id: w.owner_id } });
      if (!owner) continue;

      await prisma.worker.upsert({
        where: { id: w.id },
        update: {
          email: w.email,
          password_hash: w.password_hash,
          name: w.name || '',
          active: w.active !== undefined ? w.active : true
        },
        create: {
          id: w.id,
          owner_id: w.owner_id,
          email: w.email,
          password_hash: w.password_hash,
          name: w.name || '',
          active: w.active !== undefined ? w.active : true,
          created_at: w.created_at ? new Date(w.created_at) : new Date()
        }
      });
    }
    console.log('[Migration] Workers migrated successfully.');
  }

  // Migrate Profiles
  const profilesFile = getPath('profiles_cloud_db.json');
  if (profilesFile) {
    const profilesData = loadJsonFile(profilesFile) || [];
    console.log(`[Migration] Found ${profilesData.length} cloud profiles in ${profilesFile}`);
    for (const p of profilesData) {
      const owner = await prisma.owner.findUnique({ where: { id: p.owner_id } });
      if (!owner) continue;

      await prisma.cloudProfile.upsert({
        where: { id: p.id },
        update: {
          name: p.name,
          folder: p.folder || '',
          config: p.config || {},
          cookies: p.cookies || null,
          assigned_worker_ids: p.assigned_worker_ids || [],
          updated_at: p.updated_at ? new Date(p.updated_at) : new Date()
        },
        create: {
          id: p.id,
          owner_id: p.owner_id,
          name: p.name,
          folder: p.folder || '',
          config: p.config || {},
          cookies: p.cookies || null,
          assigned_worker_ids: p.assigned_worker_ids || [],
          created_at: p.created_at ? new Date(p.created_at) : new Date(),
          updated_at: p.updated_at ? new Date(p.updated_at) : new Date()
        }
      });
    }
    console.log('[Migration] Cloud profiles migrated successfully.');
  }

  // Migrate Audit Logs
  const auditFile = getPath('audit_cloud_db.json');
  if (auditFile) {
    const auditData = loadJsonFile(auditFile) || [];
    console.log(`[Migration] Found ${auditData.length} audit logs in ${auditFile}`);
    for (const a of auditData) {
      await prisma.auditLog.upsert({
        where: { id: a.id },
        update: {},
        create: {
          id: a.id,
          owner_id: a.owner_id || null,
          user_id: a.user_id || 'system',
          user_type: a.user_type || 'owner',
          user_name: a.user_name || 'Owner',
          action: a.action,
          target: a.target || '',
          timestamp: a.timestamp ? new Date(a.timestamp) : new Date()
        }
      });
    }
    console.log('[Migration] Audit logs migrated successfully.');
  }

  // 7. Phase 1: idempotent Default Workspace backfill for each Owner.
  const { PRESET_CAPABILITIES } = require('./config/capabilities');
  const OPERATOR_CAPS = PRESET_CAPABILITIES.operator;
  console.log('[Migration] Backfilling default workspaces (idempotent)...');
  const owners = await prisma.owner.findMany({
    include: { workers: true, profiles: true }
  });
  for (const owner of owners) {
    let ws = await prisma.workspace.findFirst({
      where: { owner_id: owner.id, name: 'Default Workspace' }
    });
    if (!ws) {
      ws = await prisma.workspace.create({
        data: {
          owner_id: owner.id,
          name: 'Default Workspace',
          description: 'Workspace mặc định dành cho mọi thành viên',
          policy_revision: 1
        }
      });
      console.log(`[Backfill] Created Default Workspace for ${owner.email || owner.id}`);
    }

    // Add every existing worker as an active Operator member (idempotent).
    for (const worker of owner.workers) {
      await prisma.workspaceMember.upsert({
        where: {
          workspace_id_worker_id: { workspace_id: ws.id, worker_id: worker.id }
        },
        update: {},
        create: {
          workspace_id: ws.id,
          worker_id: worker.id,
          preset_role: 'operator',
          capabilities: OPERATOR_CAPS,
          active: true
        }
      });
    }

    // Add every existing CloudProfile to the workspace (idempotent).
    for (const profile of owner.profiles) {
      await prisma.workspaceProfile.upsert({
        where: {
          workspace_id_profile_id: { workspace_id: ws.id, profile_id: profile.id }
        },
        update: {},
        create: {
          workspace_id: ws.id,
          profile_id: profile.id
        }
      });
    }
  }
  console.log('[Backfill] Default workspace mapping complete.');

  // 8. Backfill the additive multi-profile task link table. This operation is
  // intentionally idempotent because startup migration may be retried.
  console.log('[Migration] Backfilling task workspace-profile links...');
  const legacyTaskProfiles = await prisma.taskProfile.findMany({
    select: { task_id: true, workspace_profile_id: true }
  });
  if (legacyTaskProfiles.length) {
    await prisma.taskWorkspaceProfileLink.createMany({
      data: legacyTaskProfiles,
      skipDuplicates: true
    });
  }
  console.log(`[Backfill] Copied ${legacyTaskProfiles.length} legacy task profile mappings.`);

  console.log('--- Migration & Seeding Completed Successfully ---');
}

runMigration()
  .catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
