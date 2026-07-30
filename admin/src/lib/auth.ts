import { api } from './api';
import { AdminUser } from './types';

const ADMIN_STORAGE_KEY = 'clogin_admin_user';

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

export async function loginAdmin(email: string, password: string): Promise<{ admin: AdminUser }> {
  const data = await api.post<{ admin: AdminUser }>('/v1/admin/auth/login', { email, password });
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
    setStoredAdmin(null);
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  }
}
