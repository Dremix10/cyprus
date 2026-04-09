import { create } from 'zustand';
import type { AuthUser } from '@cyprus/shared';

interface AuthStore {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  fieldError: string | null;
  googleClientId: string | null;

  checkAuth: () => Promise<void>;
  login: (username: string, password: string) => Promise<boolean>;
  register: (username: string, password: string, displayName: string, email: string) => Promise<boolean>;
  loginWithGoogle: (credential: string) => Promise<boolean>;
  forgotPassword: (email: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  resetPassword: (token: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  deleteAccount: (password: string) => Promise<{ success: boolean; error?: string }>;
  clearError: () => void;
}

async function authFetch(path: string, options?: RequestInit) {
  return fetch(`/auth${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    credentials: 'same-origin',
  });
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  loading: true,
  error: null,
  fieldError: null,
  googleClientId: null,

  checkAuth: async () => {
    try {
      // Fetch Google client ID and auth status in parallel
      const [meRes, googleRes] = await Promise.all([
        authFetch('/me'),
        authFetch('/google-client-id'),
      ]);

      const googleData = googleRes.ok ? await googleRes.json() : {};

      if (meRes.ok) {
        const data = await meRes.json();
        set({ user: data.user, loading: false, googleClientId: googleData.clientId || null });
      } else {
        set({ user: null, loading: false, googleClientId: googleData.clientId || null });
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
      if (res.ok) { set({ user: data.user, error: null }); return true; }
      set({ error: data.error || 'Login failed' });
      return false;
    } catch {
      set({ error: 'Connection failed' });
      return false;
    }
  },

  register: async (username, password, displayName, email) => {
    set({ error: null, fieldError: null });
    try {
      const res = await authFetch('/register', {
        method: 'POST',
        body: JSON.stringify({ username, password, displayName, email }),
      });
      const data = await res.json();
      if (res.ok) { set({ user: data.user, error: null }); return true; }
      set({ error: data.error || 'Registration failed', fieldError: data.field || null });
      return false;
    } catch {
      set({ error: 'Connection failed' });
      return false;
    }
  },

  loginWithGoogle: async (credential) => {
    set({ error: null, fieldError: null });
    try {
      const res = await authFetch('/google', {
        method: 'POST',
        body: JSON.stringify({ credential }),
      });
      const data = await res.json();
      if (res.ok) { set({ user: data.user, error: null }); return true; }
      set({ error: data.error || 'Google sign-in failed' });
      return false;
    } catch {
      set({ error: 'Connection failed' });
      return false;
    }
  },

  forgotPassword: async (email) => {
    try {
      const res = await authFetch('/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.ok) return { success: true, message: data.message };
      return { success: false, error: data.error || 'Failed' };
    } catch {
      return { success: false, error: 'Connection failed' };
    }
  },

  resetPassword: async (token, newPassword) => {
    try {
      const res = await authFetch('/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await res.json();
      if (res.ok) return { success: true };
      return { success: false, error: data.error || 'Failed' };
    } catch {
      return { success: false, error: 'Connection failed' };
    }
  },

  logout: async () => {
    try { await authFetch('/logout', { method: 'POST' }); } catch { /* ignore */ }
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
      if (res.ok) { set({ user: null }); return { success: true }; }
      return { success: false, error: data.error || 'Failed' };
    } catch {
      return { success: false, error: 'Connection failed' };
    }
  },

  clearError: () => set({ error: null, fieldError: null }),
}));
