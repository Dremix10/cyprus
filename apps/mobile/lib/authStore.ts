import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import type { AuthUser } from '@cyprus/shared';
import { api } from './api';
import { socket } from './socket';
import { setSocketToken } from './token';
import { useLangStore, type Lang } from './i18n';

const KEY = 'cyprus-auth';

interface AuthStore {
  user: AuthUser | null;
  ready: boolean;
  error: string | null;
  googleClientId: string | null;
  hydrate: () => Promise<void>;
  login: (username: string, password: string) => Promise<boolean>;
  register: (username: string, password: string, displayName: string, email: string) => Promise<boolean>;
  loginWithGoogle: (credential: string) => Promise<boolean>;
  loginWithApple: (identityToken: string, fullName: string | null) => Promise<boolean>;
  forgotPassword: (email: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  deleteAccount: (password: string) => Promise<{ success: boolean; error?: string }>;
  changeDisplayName: (displayName: string) => Promise<{ success: boolean; error?: string }>;
  changeAvatar: (avatar: string) => Promise<{ success: boolean; error?: string }>;
  changeLanguage: (language: Lang) => Promise<void>;
  clearError: () => void;
}

async function remember(token: string | undefined, user: AuthUser) {
  if (!token) throw new Error('Server did not provide a mobile session');
  if (token) {
    setSocketToken(token);
    await SecureStore.setItemAsync(KEY, token);
    socket.disconnect();
    socket.connect();
  }
  if (user.language === 'en' || user.language === 'el') useLangStore.getState().setLang(user.language);
}

export const useAuth = create<AuthStore>((set) => ({
  user: null,
  ready: false,
  error: null,
  googleClientId: null,

  hydrate: async () => {
    try {
      const saved = await SecureStore.getItemAsync(KEY);
      if (saved) setSocketToken(saved);
      const [meRes, googleRes] = await Promise.all([api('/auth/me'), api('/auth/google-client-id')]);
      const google = googleRes.ok ? await googleRes.json() : {};
      if (meRes.ok) {
        const data = await meRes.json();
        if (data.user?.language === 'en' || data.user?.language === 'el') useLangStore.getState().setLang(data.user.language);
        set({ user: data.user, ready: true, googleClientId: google.iosClientId || null });
      } else {
        if (saved) {
          setSocketToken(null);
          await SecureStore.deleteItemAsync(KEY);
        }
        set({ user: null, ready: true, googleClientId: google.iosClientId || null });
      }
    } catch {
      set({ user: null, ready: true });
    }
  },

  login: async (username, password) => {
    set({ error: null });
    try {
      const res = await api('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
      const data = await res.json();
      if (!res.ok) {
        set({ error: data.error || 'Login failed' });
        return false;
      }
      await remember(data.token, data.user);
      set({ user: data.user, error: null });
      return true;
    } catch {
      set({ error: 'Connection failed' });
      return false;
    }
  },

  register: async (username, password, displayName, email) => {
    set({ error: null });
    try {
      const res = await api('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, password, displayName, email }),
      });
      const data = await res.json();
      if (!res.ok) {
        set({ error: data.error || 'Registration failed' });
        return false;
      }
      await remember(data.token, data.user);
      set({ user: data.user, error: null });
      return true;
    } catch {
      set({ error: 'Connection failed' });
      return false;
    }
  },

  loginWithGoogle: async (credential) => {
    set({ error: null });
    try {
      const res = await api('/auth/google', { method: 'POST', body: JSON.stringify({ credential }) });
      const data = await res.json();
      if (!res.ok) {
        set({ error: data.error || 'Google sign-in failed' });
        return false;
      }
      await remember(data.token, data.user);
      set({ user: data.user });
      return true;
    } catch {
      set({ error: 'Connection failed' });
      return false;
    }
  },

  loginWithApple: async (identityToken, fullName) => {
    set({ error: null });
    try {
      const res = await api('/auth/apple', {
        method: 'POST',
        body: JSON.stringify({ identityToken, fullName }),
      });
      const data = await res.json();
      if (!res.ok) {
        set({ error: data.error || 'Apple sign-in failed' });
        return false;
      }
      await remember(data.token, data.user);
      set({ user: data.user });
      return true;
    } catch {
      set({ error: 'Connection failed' });
      return false;
    }
  },

  forgotPassword: async (email) => {
    try {
      const res = await api('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
      const data = await res.json();
      if (res.ok) return { success: true, message: data.message };
      return { success: false, error: data.error || 'Failed' };
    } catch {
      return { success: false, error: 'Connection failed' };
    }
  },

  logout: async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* still drop the local token */ }
    setSocketToken(null);
    await SecureStore.deleteItemAsync(KEY);
    socket.disconnect();
    socket.connect();
    set({ user: null, error: null });
  },

  changePassword: async (currentPassword, newPassword) => {
    try {
      const res = await api('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error || 'Failed' };
      setSocketToken(null);
      await SecureStore.deleteItemAsync(KEY);
      socket.disconnect();
      socket.connect();
      set({ user: null });
      return { success: true };
    } catch {
      return { success: false, error: 'Connection failed' };
    }
  },

  deleteAccount: async (password) => {
    try {
      const res = await api('/auth/delete-account', { method: 'POST', body: JSON.stringify({ password }) });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error || 'Failed' };
      setSocketToken(null);
      await SecureStore.deleteItemAsync(KEY);
      socket.disconnect();
      socket.connect();
      set({ user: null });
      return { success: true };
    } catch {
      return { success: false, error: 'Connection failed' };
    }
  },

  changeDisplayName: async (displayName) => {
    try {
      const res = await api('/auth/change-display-name', { method: 'POST', body: JSON.stringify({ displayName }) });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error || 'Failed' };
      set((s) => ({ user: s.user ? { ...s.user, displayName, displayNameChangedAt: new Date().toISOString() } : s.user }));
      return { success: true };
    } catch {
      return { success: false, error: 'Connection failed' };
    }
  },

  changeAvatar: async (avatar) => {
    try {
      const res = await api('/auth/change-avatar', { method: 'POST', body: JSON.stringify({ avatar }) });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error || 'Failed' };
      set((s) => ({ user: s.user ? { ...s.user, avatar } : s.user }));
      return { success: true };
    } catch {
      return { success: false, error: 'Connection failed' };
    }
  },

  changeLanguage: async (language) => {
    useLangStore.getState().setLang(language);
    const user = useAuth.getState().user;
    if (!user) return;
    try {
      await api('/auth/change-language', { method: 'POST', body: JSON.stringify({ language }) });
      set((s) => ({ user: s.user ? { ...s.user, language } : s.user }));
    } catch { /* the local choice still stands */ }
  },

  clearError: () => set({ error: null }),
}));
