export type Role = 'super_admin' | 'support' | 'viewer';
export type LicenseStatus = 'active' | 'expired' | 'suspended';
export type Channel = 'stable' | 'beta' | 'canary';
export type AnnouncementType = 'info' | 'warning' | 'critical';

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  last_login?: string;
  created_at: string;
}

export interface DashboardStats {
  total_licenses: number;
  active_users: number;
  cloud_profiles: number;
  active_devices: number;
  logins_by_day: { date: string; count: number }[];
  new_users_by_day: { date: string; count: number }[];
  recent_activity: AuditEntry[];
}

export interface LicenseDevice {
  id: string;
  device_id: string;
  device_name: string;
  os: string;
  ip: string;
  last_active: string;
}

export interface License {
  id: string;
  key: string;
  plan_id: string;
  plan_name: string;
  owner_id?: string;
  owner_email?: string;
  max_devices: number;
  active_devices_count: number;
  status: LicenseStatus;
  valid_until: string;
  created_at: string;
  notes?: string;
  devices?: LicenseDevice[];
}

export interface LicensePlan {
  id: string;
  name: string;
  slug: string;
  max_devices: number;
  max_workers: number;
  max_profiles: number;
  price: number;
  duration_days: number;
  active: boolean;
  created_at: string;
}

export interface Coupon {
  id: string;
  code: string;
  discount_percent: number;
  plan_id?: string;
  plan_name?: string;
  used_count: number;
  max_uses: number;
  active: boolean;
  expires_at: string;
  created_at: string;
}

export interface OwnerUser {
  id: string;
  email: string;
  name: string;
  license_key?: string;
  workers_count: number;
  max_workers: number;
  profiles_count: number;
  last_login?: string;
  status: 'active' | 'suspended';
  created_at: string;
}

export interface WorkerUser {
  id: string;
  email: string;
  name: string;
  owner_id: string;
  owner_email: string;
  active: boolean;
  last_login?: string;
  created_at: string;
}

export interface CloudProfile {
  id: string;
  name: string;
  owner_id: string;
  owner_email: string;
  folder: string;
  assigned_workers_count: number;
  has_cookies: boolean;
  config_json?: string;
  cookies_info?: string;
  assigned_workers?: WorkerUser[];
  updated_at: string;
  created_at: string;
}

export interface Release {
  id: string;
  version: string;
  channel: Channel;
  changelog: string;
  download_url: string;
  update_signature?: string | null;
  min_version?: string;
  is_current: boolean;
  published_at: string;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  user_email: string;
  user_type: string;
  action_type: string;
  action_name: string;
  target: string;
  ip: string;
  details?: string;
}

export interface LoginHistoryEntry {
  id: string;
  timestamp: string;
  email: string;
  ip: string;
  country: string;
  success: boolean;
  user_agent: string;
}

export interface SecurityBlockedIP {
  id: string;
  ip: string;
  reason: string;
  blocked_at: string;
  blocked_by: string;
}

export interface SuspiciousActivity {
  id: string;
  timestamp: string;
  type: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  ip: string;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  type: AnnouncementType;
  target: 'all' | 'owners' | 'workers';
  active: boolean;
  start_date: string;
  end_date: string;
  created_at: string;
}

export interface SystemConfig {
  jwt_secret?: string;
  jwt_expiry?: string;
  rate_limit_login?: number;
  rate_limit_api?: number;
  maintenance_mode?: boolean;
  maintenance_message?: string;
  [key: string]: any;
}

export interface FeatureFlag {
  id: string;
  key: string;
  name: string;
  enabled: boolean;
  target_plans: string[];
  created_at: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface UpstreamStatus {
  status: 'UP_TO_DATE' | 'BEHIND' | 'UNAUTHORIZED' | 'AVAILABLE' | 'ERROR';
  behind_by: number;
  ahead_by: number;
  status_text?: string;
  last_checked: string;
  total_commits?: number;
  message?: string;
  commits?: UpstreamCommit[];
}

export interface UpstreamCommit {
  sha: string;
  full_sha?: string;
  message: string;
  author: string;
  avatar_url?: string;
  date: string;
  html_url: string;
}

export interface UpstreamConfig {
  github_token: string;
  upstream_repo: string;
  origin_repo: string;
  target_branch: string;
}
