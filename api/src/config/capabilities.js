// Capability registry (server-side authority). Capabilities are a fixed set;
// the server never accepts arbitrary capability strings from clients.

const CAPABILITIES = {
  WORKSPACE_READ: 'workspace.read',
  WORKSPACE_MANAGE: 'workspace.manage',

  PROFILES_READ: 'profiles.read',
  PROFILES_MANAGE: 'profiles.manage',
  PROFILES_ASSIGN: 'profiles.assign',
  PROFILES_LAUNCH_STOP: 'profiles.launch_stop',

  PROXIES_READ: 'proxies.read',
  PROXIES_MANAGE: 'proxies.manage',
  PROXIES_USE: 'proxies.use',
  PROXIES_ASSIGN: 'proxies.assign',

  COOKIES_IMPORT: 'cookies.import',
  COOKIES_EXPORT: 'cookies.export',

  BROWSER_READ: 'browser.read',
  BROWSER_WRITE: 'browser.write',

  TASKS_READ: 'tasks.read',
  TASKS_MANAGE: 'tasks.manage',
  TASKS_UPDATE_OWN: 'tasks.update_own',

  SOP_READ: 'sop.read',
  SOP_MANAGE: 'sop.manage',

  AUDIT_READ: 'audit.read',

  AI_USE: 'ai.use',
  AI_CONFIGURE: 'ai.configure'
};

const VALID_CAPABILITIES = Object.values(CAPABILITIES);
const CAPABILITY_SET = new Set(VALID_CAPABILITIES);

// Preset -> default capability set. Owner can extend/trim per member.
const PRESET_CAPABILITIES = {
  operator: [
    CAPABILITIES.WORKSPACE_READ,
    CAPABILITIES.PROFILES_READ,
    CAPABILITIES.PROFILES_LAUNCH_STOP,
    CAPABILITIES.BROWSER_READ,
    CAPABILITIES.TASKS_READ,
    CAPABILITIES.TASKS_UPDATE_OWN,
    CAPABILITIES.SOP_READ,
    CAPABILITIES.AI_USE,
    CAPABILITIES.AI_CONFIGURE
  ],
  manager: [
    CAPABILITIES.WORKSPACE_READ,
    CAPABILITIES.PROFILES_READ,
    CAPABILITIES.PROFILES_MANAGE,
    CAPABILITIES.PROFILES_ASSIGN,
    CAPABILITIES.PROFILES_LAUNCH_STOP,
    CAPABILITIES.PROXIES_READ,
    CAPABILITIES.PROXIES_USE,
    CAPABILITIES.PROXIES_ASSIGN,
    CAPABILITIES.BROWSER_READ,
    CAPABILITIES.BROWSER_WRITE,
    CAPABILITIES.TASKS_READ,
    CAPABILITIES.TASKS_MANAGE,
    CAPABILITIES.TASKS_UPDATE_OWN,
    CAPABILITIES.SOP_READ,
    CAPABILITIES.SOP_MANAGE,
    CAPABILITIES.AUDIT_READ,
    CAPABILITIES.AI_USE,
    CAPABILITIES.AI_CONFIGURE
  ],
  auditor: [
    CAPABILITIES.WORKSPACE_READ,
    CAPABILITIES.PROFILES_READ,
    CAPABILITIES.TASKS_READ,
    CAPABILITIES.SOP_READ,
    CAPABILITIES.AUDIT_READ,
    CAPABILITIES.AI_USE,
    CAPABILITIES.AI_CONFIGURE
  ]
};

const PRESET_ROLES = ['operator', 'manager', 'auditor'];

function isValidCapability(cap) {
  return typeof cap === 'string' && CAPABILITY_SET.has(cap);
}

function isValidPreset(role) {
  return PRESET_ROLES.includes(role);
}

module.exports = {
  CAPABILITIES,
  PRESET_CAPABILITIES,
  PRESET_ROLES,
  VALID_CAPABILITIES,
  isValidCapability,
  isValidPreset
};