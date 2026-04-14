import { create } from 'zustand';
import type { RoomState, PlayerPosition } from '@cyprus/shared';
import { socket } from '../socket.js';

const SESSION_KEY = 'cyprus-session';

type RoomView = 'lobby' | 'waiting' | 'game' | 'queue';

const SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

function saveSession(sessionId: string, roomCode: string, nickname: string): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ sessionId, roomCode, nickname, expiresAt: Date.now() + SESSION_TTL_MS }));
}

function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

function ensureConnected(): Promise<void> {
  if (socket.connected) return Promise.resolve();
  socket.connect();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off('connect', onConnect);
      reject(new Error('Connection timed out'));
    }, 5000);
    const onConnect = () => {
      clearTimeout(timeout);
      resolve();
    };
    socket.once('connect', onConnect);
  });
}

function loadSession(): { sessionId: string; roomCode: string; nickname: string } | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return parsed;
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
  handleMatchFound: (roomCode: string, sessionId: string) => void;
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
    return new Promise<void>(async (resolve) => {
      const { nickname, targetScore } = get();
      if (!nickname.trim()) {
        set({ error: 'Enter a nickname' });
        resolve();
        return;
      }

      try { await ensureConnected(); } catch {
        set({ error: 'Could not connect to server. Try again.' });
        resolve();
        return;
      }

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
    return new Promise<void>(async (resolve) => {
      const { nickname, targetScore } = get();
      if (!nickname.trim()) {
        set({ error: 'Enter a nickname' });
        resolve();
        return;
      }

      try { await ensureConnected(); } catch {
        set({ error: 'Could not connect to server. Try again.' });
        resolve();
        return;
      }

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
    return new Promise<void>(async (resolve) => {
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

      try { await ensureConnected(); } catch {
        set({ error: 'Could not connect to server. Try again.' });
        resolve();
        return;
      }

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
    return new Promise<void>(async (resolve) => {
      const { nickname, targetScore } = get();
      if (!nickname.trim()) {
        set({ error: 'Enter a nickname' });
        resolve();
        return;
      }

      try { await ensureConnected(); } catch {
        set({ error: 'Could not connect to server. Try again.' });
        resolve();
        return;
      }

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
    return new Promise<boolean>(async (resolve) => {
      const session = loadSession();
      if (!session) {
        resolve(false);
        return;
      }

      // Prevent concurrent reconnect attempts
      if (get().reconnecting) {
        resolve(false);
        return;
      }

      set({ reconnecting: true });

      try { await ensureConnected(); } catch {
        set({ reconnecting: false, error: 'Could not connect to server. Try again.' });
        resolve(false);
        return;
      }

      let settled = false;
      const finish = (success: boolean, stateUpdate: Partial<RoomStore>) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.off('connect', onConnect);
        set(stateUpdate as Parameters<typeof set>[0]);
        resolve(success);
      };

      const timer = setTimeout(() => {
        // Timed out — release the lock so Socket.IO's next reconnect can retry
        finish(false, {
          reconnecting: false,
          staleSession: { roomCode: session.roomCode, nickname: session.nickname },
          error: 'Reconnect timed out. Retrying...',
        });
      }, 15_000);

      const emitReconnect = () => {
        if (settled) return;
        socket.emit('session:reconnect', session.sessionId, (response) => {
          if (settled) return;
          if ('error' in response) {
            const permanent = ['Session expired', 'Room no longer exists', 'Session invalid', 'You were replaced by a bot'].some(
              (msg) => response.error.includes(msg)
            );
            if (permanent) {
              clearSession();
              finish(false, { reconnecting: false, staleSession: null, error: response.error });
            } else {
              // Non-permanent error — release lock, Socket.IO auto-reconnect will retry
              finish(false, {
                reconnecting: false,
                staleSession: { roomCode: session.roomCode, nickname: session.nickname },
                error: 'Could not reconnect. Retrying...',
              });
            }
            return;
          }
          finish(true, {
            nickname: session.nickname,
            roomCode: response.roomCode,
            view: response.hasGame ? 'game' : 'waiting',
            error: null,
            reconnecting: false,
            staleSession: null,
          });
        });
      };

      const onConnect = () => emitReconnect();

      if (socket.connected) {
        emitReconnect();
      } else {
        socket.once('connect', onConnect);
      }
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

  handleMatchFound: (roomCode, sessionId) => {
    const { nickname } = get();
    saveSession(sessionId, roomCode, nickname);
    set({ roomCode, queueInfo: null, error: null });
  },

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
