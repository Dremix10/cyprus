import { create } from 'zustand';
import type { RoomState, PlayerPosition } from '@cyprus/shared';
import { socket } from '../socket.js';

type RoomView = 'lobby' | 'waiting' | 'game';

interface RoomStore {
  view: RoomView;
  nickname: string;
  roomCode: string | null;
  roomState: RoomState | null;
  error: string | null;

  setNickname: (name: string) => void;
  createRoom: () => Promise<void>;
  joinRoom: (code: string) => Promise<void>;
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
  roomCode: null,
  roomState: null,
  error: null,

  setNickname: (name) => set({ nickname: name }),

  createRoom: () => {
    return new Promise<void>((resolve) => {
      const { nickname } = get();
      if (!nickname.trim()) {
        set({ error: 'Enter a nickname' });
        resolve();
        return;
      }

      if (!socket.connected) socket.connect();

      socket.emit('room:create', nickname.trim(), (response) => {
        if ('error' in response) {
          set({ error: response.error });
        } else {
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
    socket.disconnect();
    set({
      view: 'lobby',
      roomCode: null,
      roomState: null,
      error: null,
    });
  },
}));
