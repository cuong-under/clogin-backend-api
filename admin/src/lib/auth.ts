import { api } from './api';
import { AdminUser } from './types';

// Profile admin (không nhạy) vẫn cache ở localStorage để render UI (tên,
// role) không cần gọi API mỗi lần. TOKEN KHÔNG bao giờ nằm ở localStorage
// hay document.cookie nữa — chỉ tồn tại trong httpOnly cookie do server
// (clogin_admin_token) set lúc đăng nhập. XSS không đọc được httpOnly
// cookie → token không bị đánh cắp qua localStorage.

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
  // Server set httpOnly cookie trong response này (credentials: 'include'
  // ở apiFetch đảm bảo cookie được gửi kèm mọi request sau).
  const data = await api.post<{ success: boolean; token: string; admin: AdminUser }>('/v1/admin/auth/login', { email, password });
  if (data.admin) {
    setStoredAdmin(data.admin);
  }
  return data;
}

export async function logoutAdmin(): Promise<void> {
  try {
    // Server thu hồi jti + xoá cookie session.
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
