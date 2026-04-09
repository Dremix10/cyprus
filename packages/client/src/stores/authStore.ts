import { create } from 'zustand';
import type { AuthUser } from '@cyprus/shared';

interface AuthStore {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  fieldError: string | null;

  checkAuth: () => Promise<void>;
  login: (username: string, password: string) => Promise<boolean>;
  register: (username: string, password: string, displayName: string) => Promise<boolean>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  deleteAccount: (password: string) => Promise<{ success: boolean; error?: string }>;
  clearError: () => void;
}

async function authFetch(path: string, options?: RequestInit) {
  const res = await fetch(`/auth${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    credentials: 'same-origin',
  });
  return res;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  loading: true,
  error: null,
  fieldError: null,

  checkAuth: async () => {
    try {
      const res = await authFetch('/me');
      if (res.ok) {
        const data = await res.json();
        set({ user: data.user, loading: false });
      } else {
        set({ user: null, loading: false });
      }
    } catch {
      set({ user: null, loading: false });
    }
  },

  login: async (username, password) => {
    set({ error: null, fieldError: null });
    try {
      const res = await authFetch('/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (res.ok) {
        set({ user: data.user, error: null });
        return true;
      }
      set({ error: data.error || 'Login failed' });
      return false;
    } catch {
      set({ error: 'Connection failed' });
      return false;
    }
  },

  register: async (username, password, displayName) => {
    set({ error: null, fieldError: null });
    try {
      const res = await authFetch('/register', {
        method: 'POST',
        body: JSON.stringify({ username, password, displayName }),
      });
      const data = await res.json();
      if (res.ok) {
        set({ user: data.user, error: null });
        return true;
      }
      set({ error: data.error || 'Registration failed', fieldError: data.field || null });
      return false;
    } catch {
      set({ error: 'Connection failed' });
      return false;
    }
  },

  logout: async () => {
    try {
      await authFetch('/logout', { method: 'POST' });
    } catch { /* ignore */ }
    set({ user: null, error: null });
  },

  changePassword: async (currentPassword, newPassword) => {
    try {
      const res = await authFetch('/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (res.ok) return { success: true };
      return { success: false, error: data.error || 'Failed' };
    } catch {
      return { success: false, error: 'Connection failed' };
    }
  },

  deleteAccount: async (password) => {
    try {
      const res = await authFetch('/delete-account', {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (res.ok) {
        set({ user: null });
        return { success: true };
      }
      return { success: false, error: data.error || 'Failed' };
    } catch {
      return { success: false, error: 'Connection failed' };
    }
  },

  clearError: () => set({ error: null, fieldError: null }),
}));
