import type { PlayerPosition } from './player.js';

export type RoomPlayer = {
  nickname: string;
  position: PlayerPosition;
  connected: boolean;
  avatar?: string;
};

export type RoomState = {
  roomCode: string;
  players: RoomPlayer[];
  isStartable: boolean;
  /** 0 is a quick game. Older servers don't send it. */
  targetScore?: number;
};
