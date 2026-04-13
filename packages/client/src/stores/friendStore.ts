import { create } from 'zustand';
import type { Friend, FriendRequest, FriendStatus } from '@cyprus/shared';

interface FriendStore {
  friends: Friend[];
  requests: FriendRequest[];
  loading: boolean;

  fetchFriends: () => Promise<void>;
  fetchRequests: () => Promise<void>;
  sendRequest: (friendId: number) => Promise<{ success: boolean; error?: string }>;
  acceptRequest: (userId: number) => Promise<boolean>;
  rejectRequest: (userId: number) => Promise<boolean>;
  removeFriend: (friendId: number) => Promise<boolean>;
  searchUsers: (query: string) => Promise<Array<{ id: number; username: string; displayName: string; friendStatus: FriendStatus }>>;
  getFriendStatus: (userId: number) => Promise<FriendStatus>;
  reset: () => void;
}

async function friendFetch(path: string, options?: RequestInit) {
  return fetch(`/api/friends${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    credentials: 'same-origin',
  });
}

export const useFriendStore = create<FriendStore>((set) => ({
  friends: [],
  requests: [],
  loading: false,

  fetchFriends: async () => {
    try {
      const res = await friendFetch('/');
      if (res.ok) {
        const data = await res.json();
        set({ friends: data });
      }
    } catch { /* ignore */ }
  },

  fetchRequests: async () => {
    try {
      const res = await friendFetch('/requests');
      if (res.ok) {
        const data = await res.json();
        set({ requests: data });
      }
    } catch { /* ignore */ }
  },

  sendRequest: async (friendId) => {
    try {
      const res = await friendFetch('/request', {
        method: 'POST',
        body: JSON.stringify({ friendId }),
      });
      const data = await res.json();
      if (res.ok) return { success: true };
      return { success: false, error: data.error };
    } catch {
      return { success: false, error: 'Connection failed' };
    }
  },

  acceptRequest: async (userId) => {
    try {
      const res = await friendFetch('/accept', {
        method: 'POST',
        body: JSON.stringify({ userId }),
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  rejectRequest: async (userId) => {
    try {
      const res = await friendFetch('/reject', {
        method: 'POST',
        body: JSON.stringify({ userId }),
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  removeFriend: async (friendId) => {
    try {
      const res = await friendFetch('/remove', {
        method: 'POST',
        body: JSON.stringify({ friendId }),
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  searchUsers: async (query) => {
    try {
      const res = await friendFetch(`/search?q=${encodeURIComponent(query)}`);
      if (res.ok) return res.json();
      return [];
    } catch {
      return [];
    }
  },

  getFriendStatus: async (userId) => {
    try {
      const res = await friendFetch(`/status/${userId}`);
      if (res.ok) {
        const data = await res.json();
        return data.status;
      }
      return 'none';
    } catch {
      return 'none';
    }
  },

  reset: () => set({ friends: [], requests: [], loading: false }),
}));
