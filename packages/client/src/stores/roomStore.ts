import { create } from 'zustand';
import type { RoomState, PlayerPosition } from '@cyprus/shared';
import { socket } from '../socket.js';

const SESSION_KEY = 'cyprus-session';

type RoomView = 'lobby' | 'waiting' | 'game';

function saveSession(sessionId: string, roomCode: string, nickname: string): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ sessionId, roomCode, nickname }));
}

function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

function loadSession(): { sessionId: string; roomCode: string; nickname: string } | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

interface RoomStore {
  view: RoomView;
  nickname: string;
  targetScore: number;
  roomCode: string | null;
  roomState: RoomState | null;
  error: string | null;
  reconnecting: boolean;

  setNickname: (name: string) => void;
  setTargetScore: (score: number) => void;
  createRoom: () => Promise<void>;
  createSoloRoom: (difficulty: string) => Promise<void>;
  joinRoom: (code: string) => Promise<void>;
  trySessionReconnect: () => Promise<boolean>;
  sitAt: (position: PlayerPosition) => void;
  startGame: () => void;
  setView: (view: RoomView) => void;
  setRoomState: (state: RoomState) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useRoomStore = create<RoomStore>((set, get) => ({
  view: 'lobby',
  nickname: '',
  targetScore: 1000,
  roomCode: null,
  roomState: null,
  error: null,
  reconnecting: false,

  setNickname: (name) => set({ nickname: name }),
  setTargetScore: (score) => set({ targetScore: score }),

  createRoom: () => {
    return new Promise<void>((resolve) => {
      const { nickname, targetScore } = get();
      if (!nickname.trim()) {
        set({ error: 'Enter a nickname' });
        resolve();
        return;
      }

      if (!socket.connected) socket.connect();

      socket.emit('room:create', nickname.trim(), targetScore, (response) => {
        if ('error' in response) {
          set({ error: response.error });
        } else {
          saveSession(response.sessionId, response.roomCode, nickname.trim());
          set({
            roomCode: response.roomCode,
            view: 'waiting',
            error: null,
          });
        }
        resolve();
      });
    });
  },

  createSoloRoom: (difficulty: string) => {
    return new Promise<void>((resolve) => {
      const { nickname, targetScore } = get();
      if (!nickname.trim()) {
        set({ error: 'Enter a nickname' });
        resolve();
        return;
      }

      if (!socket.connected) socket.connect();

      socket.emit('room:create_solo', nickname.trim(), targetScore, difficulty, (response) => {
        if ('error' in response) {
          set({ error: response.error });
        } else {
          saveSession(response.sessionId, response.roomCode, nickname.trim());
          set({
            roomCode: response.roomCode,
            error: null,
          });
        }
        resolve();
      });
    });
  },

  joinRoom: (code: string) => {
    return new Promise<void>((resolve) => {
      const { nickname } = get();
      if (!nickname.trim()) {
        set({ error: 'Enter a nickname' });
        resolve();
        return;
      }
      if (!code.trim()) {
        set({ error: 'Enter a room code' });
        resolve();
        return;
      }

      if (!socket.connected) socket.connect();

      socket.emit('room:join', code.trim().toUpperCase(), nickname.trim(), (response) => {
        if ('error' in response) {
          set({ error: response.error });
        } else {
          saveSession(response.sessionId, code.trim().toUpperCase(), nickname.trim());
          set({
            roomCode: code.trim().toUpperCase(),
            view: 'waiting',
            error: null,
          });
        }
        resolve();
      });
    });
  },

  trySessionReconnect: () => {
    return new Promise<boolean>((resolve) => {
      const session = loadSession();
      if (!session) {
        resolve(false);
        return;
      }

      set({ reconnecting: true });

      if (!socket.connected) socket.connect();

      // Timeout: if server never responds, fall back to lobby
      const timeout = setTimeout(() => {
        clearSession();
        set({ reconnecting: false });
        resolve(false);
      }, 8_000);

      socket.emit('session:reconnect', session.sessionId, (response) => {
        clearTimeout(timeout);
        if ('error' in response) {
          clearSession();
          set({ reconnecting: false });
          resolve(false);
          return;
        }
        set({
          nickname: session.nickname,
          roomCode: response.roomCode,
          view: response.hasGame ? 'game' : 'waiting',
          error: null,
          reconnecting: false,
        });
        resolve(true);
      });
    });
  },

  sitAt: (position) => {
    socket.emit('room:sit', position);
  },

  startGame: () => {
    socket.emit('room:start');
  },

  setView: (view) => set({ view }),
  setRoomState: (state) => set({ roomState: state }),
  setError: (error) => set({ error }),

  reset: () => {
    clearSession();
    socket.disconnect();
    set({
      view: 'lobby',
      roomCode: null,
      roomState: null,
      error: null,
      reconnecting: false,
    });
  },
}));
