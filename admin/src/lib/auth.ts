import { api } from './api';
import { AdminUser } from './types';

const ADMIN_STORAGE_KEY = 'clogin_admin_user';
const ADMIN_TOKEN_KEY = 'clogin_admin_token';

export function getStoredAdmin(): AdminUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const item = localStorage.getItem(ADMIN_STORAGE_KEY);
    return item ? JSON.parse(item) : null;
  } catch {
    return null;
  }
}

export function setStoredAdmin(user: AdminUser | null): void {
  if (typeof window === 'undefined') return;
  if (user) {
    localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(ADMIN_STORAGE_KEY);
  }
}

export function getStoredAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setStoredAdminToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  if (token) {
    localStorage.setItem(ADMIN_TOKEN_KEY, token);
    document.cookie = `clogin_admin_session=${token}; path=/; max-age=86400; SameSite=Lax`;
  } else {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    document.cookie = 'clogin_admin_session=; path=/; max-age=0; SameSite=Lax';
  }
}

export async function loginAdmin(email: string, password: string): Promise<{ admin: AdminUser }> {
  const data = await api.post<{ success: boolean; token: string; admin: AdminUser }>('/v1/admin/auth/login', { email, password });
  if (data.token) {
    setStoredAdminToken(data.token);
  }
  if (data.admin) {
    setStoredAdmin(data.admin);
  }
  return data;
}

export async function logoutAdmin(): Promise<void> {
  try {
    await api.post('/v1/admin/auth/logout');
  } catch (err) {
    console.error('Logout error:', err);
  } finally {
    setStoredAdminToken(null);
    setStoredAdmin(null);
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  }
}
