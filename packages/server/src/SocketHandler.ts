import type { Server, Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  PlayerPosition,
  GameEvent,
} from '@cyprus/shared';
import { GamePhase, findPlayableFromHand } from '@cyprus/shared';
import { RoomManager } from './RoomManager.js';
import type { GameEngine } from './GameEngine.js';
import type { BotDifficulty } from './BotAI.js';
import type { TrackerDB } from './Database.js';
import type { GameMonitor } from './GameMonitor.js';
import { MatchmakingManager } from './MatchmakingManager.js';
import { TimerManager } from './TimerManager.js';
import { GamePersistence } from './GamePersistence.js';
import { BotController } from './BotController.js';
import { BotAI } from './BotAI.js';
import type { TichuCall, Card } from '@cyprus/shared';

type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;
type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

/** Simple in-memory rate limiter per socket */
class RateLimiter {
  private buckets = new Map<string, { count: number; resetAt: number }>();

  isAllowed(key: string, maxPerWindow: number, windowMs: number): boolean {
    const now = Date.now();
    const bucket = this.buckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    bucket.count++;
    return bucket.count <= maxPerWindow;
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, bucket] of this.buckets) {
      if (now > bucket.resetAt) this.buckets.delete(key);
    }
  }
}

// Track active game IDs per room for DB logging
const roomGameIds = new Map<string, number>();

// Track online user IDs (userId → Set of socketIds for multi-tab support)
const onlineUsers = new Map<number, Set<string>>();

export function isUserOnline(userId: number): boolean {
  const sockets = onlineUsers.get(userId);
  return !!sockets && sockets.size > 0;
}

export class SocketHandler {
  private socketToSession = new Map<string, string>();
  private spectators = new Map<string, string>(); // socketId -> roomCode
  private rateLimiter = new RateLimiter();
  private rateLimitCleanup: ReturnType<typeof setInterval>;
  private matchmaking: MatchmakingManager;
  private timers: TimerManager;
  private persistence: GamePersistence;
  private bots: BotController;

  constructor(
    private io: TypedServer,
    private rooms: RoomManager,
    private db?: TrackerDB,
    private monitor?: GameMonitor,
  ) {
    this.rateLimitCleanup = setInterval(() => this.rateLimiter.cleanup(), 60_000);

    // Wire up extracted modules with callbacks
    const emitToRoom = (roomCode: string, event: string, ...args: unknown[]) => {
      (this.io.to(roomCode).emit as Function)(event, ...args);
    };
    const broadcastGameState = (roomCode: string) => this.broadcastGameState(roomCode);

    this.timers = new TimerManager(rooms, emitToRoom, broadcastGameState, monitor);
    this.persistence = new GamePersistence(rooms);
    this.bots = new BotController(rooms, emitToRoom, broadcastGameState, db, (rc) => roomGameIds.get(rc) ?? null, monitor);

    // Clean up timers when rooms are deleted
    rooms.onRoomDeleted = (code) => this.timers.clearAllTimersForRoom(code);

    this.matchmaking = new MatchmakingManager(io, rooms, (roomCode, socketIds) => {
      this.onMatchCreated(roomCode, socketIds);
    });
  }

  destroy(): void {
    clearInterval(this.rateLimitCleanup);
    this.matchmaking.destroy();
    this.timers.destroy();
    this.persistence.destroy();
    roomGameIds.clear();
  }

  private getClientIP(socket: TypedSocket): string | null {
    return (socket.handshake.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || socket.handshake.address
      || null;
  }

  private checkRate(socket: TypedSocket, action: string, limit: number = 20, windowMs: number = 5000): boolean {
    if (!this.rateLimiter.isAllowed(`${socket.id}:${action}`, limit, windowMs)) {
      socket.emit('game:error', 'Too many requests, slow down');
      return false;
    }
    return true;
  }

  // ─── Socket Event Registration ──────────────────────────────────────

  setup(): void {
    this.io.on('connection', (socket) => {
      const ip = this.getClientIP(socket);
      const ua = socket.handshake.headers['user-agent'] || null;

      if (ip && !this.rateLimiter.isAllowed(`conn:${ip}`, 40, 60_000)) {
        console.log(`[connection] RATE LIMITED ip=${ip}`);
        socket.emit('game:error', 'Too many connections, please wait a moment');
        socket.disconnect(true);
        return;
      }

      // Track online presence for authenticated users
      const userId = socket.data.userId as number | undefined;
      const displayName = socket.data.displayName as string | undefined;
      this.db?.logConnection(socket.id, ip, ua, userId);
      if (userId) {
        if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
        onlineUsers.get(userId)!.add(socket.id);
        // Set nickname from auth for connection tracking
        if (displayName) this.db?.updateConnectionNickname(socket.id, displayName, null);
      }

      this.registerRoomEvents(socket, ip);
      this.registerMatchmakingEvents(socket, ip);
      this.registerGameEvents(socket);
      this.registerSessionEvents(socket, ip);
      this.registerSpectate(socket);
      this.registerDisconnect(socket, ip);
    });
  }

  private registerRoomEvents(socket: TypedSocket, ip: string | null): void {
    socket.on('room:create', (nickname, targetScore, difficulty, callback) => {
      if (!this.checkRate(socket, 'create', 5, 30_000)) return;
      const userId = socket.data.userId as number | undefined;
      const validDiffs: BotDifficulty[] = ['easy', 'medium', 'hard', 'extreme', 'unfair'];
      const diff: BotDifficulty = validDiffs.includes(difficulty as BotDifficulty) ? (difficulty as BotDifficulty) : 'medium';
      const nickWarning = this.rooms.checkNicknameWarning(nickname);
      const result = this.rooms.createRoom(socket.id, nickname, targetScore, userId, diff);
      if ('error' in result) { callback({ error: result.error }); return; }
      socket.join(result.roomCode);
      this.socketToSession.set(socket.id, result.sessionId);
      callback({ roomCode: result.roomCode, sessionId: result.sessionId });
      if (nickWarning) socket.emit('game:error', nickWarning);
      this.db?.updateConnectionNickname(socket.id, nickname, result.roomCode);
      this.db?.getOrCreatePlayer(nickname, ip);
      this.monitor?.gameCreated(result.roomCode, targetScore, false, diff, userId);
      this.monitor?.playerJoined(result.roomCode, nickname, userId);
      this.broadcastRoomState(result.roomCode);
    });

    socket.on('room:create_solo', (nickname, targetScore, difficulty, callback) => {
      if (!this.checkRate(socket, 'create', 5, 30_000)) return;
      const validDifficulties: BotDifficulty[] = ['easy', 'medium', 'hard', 'extreme', 'unfair'];
      const diff: BotDifficulty = validDifficulties.includes(difficulty as BotDifficulty) ? (difficulty as BotDifficulty) : 'medium';
      const userId = socket.data.userId as number | undefined;
      const nickWarning = this.rooms.checkNicknameWarning(nickname);
      const result = this.rooms.createSoloRoom(socket.id, nickname, targetScore, diff, userId);
      if ('error' in result) { callback({ error: result.error }); return; }
      socket.join(result.roomCode);
      this.socketToSession.set(socket.id, result.sessionId);
      callback({ roomCode: result.roomCode, sessionId: result.sessionId });
      if (nickWarning) socket.emit('game:error', nickWarning);
      this.db?.updateConnectionNickname(socket.id, nickname, result.roomCode);
      const playerId = this.db?.getOrCreatePlayer(nickname, ip);
      this.monitor?.gameCreated(result.roomCode, targetScore, true, diff, userId);
      this.monitor?.playerJoined(result.roomCode, nickname, userId);

      const startResult = this.rooms.startGame(socket.id);
      if (startResult.error) { socket.emit('game:error', startResult.error); return; }

      this.logGameStart(result.roomCode, targetScore, true, diff, ip);
      if (playerId) this.db?.incrementPlayerGames(playerId);
      this.monitor?.gameStarted(result.roomCode, 1, 3);
      this.broadcastGameState(result.roomCode);
    });

    socket.on('room:join', (roomCode, nickname, callback) => {
      if (!this.checkRate(socket, 'join', 10, 30_000)) return;
      const userId = socket.data.userId as number | undefined;
      const nickWarning = this.rooms.checkNicknameWarning(nickname);
      const result = this.rooms.joinRoom(socket.id, roomCode, nickname, userId);
      if ('error' in result) { callback({ error: result.error }); return; }
      socket.join(roomCode.toUpperCase());
      this.socketToSession.set(socket.id, result.sessionId);
      callback({ success: true, sessionId: result.sessionId });
      if (nickWarning) socket.emit('game:error', nickWarning);
      this.db?.updateConnectionNickname(socket.id, nickname, roomCode.toUpperCase());
      this.db?.getOrCreatePlayer(nickname, ip);
      this.monitor?.playerJoined(roomCode.toUpperCase(), nickname, userId);

      const info = this.rooms.getRoomForSocket(socket.id);
      if (info && info.room.engine) {
        this.timers.cancelDisconnectTimer(info.room.code, info.position);
        socket.to(info.room.code).emit('room:player_reconnected', nickname);
        this.broadcastGameState(info.room.code);
      } else {
        this.broadcastRoomState(roomCode.toUpperCase());
      }
    });

    socket.on('room:sit', (position) => {
      if (!this.checkRate(socket, 'sit')) return;
      const success = this.rooms.sitAt(socket.id, position);
      if (success) {
        const info = this.rooms.getRoomForSocket(socket.id);
        if (info) this.broadcastRoomState(info.room.code);
      }
    });

    socket.on('room:start', () => {
      if (!this.checkRate(socket, 'start', 5, 30_000)) return;
      const result = this.rooms.startGame(socket.id);
      if (result.error) { socket.emit('game:error', result.error); return; }
      const info = this.rooms.getRoomForSocket(socket.id);
      if (info) {
        this.logGameStart(info.room.code, info.room.targetScore, false, null, ip);
        for (const [pos, player] of info.room.players) {
          if (!info.room.botPositions.has(pos)) {
            const pid = this.db?.getOrCreatePlayer(player.nickname, null);
            if (pid) this.db?.incrementPlayerGames(pid);
          }
        }
        const playerCount = [...info.room.players.keys()].filter(p => !info.room.botPositions.has(p)).length;
        this.monitor?.gameStarted(info.room.code, playerCount, info.room.botPositions.size);
        this.broadcastGameState(info.room.code);
      }
    });
  }

  private registerMatchmakingEvents(socket: TypedSocket, ip: string | null): void {
    socket.on('matchmaking:join', (nickname, targetScore, callback) => {
      if (!this.checkRate(socket, 'matchmaking', 5, 30_000)) return;
      const userId = socket.data.userId as number | undefined;
      const result = this.matchmaking.enqueue(socket.id, nickname, targetScore, userId);
      if ('error' in result) { callback({ error: result.error }); return; }
      this.db?.updateConnectionNickname(socket.id, nickname, null);
      this.db?.getOrCreatePlayer(nickname, ip);
      callback({ success: true });
    });

    socket.on('matchmaking:leave', (callback) => {
      const result = this.matchmaking.dequeue(socket.id);
      if ('error' in result) { callback({ error: result.error }); return; }
      callback({ success: true });
    });
  }

  private registerGameEvents(socket: TypedSocket): void {
    const rejectSpectator = () => {
      if (this.spectators.has(socket.id)) {
        socket.emit('game:error', 'Spectators cannot perform game actions');
        return true;
      }
      return false;
    };

    socket.on('game:grand_tichu_decision', (call) => {
      if (rejectSpectator()) return;
      if (!this.checkRate(socket, 'action')) return;
      this.handleGameAction(socket, (engine, position) => engine.grandTichuDecision(position, call));
    });
    socket.on('game:pass_cards', (cards) => {
      if (rejectSpectator()) return;
      if (!this.checkRate(socket, 'action')) return;
      this.handleGameAction(socket, (engine, position) => engine.passCards(position, cards));
    });
    socket.on('game:undo_pass', () => {
      if (rejectSpectator()) return;
      if (!this.checkRate(socket, 'action')) return;
      this.handleGameAction(socket, (engine, position) => engine.undoPassCards(position));
    });
    socket.on('game:play', (cardIds) => {
      if (rejectSpectator()) return;
      if (!this.checkRate(socket, 'action')) return;
      this.handleGameAction(socket, (engine, position) => engine.playCards(position, cardIds));
    });
    socket.on('game:pass_turn', () => {
      if (rejectSpectator()) return;
      if (!this.checkRate(socket, 'action')) return;
      this.handleGameAction(socket, (engine, position) => engine.passTurn(position));
    });
    socket.on('game:call_tichu', () => {
      if (rejectSpectator()) return;
      if (!this.checkRate(socket, 'action')) return;
      this.handleGameAction(socket, (engine, position) => engine.callTichu(position));
    });
    socket.on('game:dragon_give', (opponentPosition) => {
      if (rejectSpectator()) return;
      if (!this.checkRate(socket, 'action')) return;
      this.handleGameAction(socket, (engine, position) => engine.dragonGive(position, opponentPosition));
    });
    socket.on('game:wish', (rank) => {
      if (rejectSpectator()) return;
      if (!this.checkRate(socket, 'action')) return;
      this.handleGameAction(socket, (engine, position) => engine.setWish(position, rank));
    });
    socket.on('game:next_round', () => {
      if (rejectSpectator()) return;
      if (!this.checkRate(socket, 'action')) return;
      this.handleGameAction(socket, (engine) => engine.nextRound());
    });
    socket.on('game:skip_round', () => {
      if (!this.checkRate(socket, 'action')) return;
      this.handleSkipRound(socket);
    });
    socket.on('game:resync', () => {
      if (!this.checkRate(socket, 'action')) return;
      this.handleResync(socket);
    });
  }

  private registerSessionEvents(socket: TypedSocket, ip: string | null): void {
    socket.on('session:reconnect', (sessionId, callback) => {
      const reconnectKey = ip ? `reconnect:${ip}` : `reconnect:${socket.id}`;
      if (!this.rateLimiter.isAllowed(reconnectKey, 10, 30_000)) {
        console.log(`[reconnect] RATE LIMITED socket=${socket.id} ip=${ip}`);
        callback({ error: 'Too many reconnect attempts, try again shortly' });
        return;
      }
      if (typeof sessionId !== 'string' || sessionId.length !== 36) {
        console.log(`[reconnect] INVALID SESSION FORMAT socket=${socket.id}`);
        this.monitor?.reconnectFailed('Invalid session format', sessionId?.slice(0, 8) ?? '');
        callback({ error: 'Invalid session' });
        return;
      }
      const result = this.rooms.reconnectBySession(socket.id, sessionId, socket.data.userId as number | undefined);
      if ('error' in result) {
        console.log(`[reconnect] FAILED socket=${socket.id} reason="${result.error}" sessionId=${sessionId.slice(0, 8)}...`);
        this.monitor?.reconnectFailed(result.error, sessionId.slice(0, 8));
        callback({ error: result.error });
        return;
      }
      const room = this.rooms.getRoom(result.roomCode);
      const hasGame = !!(room?.engine);
      console.log(`[reconnect] OK socket=${socket.id} room=${result.roomCode} player=${result.nickname} hasGame=${hasGame}`);
      this.socketToSession.set(socket.id, sessionId);
      socket.join(result.roomCode);
      callback({ success: true, roomCode: result.roomCode, nickname: result.nickname, hasGame });

      this.timers.cancelDisconnectTimer(result.roomCode, result.position);
      socket.to(result.roomCode).emit('room:player_reconnected', result.nickname);
      this.monitor?.playerReconnected(result.roomCode, result.nickname, socket.data.userId as number | undefined);

      if (hasGame) {
        this.broadcastGameState(result.roomCode);
      } else {
        this.broadcastRoomState(result.roomCode);
      }
    });
  }

  private registerSpectate(socket: TypedSocket): void {
    socket.on('room:spectate', (roomCode, callback) => {
      if (!this.checkRate(socket, 'spectate', 5, 30_000)) return;
      const code = roomCode?.trim()?.toUpperCase();
      if (!code) { callback({ error: 'Enter a room code' }); return; }

      const room = this.rooms.getRoom(code);
      if (!room || !room.engine) { callback({ error: 'Game not found' }); return; }

      socket.join(code);
      this.spectators.set(socket.id, code);
      callback({ success: true, roomCode: code });

      // Send spectator state immediately
      const avatars = new Map<PlayerPosition, string>();
      const disconnected = new Set<PlayerPosition>();
      for (const [pos, player] of room.players) {
        if (player.avatar) avatars.set(pos, player.avatar);
        if (!player.connected) disconnected.add(pos);
      }
      const state = room.engine.getSpectatorState(code, avatars, disconnected);
      state.turnDeadline = this.timers.getTurnDeadline(code);
      socket.emit('game:state', state);
    });
  }

  private registerDisconnect(socket: TypedSocket, _ip: string | null): void {
    socket.on('disconnect', () => {
      this.db?.logDisconnection(socket.id);
      this.socketToSession.delete(socket.id);
      this.spectators.delete(socket.id);
      this.matchmaking.handleDisconnect(socket.id);

      // Clean up online presence
      const disconnectedUserId = socket.data.userId as number | undefined;
      if (disconnectedUserId) {
        const sockets = onlineUsers.get(disconnectedUserId);
        if (sockets) {
          sockets.delete(socket.id);
          if (sockets.size === 0) onlineUsers.delete(disconnectedUserId);
        }
      }

      const info = this.rooms.getRoomForSocket(socket.id);
      const result = this.rooms.handleDisconnect(socket.id);
      if (result) {
        this.io.to(result.roomCode).emit('room:player_disconnected', result.nickname);
        this.monitor?.playerDisconnected(result.roomCode, result.nickname, disconnectedUserId);
        this.broadcastRoomState(result.roomCode);

        const room = this.rooms.getRoom(result.roomCode);
        if (room?.engine && info) {
          this.broadcastGameState(result.roomCode);
          this.timers.scheduleDisconnectReplace(result.roomCode, info.position, result.nickname);
        }
      }
    });
  }

  // ─── Game Action Processing ─────────────────────────────────────────

  private logGameStart(roomCode: string, targetScore: number, isSolo: boolean, botDifficulty: string | null, ip: string | null): void {
    if (!this.db) return;
    const room = this.rooms.getRoom(roomCode);
    if (!room) return;
    const players: Array<{ nickname: string; position: number; isBot: boolean; ip: string | null; userId?: number }> = [];
    for (const [pos, player] of room.players) {
      players.push({ nickname: player.nickname, position: pos, isBot: room.botPositions.has(pos), ip: room.botPositions.has(pos) ? null : ip, userId: player.userId });
    }
    const gameId = this.db.logGameStart(roomCode, targetScore, isSolo, botDifficulty, players);
    roomGameIds.set(roomCode, gameId);
  }

  private onMatchCreated(roomCode: string, socketIds: string[]): void {
    const room = this.rooms.getRoom(roomCode);
    if (!room) return;

    for (const sid of socketIds) {
      const sock = this.io.sockets.sockets.get(sid);
      if (sock) {
        sock.join(roomCode);
        for (const [, player] of room.players) {
          if (player.socketId === sid && player.sessionId) {
            this.socketToSession.set(sid, player.sessionId);
            break;
          }
        }
      }
    }

    this.logGameStart(roomCode, room.targetScore, false, 'hard', null);
    for (const [pos, player] of room.players) {
      if (!room.botPositions.has(pos)) {
        const pid = this.db?.getOrCreatePlayer(player.nickname, null);
        if (pid) this.db?.incrementPlayerGames(pid);
      }
    }
    const playerCount = [...room.players.keys()].filter(p => !room.botPositions.has(p)).length;
    this.monitor?.gameStarted(roomCode, playerCount, room.botPositions.size);
    this.broadcastGameState(roomCode);
  }

  private handleGameAction(
    socket: TypedSocket,
    action: (engine: GameEngine, position: PlayerPosition) => GameEvent[]
  ): void {
    let info = this.rooms.getRoomForSocket(socket.id);

    // Session-based fallback recovery
    if (!info) {
      const sessionId = this.socketToSession.get(socket.id);
      if (sessionId) {
        const result = this.rooms.reconnectBySession(socket.id, sessionId, socket.data.userId as number | undefined);
        if (!('error' in result)) {
          socket.join(result.roomCode);
          info = this.rooms.getRoomForSocket(socket.id);
        }
      }
    }

    if (!info || !info.room.engine) {
      socket.emit('game:error', 'No active game');
      return;
    }

    try {
      const events = action(info.room.engine, info.position);
      const gameId = roomGameIds.get(info.room.code) || null;

      for (const event of events) {
        this.db?.logGameEvent(gameId, info.room.code, event.type, event.playerPosition ?? null, event.data);
        this.io.to(info.room.code).emit('game:event', event);

        if (event.type === 'GAME_OVER' && gameId) {
          this.handleGameOver(info.room.code, gameId, info);
        }
      }

      this.broadcastGameState(info.room.code);
    } catch (err) {
      socket.emit('game:error', (err as Error).message);
    }
  }

  private handleSkipRound(socket: TypedSocket): void {
    const info = this.rooms.getRoomForSocket(socket.id);
    if (!info || !info.room.engine) {
      socket.emit('game:error', 'No active game');
      return;
    }

    const room = info.room;
    const engine = room.engine!;

    // Only allow in solo games
    if (room.botPositions.size !== 3) {
      socket.emit('game:error', 'Skip only available in solo games');
      return;
    }

    // Human must be out
    if (!engine.state.players[info.position].isOut) {
      socket.emit('game:error', 'You must be out to skip');
      return;
    }

    // Must be in playing phase
    if (engine.state.phase !== GamePhase.PLAYING && engine.state.phase !== GamePhase.DRAGON_GIVE) {
      return;
    }

    // Cancel any pending timers for this room
    this.timers.clearTurnTimer(info.room.code);

    // Run the engine to completion instantly
    const botAI = new BotAI(room.botDifficulty);
    const allEvents: GameEvent[] = [];
    let safety = 0;

    while (
      (engine.state.phase === GamePhase.PLAYING || engine.state.phase === GamePhase.DRAGON_GIVE) &&
      safety < 500
    ) {
      safety++;

      if (engine.state.dogPending) { engine.resolveDog(); continue; }
      if (engine.state.trickWonPending) { engine.completeTrickWon(); continue; }
      if (engine.state.roundEndPending) { allEvents.push(...engine.completeRoundEnd()); continue; }

      if (engine.state.wishPending !== null) {
        const wp = engine.state.wishPending;
        const ctx = this.buildSimContext(engine);
        engine.setWish(wp, botAI.chooseWish(engine.state.players[wp].hand, ctx));
        continue;
      }

      if (engine.state.phase === GamePhase.DRAGON_GIVE) {
        const w = engine.state.dragonWinner!;
        const opps = engine.state.players
          .filter((p) => p.position % 2 !== w % 2)
          .map((p) => p.position as PlayerPosition);
        const cc = new Map(opps.map((p) => [p, engine.state.players[p].hand.length] as [PlayerPosition, number]));
        const ctx = this.buildSimContext(engine);
        allEvents.push(...engine.dragonGive(w, botAI.chooseDragonGiveTarget(opps, cc, ctx)));
        continue;
      }

      const cp = engine.state.currentPlayer;
      const player = engine.state.players[cp];
      const ctx = this.buildSimContext(engine);

      let cardIds = botAI.choosePlay(
        player.hand, engine.state.currentTrick, engine.state.wish, cp, ctx
      );

      // Wish enforcement
      if (!cardIds && engine.state.wish.active && engine.state.wish.wishedRank !== null) {
        const currentTop = engine.state.currentTrick.plays.length > 0
          ? engine.state.currentTrick.plays[engine.state.currentTrick.plays.length - 1].combination
          : null;
        const playable = findPlayableFromHand(player.hand, currentTop, engine.state.wish);
        const wishedPlay = playable.find((cards) =>
          cards.some((c) => c.type === 'normal' && c.rank === engine.state.wish.wishedRank)
        );
        if (wishedPlay) cardIds = wishedPlay.map((c) => c.id);
      }

      if (cardIds) {
        allEvents.push(...engine.playCards(cp, cardIds));
      } else {
        allEvents.push(...engine.passTurn(cp));
      }
    }

    // Log events
    const gameId = roomGameIds.get(info.room.code) || null;
    for (const event of allEvents) {
      this.db?.logGameEvent(gameId, info.room.code, event.type, event.playerPosition ?? null, event.data);
      this.io.to(info.room.code).emit('game:event', event);

      if (event.type === 'GAME_OVER' && gameId) {
        this.handleGameOver(info.room.code, gameId, info);
      }
    }

    this.broadcastGameState(info.room.code);
  }

  private handleResync(socket: TypedSocket): void {
    const info = this.rooms.getRoomForSocket(socket.id);
    if (!info || !info.room.engine) return;

    const room = info.room;
    const engine = room.engine!;
    const avatars = new Map<PlayerPosition, string>();
    const disconnected = new Set<PlayerPosition>();
    for (const [pos, player] of room.players) {
      if (player.avatar) avatars.set(pos, player.avatar);
      if (!player.connected) disconnected.add(pos);
    }

    const userIds = new Map<number, number>();
    for (const [pos, player] of room.players) {
      if (player.userId && !room.botPositions.has(pos)) {
        userIds.set(pos, player.userId);
      }
    }

    const isSolo = room.botPositions.size === 3;
    const state = engine.getClientState(info.position, room.code, room.botPositions, avatars, disconnected, isSolo);
    state.turnDeadline = this.timers.getTurnDeadline(room.code);
    state.disconnectDeadlines = this.timers.getDisconnectDeadlines(room.code);
    if (room.botPositions.size > 0) state.botDifficulty = room.botDifficulty;
    for (const p of state.players) {
      const uid = userIds.get(p.position);
      if (uid) p.userId = uid;
    }
    socket.emit('game:state', state);
  }

  private buildSimContext(engine: GameEngine): { playerCardCounts: Map<PlayerPosition, number>; tichuCalls: Record<PlayerPosition, TichuCall>; finishOrder: PlayerPosition[]; playedCards: Card[]; scores: [number, number] } {
    const played: Card[] = [];
    for (const p of engine.state.players) for (const t of p.wonTricks) played.push(...t);
    for (const play of engine.state.currentTrick.plays) played.push(...play.combination.cards);
    return {
      playerCardCounts: new Map(engine.state.players.map((p) => [p.position as PlayerPosition, p.hand.length])),
      tichuCalls: {
        0: engine.state.players[0].tichuCall,
        1: engine.state.players[1].tichuCall,
        2: engine.state.players[2].tichuCall,
        3: engine.state.players[3].tichuCall,
      } as Record<PlayerPosition, TichuCall>,
      finishOrder: engine.state.finishOrder as PlayerPosition[],
      playedCards: played,
      scores: [...engine.state.scores] as [number, number],
    };
  }

  private handleGameOver(
    roomCode: string,
    gameId: number,
    info: { room: ReturnType<RoomManager['getRoom']> extends infer R ? R & {} : never; position: PlayerPosition }
  ): void {
    const engine = info.room.engine;
    if (!engine) return;

    const s = engine.state.scores;
    const winner = s[0] > s[1] ? 'Team 0-2' : s[1] > s[0] ? 'Team 1-3' : 'Tie';
    const roundHistory = engine.getRoundHistory();
    this.monitor?.gameEnded(roomCode, winner, [s[0], s[1]], roundHistory.length);

    this.db?.transaction(() => {
      this.db?.logGameEnd(gameId, s[0], s[1], winner, roundHistory.length);

      if (winner !== 'Tie') {
        const winPositions = winner === 'Team 0-2' ? [0, 2] : [1, 3];
        for (const pos of winPositions) {
          const p = info.room.players.get(pos as PlayerPosition);
          if (p && !info.room.botPositions.has(pos as PlayerPosition)) {
            const pid = this.db?.getOrCreatePlayer(p.nickname, null);
            if (pid) this.db?.incrementPlayerWins(pid);
          }
        }
      }

      const isSolo = info.room.botPositions.size === 3;
      if (!isSolo && this.db) {
        this.updateLeaderboardStats(info.room, engine, roundHistory);
      }
    });

    // Queue game for AI review
    this.db?.queueGameForReview(gameId, roomCode);

    roomGameIds.delete(roomCode);
  }

  private updateLeaderboardStats(
    room: NonNullable<ReturnType<RoomManager['getRoom']>>,
    engine: GameEngine,
    roundHistory: ReturnType<GameEngine['getRoundHistory']>
  ): void {
    const s = engine.state.scores;
    const winTeam = s[0] > s[1] ? 0 : s[1] > s[0] ? 1 : -1;
    const finishOrder = engine.state.finishOrder;
    const allTichuResults = roundHistory.flatMap((r) => r.tichuResults);
    const allDoubleVictories = roundHistory.filter((r) => r.doubleVictory !== null);

    const playersToUpdate: Array<{ pos: number; userId: number; disconnected: boolean }> = [];
    for (const [pos, player] of room.players) {
      if (room.botPositions.has(pos) || !player.userId) continue;
      playersToUpdate.push({ pos, userId: player.userId, disconnected: false });
    }

    const dcPlayers = this.timers.disconnectedPlayers.get(room.code);
    if (dcPlayers) {
      for (const [pos, userId] of dcPlayers) {
        if (!playersToUpdate.some((p) => p.userId === userId)) {
          playersToUpdate.push({ pos, userId, disconnected: true });
        }
      }
      this.timers.disconnectedPlayers.delete(room.code);
    }

    for (const { pos, userId, disconnected } of playersToUpdate) {
      const team = pos % 2 === 0 ? 0 : 1;
      const won = winTeam === team;
      const firstOut = finishOrder[0] === pos;
      const playerTichus = allTichuResults.filter((r) => r.position === pos);

      this.db!.updateUserStats(userId, {
        won,
        firstOut,
        tichuCalls: playerTichus.filter((r) => r.call === 'tichu').length,
        tichuSuccesses: playerTichus.filter((r) => r.call === 'tichu' && r.success).length,
        grandTichuCalls: playerTichus.filter((r) => r.call === 'grand_tichu').length,
        grandTichuSuccesses: playerTichus.filter((r) => r.call === 'grand_tichu' && r.success).length,
        doubleVictory: allDoubleVictories.some((r) => r.doubleVictory === team),
        roundsPlayed: roundHistory.length,
        pointsScored: team === 0 ? s[0] : s[1],
        disconnected,
      });

      this.computeAndUpdateRating(userId);
    }

    // ELO: symmetric rule — humans + bots both count in team averages and both get rating updates.
    // Only skip if there's no decisive winner.
    if (winTeam !== -1) {
      this.applyElo(room, playersToUpdate, s[0], s[1]);
    }
  }

  private applyElo(
    room: NonNullable<ReturnType<RoomManager['getRoom']>>,
    humans: Array<{ pos: number; userId: number; disconnected: boolean }>,
    score0: number,
    score1: number
  ): void {
    if (!this.db) return;

    type HumanEntry = { kind: 'human'; pos: number; userId: number; disconnected: boolean; elo: number; elo_games: number };
    type BotEntry = { kind: 'bot'; pos: number; difficulty: string; elo: number; elo_games: number };
    type Entry = HumanEntry | BotEntry;

    const participants: Entry[] = [];
    for (const h of humans) {
      const e = this.db.getUserElo(h.userId);
      participants.push({ kind: 'human', pos: h.pos, userId: h.userId, disconnected: h.disconnected, elo: e.elo, elo_games: e.elo_games });
    }
    for (const pos of room.botPositions) {
      const e = this.db.getBotElo(room.botDifficulty);
      participants.push({ kind: 'bot', pos, difficulty: room.botDifficulty, elo: e.elo, elo_games: e.elo_games });
    }

    const team0 = participants.filter((p) => p.pos % 2 === 0);
    const team1 = participants.filter((p) => p.pos % 2 === 1);
    if (team0.length !== 2 || team1.length !== 2) return;

    const avg0 = (team0[0].elo + team0[1].elo) / 2;
    const avg1 = (team1[0].elo + team1[1].elo) / 2;
    const expected0 = 1 / (1 + Math.pow(10, (avg1 - avg0) / 400));
    const expected1 = 1 - expected0;

    // Margin-of-victory, clamped to [0,1] (Tichu scores can be negative)
    const total = Math.abs(score0) + Math.abs(score1);
    const raw0 = total === 0 ? 0.5 : 0.5 + 0.5 * (score0 - score1) / total;
    const actual0 = Math.max(0, Math.min(1, raw0));
    const actual1 = 1 - actual0;

    const kFor = (games: number) => (games < 20 ? 40 : games < 100 ? 20 : 10);
    const winTeam = score0 > score1 ? 0 : 1;

    const apply = (p: Entry, expected: number, actual: number, team: 0 | 1) => {
      let k = kFor(p.elo_games);
      if (p.kind === 'human' && p.disconnected) k = k / 2;
      const delta = k * (actual - expected);
      const newElo = Math.max(100, Math.round(p.elo + delta));
      if (p.kind === 'human') {
        this.db!.updateUserElo(p.userId, newElo);
      } else {
        this.db!.updateBotElo(p.difficulty, newElo, team === winTeam);
      }
    };

    for (const p of team0) apply(p, expected0, actual0, 0);
    for (const p of team1) apply(p, expected1, actual1, 1);
  }

  private computeAndUpdateRating(userId: number): void {
    if (!this.db) return;
    const stats = this.db.getUserLeaderboardStats(userId);
    if (!stats || stats.games_played === 0) return;

    const gp = stats.games_played;
    const winRate = stats.games_won / gp;
    const firstOutRate = stats.first_out_count / gp;
    const tichuEff = stats.tichu_calls > 0 ? stats.tichu_successes / stats.tichu_calls : 0;
    const grandEff = stats.grand_tichu_calls > 0 ? stats.grand_tichu_successes / stats.grand_tichu_calls : 0;
    const dvRate = stats.double_victories / gp;

    const rating = (winRate * 40 + firstOutRate * 20 + tichuEff * 20 + grandEff * 10 + dvRate * 10) * 10;
    this.db.updateUserRating(userId, Math.round(Math.max(0, Math.min(1000, rating))));
  }

  // ─── Broadcasting ───────────────────────────────────────────────────

  private broadcastRoomState(roomCode: string): void {
    const state = this.rooms.getRoomState(roomCode);
    if (state) this.io.to(roomCode).emit('room:state', state);
  }

  private broadcastGameState(roomCode: string): void {
    const room = this.rooms.getRoom(roomCode);
    if (!room || !room.engine) return;

    const avatars = new Map<PlayerPosition, string>();
    const disconnected = new Set<PlayerPosition>();
    for (const [pos, player] of room.players) {
      if (player.avatar) avatars.set(pos, player.avatar);
      if (!player.connected) disconnected.add(pos);
    }

    this.timers.scheduleTurnTimer(roomCode);
    const deadline = this.timers.getTurnDeadline(roomCode);
    const disconnectDeadlines = this.timers.getDisconnectDeadlines(roomCode);

    // Build userId map for friend-add buttons (exclude bots)
    const userIds = new Map<number, number>();
    for (const [pos, player] of room.players) {
      if (player.userId && !room.botPositions.has(pos)) {
        userIds.set(pos, player.userId);
      }
    }

    const sockets = this.rooms.getSocketIdsForRoom(roomCode);
    for (const [position, socketId] of sockets) {
      const isSolo = room.botPositions.size === 3;
      const state = room.engine.getClientState(position, roomCode, room.botPositions, avatars, disconnected, isSolo);
      state.turnDeadline = deadline;
      state.disconnectDeadlines = disconnectDeadlines;
      if (room.botPositions.size > 0) state.botDifficulty = room.botDifficulty;
      // Attach user IDs for friend feature
      for (const p of state.players) {
        const uid = userIds.get(p.position);
        if (uid) p.userId = uid;
      }
      this.io.to(socketId).emit('game:state', state);
    }

    // Send spectator state to all spectators in this room
    const spectatorState = room.engine.getSpectatorState(roomCode, avatars, disconnected);
    spectatorState.turnDeadline = deadline;
    if (room.botPositions.size > 0) spectatorState.botDifficulty = room.botDifficulty;
    for (const [socketId, specRoom] of this.spectators) {
      if (specRoom === roomCode) {
        this.io.to(socketId).emit('game:state', spectatorState);
      }
    }

    this.persistence.saveGameState(roomCode, room);
    this.persistence.persistRooms();

    if (room.engine.state.dogPending) {
      this.timers.scheduleDogResolve(roomCode);
      return;
    }
    if (room.engine.state.trickWonPending) {
      this.timers.scheduleTrickWonResolve(roomCode);
      return;
    }
    if (room.engine.state.roundEndPending) {
      this.timers.scheduleRoundEndResolve(roomCode);
      return;
    }

    this.bots.scheduleBotAction(roomCode);
  }

  // ─── Room Persistence (public API for index.ts) ────────────────────

  loadPersistedRooms(): number {
    const data = this.persistence.loadPersistedRooms();
    for (const entry of data as Array<{ code: string }>) {
      const room = this.rooms.getRoom(entry.code);
      if (room?.engine && room.botPositions.size > 0) {
        this.bots.scheduleBotAction(entry.code);
      }
    }
    return data.length;
  }
}
