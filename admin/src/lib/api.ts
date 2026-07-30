import { getStoredAdminToken, setStoredAdminToken, setStoredAdmin } from './auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://api-clogin.nghemmo.com';

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getStoredAdminToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers,
  });
  if (res.status === 401) {
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      setStoredAdminToken(null);
      setStoredAdmin(null);
      window.location.href = '/login';
    }
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: 'Request failed' } }));
    throw new Error(err.error?.message || err.message || 'Request failed');
  }
  return res.json();
}

export const api = {
  get: <T>(path: string, options?: RequestInit) => apiFetch<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: any, options?: RequestInit) =>
    apiFetch<T>(path, { ...options, method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body?: any, options?: RequestInit) =>
    apiFetch<T>(path, { ...options, method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body?: any, options?: RequestInit) =>
    apiFetch<T>(path, { ...options, method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string, options?: RequestInit) => apiFetch<T>(path, { ...options, method: 'DELETE' }),
};
