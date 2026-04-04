import { create } from 'zustand';
import type { RoomState, PlayerPosition } from '@cyprus/shared';
import { socket } from '../socket.js';

type RoomView = 'lobby' | 'waiting' | 'game';

interface RoomStore {
  view: RoomView;
  nickname: string;
  targetScore: number;
  roomCode: string | null;
  roomState: RoomState | null;
  error: string | null;

  setNickname: (name: string) => void;
  setTargetScore: (score: number) => void;
  createRoom: () => Promise<void>;
  createSoloRoom: (difficulty: string) => Promise<void>;
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
  targetScore: 1000,
  roomCode: null,
  roomState: null,
  error: null,

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
