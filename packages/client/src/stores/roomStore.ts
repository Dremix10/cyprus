import { create } from 'zustand';
import type { RoomState, PlayerPosition } from '@cyprus/shared';
import { socket } from '../socket.js';

const SESSION_KEY = 'cyprus-session';

type RoomView = 'lobby' | 'waiting' | 'game' | 'queue';

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
  staleSession: { roomCode: string; nickname: string } | null;
  queueInfo: { playersInQueue: number; elapsed: number } | null;

  setNickname: (name: string) => void;
  setTargetScore: (score: number) => void;
  createRoom: () => Promise<void>;
  createSoloRoom: (difficulty: string) => Promise<void>;
  joinRoom: (code: string) => Promise<void>;
  joinMatchmaking: () => Promise<void>;
  leaveMatchmaking: () => void;
  trySessionReconnect: () => Promise<boolean>;
  dismissStaleSession: () => void;
  sitAt: (position: PlayerPosition) => void;
  startGame: () => void;
  setView: (view: RoomView) => void;
  setRoomState: (state: RoomState) => void;
  setError: (error: string | null) => void;
  setQueueInfo: (info: { playersInQueue: number; elapsed: number }) => void;
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
  staleSession: null,
  queueInfo: null,

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

  joinMatchmaking: () => {
    return new Promise<void>((resolve) => {
      const { nickname, targetScore } = get();
      if (!nickname.trim()) {
        set({ error: 'Enter a nickname' });
        resolve();
        return;
      }

      if (!socket.connected) socket.connect();

      socket.emit('matchmaking:join', nickname.trim(), targetScore, (response) => {
        if ('error' in response) {
          set({ error: response.error });
        } else {
          set({ view: 'queue', error: null, queueInfo: { playersInQueue: 1, elapsed: 0 } });
        }
        resolve();
      });
    });
  },

  leaveMatchmaking: () => {
    socket.emit('matchmaking:leave', () => {});
    set({ view: 'lobby', queueInfo: null, error: null });
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

      const maxAttempts = 5;
      const timeoutMs = 12_000;

      const doReconnect = (attempt: number) => {
        const timeout = setTimeout(() => {
          if (attempt < maxAttempts - 1) {
            doReconnect(attempt + 1);
          } else {
            // Don't clear session — store as stale so lobby can show reconnect button
            set({
              reconnecting: false,
              staleSession: { roomCode: session.roomCode, nickname: session.nickname },
            });
            resolve(false);
          }
        }, timeoutMs);

        const emitReconnect = () => {
          socket.emit('session:reconnect', session.sessionId, (response) => {
            clearTimeout(timeout);
            if ('error' in response) {
              if (attempt < maxAttempts - 1) {
                setTimeout(() => doReconnect(attempt + 1), 1000);
              } else {
                // Keep session in localStorage for manual retry
                set({
                  reconnecting: false,
                  staleSession: { roomCode: session.roomCode, nickname: session.nickname },
                });
                resolve(false);
              }
              return;
            }
            set({
              nickname: session.nickname,
              roomCode: response.roomCode,
              view: response.hasGame ? 'game' : 'waiting',
              error: null,
              reconnecting: false,
              staleSession: null,
            });
            resolve(true);
          });
        };

        if (socket.connected) {
          emitReconnect();
        } else {
          socket.once('connect', emitReconnect);
        }
      };

      doReconnect(0);
    });
  },

  dismissStaleSession: () => {
    clearSession();
    set({ staleSession: null });
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
  setQueueInfo: (info) => set({ queueInfo: info }),

  reset: () => {
    clearSession();
    socket.disconnect();
    set({
      view: 'lobby',
      roomCode: null,
      roomState: null,
      error: null,
      reconnecting: false,
      queueInfo: null,
    });
  },
}));
