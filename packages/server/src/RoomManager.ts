import type { PlayerPosition, RoomState } from '@cyprus/shared';
import { GameEngine } from './GameEngine.js';

export type RoomPlayer = {
  socketId: string;
  nickname: string;
  position: PlayerPosition;
  connected: boolean;
  disconnectedAt?: number;
};

export type Room = {
  code: string;
  players: Map<PlayerPosition, RoomPlayer>;
  engine: GameEngine | null;
  createdAt: number;
  lastActivity: number;
};

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I, O (ambiguous)
const ROOM_CODE_LENGTH = 4;
const RECONNECT_TIMEOUT_MS = 120_000; // 2 minutes
const ROOM_CLEANUP_INTERVAL_MS = 60_000; // check every minute
const ROOM_INACTIVE_TIMEOUT_MS = 30 * 60_000; // 30 minutes

export class RoomManager {
  private rooms = new Map<string, Room>();
  private socketToRoom = new Map<string, { roomCode: string; position: PlayerPosition }>();
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor() {
    this.cleanupInterval = setInterval(() => this.cleanup(), ROOM_CLEANUP_INTERVAL_MS);
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
  }

  createRoom(socketId: string, nickname: string): { roomCode: string } | { error: string } {
    const code = this.generateCode();
    const room: Room = {
      code,
      players: new Map(),
      engine: null,
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };
    this.rooms.set(code, room);

    // Creator sits at position 0 by default
    const player: RoomPlayer = {
      socketId,
      nickname,
      position: 0,
      connected: true,
    };
    room.players.set(0, player);
    this.socketToRoom.set(socketId, { roomCode: code, position: 0 });

    return { roomCode: code };
  }

  joinRoom(
    socketId: string,
    roomCode: string,
    nickname: string
  ): { success: true; position: PlayerPosition } | { error: string } {
    const code = roomCode.toUpperCase();
    const room = this.rooms.get(code);
    if (!room) return { error: 'Room not found' };

    // Check if this nickname is reconnecting
    for (const [pos, player] of room.players) {
      if (player.nickname === nickname && !player.connected) {
        // Reconnect
        player.socketId = socketId;
        player.connected = true;
        delete player.disconnectedAt;
        this.socketToRoom.set(socketId, { roomCode: code, position: pos });
        room.lastActivity = Date.now();
        return { success: true, position: pos };
      }
    }

    // Check for duplicate nickname
    for (const [, player] of room.players) {
      if (player.nickname === nickname && player.connected) {
        return { error: 'Nickname already taken' };
      }
    }

    if (room.players.size >= 4) return { error: 'Room is full' };

    // Find first open position
    const openPos = ([0, 1, 2, 3] as PlayerPosition[]).find(
      (p) => !room.players.has(p)
    );
    if (openPos === undefined) return { error: 'Room is full' };

    const player: RoomPlayer = {
      socketId,
      nickname,
      position: openPos,
      connected: true,
    };
    room.players.set(openPos, player);
    this.socketToRoom.set(socketId, { roomCode: code, position: openPos });
    room.lastActivity = Date.now();

    return { success: true, position: openPos };
  }

  sitAt(socketId: string, position: PlayerPosition): boolean {
    const info = this.socketToRoom.get(socketId);
    if (!info) return false;

    const room = this.rooms.get(info.roomCode);
    if (!room) return false;
    if (room.engine) return false; // can't move seats during a game

    if (room.players.has(position) && position !== info.position) return false;

    const player = room.players.get(info.position)!;
    room.players.delete(info.position);
    player.position = position;
    room.players.set(position, player);
    this.socketToRoom.set(socketId, { roomCode: info.roomCode, position });

    return true;
  }

  startGame(socketId: string): { error?: string } {
    const info = this.socketToRoom.get(socketId);
    if (!info) return { error: 'Not in a room' };

    const room = this.rooms.get(info.roomCode);
    if (!room) return { error: 'Room not found' };
    if (room.engine) return { error: 'Game already started' };
    if (room.players.size !== 4) return { error: 'Need 4 players' };

    const nicknames: [string, string, string, string] = [
      room.players.get(0)!.nickname,
      room.players.get(1)!.nickname,
      room.players.get(2)!.nickname,
      room.players.get(3)!.nickname,
    ];

    room.engine = new GameEngine(nicknames);
    room.engine.startRound();
    room.lastActivity = Date.now();

    return {};
  }

  handleDisconnect(socketId: string): {
    roomCode: string;
    nickname: string;
  } | null {
    const info = this.socketToRoom.get(socketId);
    if (!info) return null;

    const room = this.rooms.get(info.roomCode);
    if (!room) return null;

    const player = room.players.get(info.position);
    if (!player) return null;

    player.connected = false;
    player.disconnectedAt = Date.now();
    this.socketToRoom.delete(socketId);
    room.lastActivity = Date.now();

    // If no game is in progress, remove the player after a short delay
    if (!room.engine) {
      room.players.delete(info.position);
    }

    return { roomCode: info.roomCode, nickname: player.nickname };
  }

  getRoom(roomCode: string): Room | undefined {
    return this.rooms.get(roomCode.toUpperCase());
  }

  getRoomForSocket(socketId: string): {
    room: Room;
    position: PlayerPosition;
  } | null {
    const info = this.socketToRoom.get(socketId);
    if (!info) return null;
    const room = this.rooms.get(info.roomCode);
    if (!room) return null;
    return { room, position: info.position };
  }

  getRoomState(roomCode: string): RoomState | null {
    const room = this.rooms.get(roomCode);
    if (!room) return null;

    return {
      roomCode: room.code,
      players: [...room.players.values()].map((p) => ({
        nickname: p.nickname,
        position: p.position,
        connected: p.connected,
      })),
      isStartable: room.players.size === 4 && !room.engine,
    };
  }

  getSocketIdsForRoom(roomCode: string): Map<PlayerPosition, string> {
    const room = this.rooms.get(roomCode);
    if (!room) return new Map();

    const result = new Map<PlayerPosition, string>();
    for (const [pos, player] of room.players) {
      if (player.connected) {
        result.set(pos, player.socketId);
      }
    }
    return result;
  }

  private generateCode(): string {
    let code: string;
    do {
      code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
        code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
      }
    } while (this.rooms.has(code));
    return code;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      // Clean up disconnected players past timeout
      if (room.engine) {
        for (const [pos, player] of room.players) {
          if (
            !player.connected &&
            player.disconnectedAt &&
            now - player.disconnectedAt > RECONNECT_TIMEOUT_MS
          ) {
            // Player timed out — for now, just mark as disconnected
            // TODO: handle game abort or AI takeover
          }
        }
      }

      // Clean up inactive rooms
      if (now - room.lastActivity > ROOM_INACTIVE_TIMEOUT_MS) {
        this.rooms.delete(code);
      }
    }
  }
}
