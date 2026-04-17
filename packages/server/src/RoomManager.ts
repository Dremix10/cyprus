import type { PlayerPosition, RoomState } from '@cyprus/shared';
import { GamePhase } from '@cyprus/shared';
import { GameEngine } from './GameEngine.js';
import type { BotDifficulty } from './BotAI.js';
import { randomUUID } from 'node:crypto';

export type RoomPlayer = {
  socketId: string;
  nickname: string;
  position: PlayerPosition;
  connected: boolean;
  disconnectedAt?: number;
  avatar?: string;
  sessionId?: string;
  userId?: number; // linked auth user ID (undefined for guests/bots)
  replacedPlayer?: { nickname: string; sessionId?: string; userId?: number }; // original player info if replaced by bot
};

export type Room = {
  code: string;
  players: Map<PlayerPosition, RoomPlayer>;
  engine: GameEngine | null;
  targetScore: number;
  botPositions: Set<PlayerPosition>;
  botDifficulty: BotDifficulty;
  createdAt: number;
  lastActivity: number;
};

const BOT_PROFILES = [
  { name: 'Bot Zeus', avatarBase: 'bot-zeus' },
  { name: 'Bot Athena', avatarBase: 'bot-athena' },
  { name: 'Bot Apollo', avatarBase: 'bot-apollo' },
];

function randomBotAvatar(base: string): string {
  return `/${base}-${Math.random() < 0.5 ? 1 : 2}.png`;
}

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I, O (ambiguous)
const ROOM_CODE_LENGTH = 4;
const RECONNECT_TIMEOUT_MS = 120_000; // 2 minutes
const ROOM_CLEANUP_INTERVAL_MS = 60_000; // check every minute
const ROOM_INACTIVE_TIMEOUT_MS = 30 * 60_000; // 30 minutes

export class RoomManager {
  private rooms = new Map<string, Room>();
  private socketToRoom = new Map<string, { roomCode: string; position: PlayerPosition }>();
  private sessionToRoom = new Map<string, { roomCode: string; position: PlayerPosition; userId?: number }>();
  onRoomDeleted?: (roomCode: string) => void;
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor() {
    this.cleanupInterval = setInterval(() => this.cleanup(), ROOM_CLEANUP_INTERVAL_MS);
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
  }

  createRoom(socketId: string, nickname: string, targetScore: number = 1000, userId?: number, difficulty: BotDifficulty = 'medium', avatar?: string): { roomCode: string; sessionId: string } | { error: string } {
    const nickErr = this.validateNickname(nickname);
    if (nickErr) return { error: nickErr };
    if (targetScore < 250) targetScore = 250;
    if (targetScore > 10000) targetScore = 10000;
    const code = this.generateCode();
    const room: Room = {
      code,
      players: new Map(),
      engine: null,
      targetScore,
      botPositions: new Set(),
      botDifficulty: difficulty,
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };
    this.rooms.set(code, room);

    const sessionId = randomUUID();
    const player: RoomPlayer = {
      socketId,
      nickname,
      position: 0,
      connected: true,
      sessionId,
      userId,
      avatar,
    };
    room.players.set(0, player);
    this.socketToRoom.set(socketId, { roomCode: code, position: 0 });
    this.sessionToRoom.set(sessionId, { roomCode: code, position: 0, userId });

    return { roomCode: code, sessionId };
  }

  createSoloRoom(
    socketId: string,
    nickname: string,
    targetScore: number = 1000,
    difficulty: BotDifficulty = 'medium',
    userId?: number,
    avatar?: string
  ): { roomCode: string; sessionId: string } | { error: string } {
    const nickErr = this.validateNickname(nickname);
    if (nickErr) return { error: nickErr };
    if (targetScore < 250) targetScore = 250;
    if (targetScore > 10000) targetScore = 10000;
    const code = this.generateCode();

    const botPositions = new Set<PlayerPosition>([1, 2, 3] as PlayerPosition[]);
    const room: Room = {
      code,
      players: new Map(),
      engine: null,
      targetScore,
      botPositions,
      botDifficulty: difficulty,
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };
    this.rooms.set(code, room);

    const sessionId = randomUUID();
    const player: RoomPlayer = {
      socketId,
      nickname,
      position: 0,
      connected: true,
      sessionId,
      userId,
      avatar,
    };
    room.players.set(0, player);
    this.socketToRoom.set(socketId, { roomCode: code, position: 0 });
    this.sessionToRoom.set(sessionId, { roomCode: code, position: 0, userId });

    // Bots at positions 1, 2, 3
    for (let i = 0; i < 3; i++) {
      const pos = (i + 1) as PlayerPosition;
      const profile = BOT_PROFILES[i];
      const bot: RoomPlayer = {
        socketId: `bot-${code}-${pos}`,
        nickname: profile.name,
        position: pos,
        connected: true,
        avatar: randomBotAvatar(profile.avatarBase),
      };
      room.players.set(pos, bot);
    }

    return { roomCode: code, sessionId };
  }

  joinRoom(
    socketId: string,
    roomCode: string,
    nickname: string,
    userId?: number,
    avatar?: string
  ): { success: true; position: PlayerPosition; sessionId: string } | { error: string } {
    const nickErr = this.validateNickname(nickname);
    if (nickErr) return { error: nickErr };
    const code = roomCode.toUpperCase();
    const room = this.rooms.get(code);
    if (!room) return { error: 'Room not found' };

    // Check if this nickname is reconnecting
    for (const [pos, player] of room.players) {
      if (player.nickname === nickname && !player.connected) {
        // Reconnect — reuse existing session or create new one
        player.socketId = socketId;
        player.connected = true;
        if (avatar !== undefined) player.avatar = avatar;
        delete player.disconnectedAt;
        if (!player.sessionId) {
          player.sessionId = randomUUID();
          this.sessionToRoom.set(player.sessionId, { roomCode: code, position: pos, userId: player.userId });
        }
        this.socketToRoom.set(socketId, { roomCode: code, position: pos });
        room.lastActivity = Date.now();
        return { success: true, position: pos, sessionId: player.sessionId };
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

    const sessionId = randomUUID();
    const player: RoomPlayer = {
      socketId,
      nickname,
      position: openPos,
      connected: true,
      sessionId,
      userId,
      avatar,
    };
    room.players.set(openPos, player);
    this.socketToRoom.set(socketId, { roomCode: code, position: openPos });
    this.sessionToRoom.set(sessionId, { roomCode: code, position: openPos, userId });
    room.lastActivity = Date.now();

    return { success: true, position: openPos, sessionId };
  }

  /** Reconnect a player using their session token. */
  reconnectBySession(
    socketId: string,
    sessionId: string,
    userId?: number
  ): { success: true; roomCode: string; position: PlayerPosition; nickname: string } | { error: string } {
    const info = this.sessionToRoom.get(sessionId);
    if (!info) return { error: 'Session expired' };

    // If session is bound to a user, verify the reconnecting user matches
    if (info.userId && userId && info.userId !== userId) {
      return { error: 'Session invalid' };
    }

    const room = this.rooms.get(info.roomCode);
    if (!room) {
      this.sessionToRoom.delete(sessionId);
      return { error: 'Room no longer exists' };
    }

    const player = room.players.get(info.position);
    if (!player || player.sessionId !== sessionId) {
      this.sessionToRoom.delete(sessionId);
      return { error: 'Session invalid' };
    }

    // If player was replaced by a bot, reclaim their seat
    if (room.botPositions.has(info.position)) {
      const botPlayer = room.players.get(info.position);
      const original = botPlayer?.replacedPlayer;
      if (!original || original.sessionId !== sessionId) {
        this.sessionToRoom.delete(sessionId);
        return { error: 'Session invalid' };
      }

      // If the bot already finished (isOut), let the player reconnect as observer
      // but keep bot designation until next round
      const posIsOut = room.engine?.state.players[info.position]?.isOut;
      if (posIsOut) {
        // Reconnect as observer — update socket mapping but keep bot active
        this.socketToRoom.set(socketId, { roomCode: info.roomCode, position: info.position });
        room.lastActivity = Date.now();
        return { success: true, roomCode: info.roomCode, position: info.position, nickname: original.nickname };
      }

      // Restore the original player, kicking the bot
      room.botPositions.delete(info.position);
      room.players.set(info.position, {
        socketId,
        nickname: original.nickname,
        position: info.position,
        connected: true,
        sessionId,
        userId: original.userId,
      });
      this.socketToRoom.set(socketId, { roomCode: info.roomCode, position: info.position });

      // Restore nickname in engine
      if (room.engine) {
        room.engine.state.players[info.position].nickname = original.nickname;
      }

      room.lastActivity = Date.now();
      return { success: true, roomCode: info.roomCode, position: info.position, nickname: original.nickname };
    }

    // Clean up old socket mapping if it still exists
    if (player.socketId) {
      this.socketToRoom.delete(player.socketId);
    }
    player.socketId = socketId;
    player.connected = true;
    delete player.disconnectedAt;
    this.socketToRoom.set(socketId, { roomCode: info.roomCode, position: info.position });
    room.lastActivity = Date.now();

    return { success: true, roomCode: info.roomCode, position: info.position, nickname: player.nickname };
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
    if (room.players.size < 2) return { error: 'Need at least 2 players' };

    // Fill empty seats with hard bots
    let botIndex = 0;
    for (const pos of [0, 1, 2, 3] as PlayerPosition[]) {
      if (!room.players.has(pos)) {
        const profile = BOT_PROFILES[botIndex];
        const bot: RoomPlayer = {
          socketId: `bot-${room.code}-${pos}`,
          nickname: profile.name,
          position: pos,
          connected: true,
          avatar: randomBotAvatar(profile.avatarBase),
        };
        room.players.set(pos, bot);
        room.botPositions.add(pos);
        botIndex++;
      }
    }
    // botDifficulty is already set by createRoom / createSoloRoom.
    // Only default to 'hard' for matchmaking rooms that have no difficulty set.
    if (botIndex > 0 && !room.botDifficulty) {
      room.botDifficulty = 'hard';
    }

    const nicknames: [string, string, string, string] = [
      room.players.get(0)!.nickname,
      room.players.get(1)!.nickname,
      room.players.get(2)!.nickname,
      room.players.get(3)!.nickname,
    ];

    room.engine = new GameEngine(nicknames, room.targetScore);
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

    // If no game is in progress, remove the player and clean up their session
    if (!room.engine) {
      if (player.sessionId) this.sessionToRoom.delete(player.sessionId);
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
    if (info) {
      const room = this.rooms.get(info.roomCode);
      if (room) return { room, position: info.position };
    }

    // Fallback: scan rooms for this socketId (handles race after reconnect)
    for (const [, room] of this.rooms) {
      for (const [pos, player] of room.players) {
        if (player.socketId === socketId && player.connected) {
          // Rebuild the missing mapping
          this.socketToRoom.set(socketId, { roomCode: room.code, position: pos });
          return { room, position: pos };
        }
      }
    }

    return null;
  }

  getActiveGames(): Array<{
    roomCode: string;
    players: Array<{ nickname: string; position: number; isBot: boolean }>;
    scores: [number, number];
    targetScore: number;
    phase: string;
    round: number;
    botDifficulty: string;
    startedAt: number;
  }> {
    const result: ReturnType<RoomManager['getActiveGames']> = [];
    for (const [, room] of this.rooms) {
      if (!room.engine) continue;
      if (room.engine.state.phase === GamePhase.GAME_OVER || room.engine.state.phase === GamePhase.WAITING) continue;
      const players = [...room.players.values()].map((p) => ({
        nickname: p.nickname,
        position: p.position,
        isBot: room.botPositions.has(p.position),
      }));
      result.push({
        roomCode: room.code,
        players,
        scores: room.engine.state.scores,
        targetScore: room.targetScore,
        phase: room.engine.state.phase,
        round: room.engine.getRoundHistory().length + 1,
        botDifficulty: room.botDifficulty,
        startedAt: room.createdAt,
      });
    }
    return result;
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
        avatar: p.avatar,
      })),
      isStartable: room.players.size >= 2 && !room.engine,
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

  replacePlayerWithBot(roomCode: string, position: PlayerPosition): boolean {
    const room = this.rooms.get(roomCode);
    if (!room || !room.engine) return false;

    const player = room.players.get(position);
    if (!player || player.connected) return false; // already reconnected
    if (room.botPositions.has(position)) return false; // already a bot

    // Pick a bot profile not already in use
    const usedNames = new Set(
      [...room.players.values()].filter((p) => room.botPositions.has(p.position)).map((p) => p.nickname)
    );
    const available = BOT_PROFILES.filter((bp) => !usedNames.has(bp.name));
    const profile = available[0] ?? BOT_PROFILES[0];

    // Keep session mapping so player can reclaim their seat
    const originalNickname = player.nickname;
    const originalSessionId = player.sessionId;
    const originalUserId = player.userId;

    // Replace the player with a bot
    room.players.set(position, {
      socketId: `bot-${room.code}-${position}`,
      nickname: profile.name,
      position,
      connected: true,
      avatar: randomBotAvatar(profile.avatarBase),
      // Store original player info for reclaim
      replacedPlayer: { nickname: originalNickname, sessionId: originalSessionId, userId: originalUserId },
    });

    room.botPositions.add(position);

    // Update the engine's player nickname
    room.engine.state.players[position].nickname = profile.name;

    return true;
  }

  private validateNickname(nickname: string): string | null {
    if (!nickname || typeof nickname !== 'string') return 'Invalid nickname';
    const trimmed = nickname.trim();
    if (trimmed.length < 1 || trimmed.length > 20) return 'Nickname must be 1-20 characters';
    if (!/^[\w\s\-\u00C0-\u024F]+$/u.test(trimmed)) return 'Nickname contains invalid characters';
    // Warning flag for potentially offensive content (returned as part of success, not blocking)
    return null;
  }

  /** Check if nickname contains potentially offensive content. Returns warning message or null. */
  checkNicknameWarning(nickname: string): string | null {
    const lower = nickname.toLowerCase().replace(/[^a-z]/g, '');
    const patterns = ['nigger', 'nigga', 'faggot', 'retard', 'kike', 'spic', 'chink', 'wetback', 'tranny'];
    if (patterns.some(p => lower.includes(p))) {
      return 'Your nickname may be offensive to other players';
    }
    return null;
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

  /** Serialize all active rooms with in-progress games for persistence. */
  serializeRooms(): Array<{
    code: string;
    targetScore: number;
    botPositions: PlayerPosition[];
    botDifficulty: BotDifficulty;
    players: Array<{
      position: PlayerPosition;
      nickname: string;
      avatar?: string;
      sessionId?: string;
      userId?: number;
      isBot: boolean;
      replacedPlayer?: { nickname: string; sessionId?: string; userId?: number };
    }>;
    engineState: string;
  }> {
    const result: Array<{
      code: string;
      targetScore: number;
      botPositions: PlayerPosition[];
      botDifficulty: BotDifficulty;
      players: Array<{
        position: PlayerPosition;
        nickname: string;
        avatar?: string;
        sessionId?: string;
        isBot: boolean;
        replacedPlayer?: { nickname: string; sessionId?: string; userId?: number };
      }>;
      engineState: string;
    }> = [];

    for (const [, room] of this.rooms) {
      if (!room.engine) continue; // Only persist rooms with active games

      const players = [...room.players.values()].map((p) => ({
        position: p.position,
        nickname: p.nickname,
        avatar: p.avatar,
        sessionId: p.sessionId,
        userId: p.userId,
        isBot: room.botPositions.has(p.position),
        replacedPlayer: p.replacedPlayer,
      }));

      result.push({
        code: room.code,
        targetScore: room.targetScore,
        botPositions: [...room.botPositions],
        botDifficulty: room.botDifficulty,
        players,
        engineState: room.engine.serialize(),
      });
    }

    return result;
  }

  /** Restore rooms from serialized data (called on server startup). */
  restoreRooms(data: ReturnType<RoomManager['serializeRooms']>): number {
    let restored = 0;
    for (const entry of data) {
      if (this.rooms.has(entry.code)) continue; // Don't overwrite existing

      const engine = GameEngine.restore(entry.engineState);
      const botPositions = new Set<PlayerPosition>(entry.botPositions);
      const room: Room = {
        code: entry.code,
        players: new Map(),
        engine,
        targetScore: entry.targetScore,
        botPositions,
        botDifficulty: entry.botDifficulty,
        createdAt: Date.now(),
        lastActivity: Date.now(),
      };

      for (const p of entry.players) {
        const rp: RoomPlayer = {
          socketId: p.isBot ? `bot-${entry.code}-${p.position}` : '',
          nickname: p.nickname,
          position: p.position,
          connected: p.isBot, // Bots are always connected; humans need to reconnect
          avatar: p.avatar,
          sessionId: p.sessionId,
          userId: p.userId,
          replacedPlayer: p.replacedPlayer,
        };
        if (!p.isBot) {
          rp.disconnectedAt = Date.now(); // Mark humans as disconnected until they reconnect
        }
        room.players.set(p.position, rp);

        // Rebuild session index
        if (p.sessionId && !p.isBot) {
          this.sessionToRoom.set(p.sessionId, { roomCode: entry.code, position: p.position, userId: rp.userId });
        }
        // Rebuild session index for bot-replaced players so they can reclaim
        if (p.isBot && p.replacedPlayer?.sessionId) {
          this.sessionToRoom.set(p.replacedPlayer.sessionId, { roomCode: entry.code, position: p.position, userId: p.replacedPlayer.userId });
        }
      }

      this.rooms.set(entry.code, room);
      restored++;
    }
    return restored;
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

      // Clean up inactive rooms — also clean up sessions and timers
      if (now - room.lastActivity > ROOM_INACTIVE_TIMEOUT_MS) {
        for (const [, player] of room.players) {
          if (player.sessionId) this.sessionToRoom.delete(player.sessionId);
        }
        this.onRoomDeleted?.(code);
        this.rooms.delete(code);
      }
    }
  }
}
