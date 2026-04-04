import type { PlayerPosition } from './player.js';

export type RoomPlayer = {
  nickname: string;
  position: PlayerPosition;
  connected: boolean;
};

export type RoomState = {
  roomCode: string;
  players: RoomPlayer[];
  isStartable: boolean;
};
