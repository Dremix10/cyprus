import type { Server, Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  PlayerPosition,
  NormalRank,
  GameEvent,
  TichuCall,
  Card,
} from '@cyprus/shared';
import { GamePhase, SpecialCardType, isSpecial, findPlayableFromHand } from '@cyprus/shared';
import { RoomManager } from './RoomManager.js';
import type { Room } from './RoomManager.js';
import type { GameEngine } from './GameEngine.js';
import { BotAI } from './BotAI.js';
import type { BotDifficulty, GameContext } from './BotAI.js';
import type { TrackerDB } from './Database.js';
import { MatchmakingManager } from './MatchmakingManager.js';
import { writeFileSync, appendFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const ROOMS_PERSIST_FILE = join(DATA_DIR, 'persisted-rooms.json');

// Ensure data directory exists
try { mkdirSync(DATA_DIR, { recursive: true }); } catch { /* ignore */ }

type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;
type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

const TURN_TIMEOUT_MS = 60_000;
const DISCONNECT_REPLACE_MS = 120_000; // 2 minutes before replacing with bot

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

  /** Periodically clean up expired buckets */
  cleanup(): void {
    const now = Date.now();
    for (const [key, bucket] of this.buckets) {
      if (now > bucket.resetAt) this.buckets.delete(key);
    }
  }
}

// Track active game IDs per room for DB logging
const roomGameIds = new Map<string, number>();

export class SocketHandler {
  private turnTimers = new Map<string, NodeJS.Timeout>(); // roomCode -> timer
  private turnDeadlines = new Map<string, number>(); // roomCode -> deadline timestamp
  private disconnectTimers = new Map<string, NodeJS.Timeout>(); // "roomCode-position" -> timer
  private dogTimers = new Map<string, NodeJS.Timeout>(); // roomCode -> Dog resolve timer
  private trickWonTimers = new Map<string, NodeJS.Timeout>(); // roomCode -> trick won delay timer
  private disconnectedPlayers = new Map<string, Map<number, number>>(); // roomCode -> Map<position, userId> for players replaced by bots
  private socketToSession = new Map<string, string>(); // socketId -> sessionId (for auto-recovery)
  private rateLimiter = new RateLimiter();
  private rateLimitCleanup: ReturnType<typeof setInterval>;
  private persistTimer: NodeJS.Timeout | null = null;
  private matchmaking: MatchmakingManager;

  constructor(
    private io: TypedServer,
    private rooms: RoomManager,
    private db?: TrackerDB
  ) {
    this.rateLimitCleanup = setInterval(() => this.rateLimiter.cleanup(), 60_000);
    this.matchmaking = new MatchmakingManager(io, rooms, (roomCode, socketIds) => {
      this.onMatchCreated(roomCode, socketIds);
    });
  }

  destroy(): void {
    clearInterval(this.rateLimitCleanup);
    this.matchmaking.destroy();
    for (const timer of this.turnTimers.values()) clearTimeout(timer);
    for (const timer of this.disconnectTimers.values()) clearTimeout(timer);
    for (const timer of this.dogTimers.values()) clearTimeout(timer);
    for (const timer of this.trickWonTimers.values()) clearTimeout(timer);
    if (this.persistTimer) clearTimeout(this.persistTimer);
    // Final persist before shutdown
    this.persistRoomsSync();
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

  setup(): void {
    this.io.on('connection', (socket) => {
      const ip = this.getClientIP(socket);
      const ua = socket.handshake.headers['user-agent'] || null;

      // Rate limit connections per IP: 20 per minute
      if (ip && !this.rateLimiter.isAllowed(`conn:${ip}`, 20, 60_000)) {
        socket.disconnect(true);
        return;
      }

      this.db?.logConnection(socket.id, ip, ua);

      socket.on('room:create', (nickname, targetScore, callback) => {
        if (!this.checkRate(socket, 'create', 5, 30_000)) return;
        const userId = socket.data.userId as number | undefined;
        const result = this.rooms.createRoom(socket.id, nickname, targetScore, userId);
        if ('error' in result) {
          callback({ error: result.error });
          return;
        }
        socket.join(result.roomCode);
        this.socketToSession.set(socket.id, result.sessionId);
        callback({ roomCode: result.roomCode, sessionId: result.sessionId });
        this.db?.updateConnectionNickname(socket.id, nickname, result.roomCode);
        this.db?.getOrCreatePlayer(nickname, ip);
        this.broadcastRoomState(result.roomCode);
      });

      socket.on('room:create_solo', (nickname, targetScore, difficulty, callback) => {
        if (!this.checkRate(socket, 'create', 5, 30_000)) return;
        const validDifficulties: BotDifficulty[] = ['easy', 'medium', 'hard'];
        const diff: BotDifficulty = validDifficulties.includes(difficulty as BotDifficulty)
          ? (difficulty as BotDifficulty)
          : 'medium';

        const userId = socket.data.userId as number | undefined;
        const result = this.rooms.createSoloRoom(socket.id, nickname, targetScore, diff, userId);
        if ('error' in result) {
          callback({ error: result.error });
          return;
        }
        socket.join(result.roomCode);
        this.socketToSession.set(socket.id, result.sessionId);
        callback({ roomCode: result.roomCode, sessionId: result.sessionId });
        this.db?.updateConnectionNickname(socket.id, nickname, result.roomCode);
        const playerId = this.db?.getOrCreatePlayer(nickname, ip);

        // Start the game immediately
        const startResult = this.rooms.startGame(socket.id);
        if (startResult.error) {
          socket.emit('game:error', startResult.error);
          return;
        }

        // Log game start
        this.logGameStart(result.roomCode, targetScore, true, diff, ip);
        if (playerId) this.db?.incrementPlayerGames(playerId);

        this.broadcastGameState(result.roomCode);
      });

      socket.on('room:join', (roomCode, nickname, callback) => {
        if (!this.checkRate(socket, 'join', 10, 30_000)) return;
        const userId = socket.data.userId as number | undefined;
        const result = this.rooms.joinRoom(socket.id, roomCode, nickname, userId);
        if ('error' in result) {
          callback({ error: result.error });
          return;
        }
        socket.join(roomCode.toUpperCase());
        this.socketToSession.set(socket.id, result.sessionId);
        callback({ success: true, sessionId: result.sessionId });
        this.db?.updateConnectionNickname(socket.id, nickname, roomCode.toUpperCase());
        this.db?.getOrCreatePlayer(nickname, ip);

        // If game is in progress (reconnect), send game state
        const info = this.rooms.getRoomForSocket(socket.id);
        if (info && info.room.engine) {
          // Cancel any pending bot replacement
          const timerKey = `${info.room.code}-${info.position}`;
          const existing = this.disconnectTimers.get(timerKey);
          if (existing) {
            clearTimeout(existing);
            this.disconnectTimers.delete(timerKey);
          }
          // Notify others of reconnection
          socket.to(info.room.code).emit('room:player_reconnected', nickname);
          // Broadcast full game state to all players (updates connected status)
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
        if (result.error) {
          socket.emit('game:error', result.error);
          return;
        }
        const info = this.rooms.getRoomForSocket(socket.id);
        if (info) {
          this.logGameStart(info.room.code, info.room.targetScore, false, null, ip);
          // Increment games_played for all human players
          for (const [pos, player] of info.room.players) {
            if (!info.room.botPositions.has(pos)) {
              const pid = this.db?.getOrCreatePlayer(player.nickname, null);
              if (pid) this.db?.incrementPlayerGames(pid);
            }
          }
          this.broadcastGameState(info.room.code);
        }
      });

      // ─── Matchmaking ──────────────────────────────────────────────
      socket.on('matchmaking:join', (nickname, targetScore, callback) => {
        if (!this.checkRate(socket, 'matchmaking', 5, 30_000)) return;
        const userId = socket.data.userId as number | undefined;
        const result = this.matchmaking.enqueue(socket.id, nickname, targetScore, userId);
        if ('error' in result) {
          callback({ error: result.error });
          return;
        }
        this.db?.updateConnectionNickname(socket.id, nickname, null);
        this.db?.getOrCreatePlayer(nickname, ip);
        callback({ success: true });
      });

      socket.on('matchmaking:leave', (callback) => {
        const result = this.matchmaking.dequeue(socket.id);
        if ('error' in result) {
          callback({ error: result.error });
          return;
        }
        callback({ success: true });
      });

      socket.on('game:grand_tichu_decision', (call) => {
        if (!this.checkRate(socket, 'action')) return;
        this.handleGameAction(socket, 'GRAND_TICHU_DECISION', (engine, position) =>
          engine.grandTichuDecision(position, call)
        );
      });

      socket.on('game:pass_cards', (cards) => {
        if (!this.checkRate(socket, 'action')) return;
        this.handleGameAction(socket, 'PASS_CARDS', (engine, position) =>
          engine.passCards(position, cards)
        );
      });

      socket.on('game:play', (cardIds) => {
        if (!this.checkRate(socket, 'action')) return;
        this.handleGameAction(socket, 'PLAY', (engine, position) =>
          engine.playCards(position, cardIds)
        );
      });

      socket.on('game:pass_turn', () => {
        if (!this.checkRate(socket, 'action')) return;
        this.handleGameAction(socket, 'PASS_TURN', (engine, position) =>
          engine.passTurn(position)
        );
      });

      socket.on('game:call_tichu', () => {
        if (!this.checkRate(socket, 'action')) return;
        this.handleGameAction(socket, 'CALL_TICHU', (engine, position) =>
          engine.callTichu(position)
        );
      });

      socket.on('game:dragon_give', (opponentPosition) => {
        if (!this.checkRate(socket, 'action')) return;
        this.handleGameAction(socket, 'DRAGON_GIVE', (engine, position) =>
          engine.dragonGive(position, opponentPosition)
        );
      });

      socket.on('game:wish', (rank) => {
        if (!this.checkRate(socket, 'action')) return;
        this.handleGameAction(socket, 'WISH', (engine, position) =>
          engine.setWish(position, rank)
        );
      });

      socket.on('game:next_round', () => {
        if (!this.checkRate(socket, 'action')) return;
        this.handleGameAction(socket, 'NEXT_ROUND', (engine) => engine.nextRound());
      });

      socket.on('session:reconnect', (sessionId, callback) => {
        if (!this.rateLimiter.isAllowed(`${socket.id}:reconnect`, 5, 30_000)) {
          console.log(`[reconnect] RATE LIMITED socket=${socket.id} ip=${ip}`);
          callback({ error: 'Too many reconnect attempts, try again shortly' });
          return;
        }
        if (typeof sessionId !== 'string' || sessionId.length !== 36) {
          console.log(`[reconnect] INVALID SESSION FORMAT socket=${socket.id}`);
          callback({ error: 'Invalid session' });
          return;
        }
        const result = this.rooms.reconnectBySession(socket.id, sessionId);
        if ('error' in result) {
          console.log(`[reconnect] FAILED socket=${socket.id} reason="${result.error}" sessionId=${sessionId.slice(0, 8)}...`);
          callback({ error: result.error });
          return;
        }
        const room = this.rooms.getRoom(result.roomCode);
        const hasGame = !!(room?.engine);
        console.log(`[reconnect] OK socket=${socket.id} room=${result.roomCode} player=${result.nickname} hasGame=${hasGame}`);
        this.socketToSession.set(socket.id, sessionId);
        socket.join(result.roomCode);
        callback({ success: true, roomCode: result.roomCode, nickname: result.nickname, hasGame });

        // Cancel any pending bot replacement
        const timerKey = `${result.roomCode}-${result.position}`;
        const existing = this.disconnectTimers.get(timerKey);
        if (existing) {
          clearTimeout(existing);
          this.disconnectTimers.delete(timerKey);
        }

        // Notify others of reconnection
        socket.to(result.roomCode).emit('room:player_reconnected', result.nickname);

        // Broadcast game state if game is in progress
        if (hasGame) {
          this.broadcastGameState(result.roomCode);
        } else {
          this.broadcastRoomState(result.roomCode);
        }
      });

      socket.on('disconnect', () => {
        this.db?.logDisconnection(socket.id);
        this.socketToSession.delete(socket.id);
        this.matchmaking.handleDisconnect(socket.id);
        // Get position before disconnect handling
        const info = this.rooms.getRoomForSocket(socket.id);
        const result = this.rooms.handleDisconnect(socket.id);
        if (result) {
          this.io
            .to(result.roomCode)
            .emit('room:player_disconnected', result.nickname);
          this.broadcastRoomState(result.roomCode);

          // If a game is in progress, show updated disconnect status and schedule bot replacement
          const room = this.rooms.getRoom(result.roomCode);
          if (room?.engine && info) {
            this.broadcastGameState(result.roomCode);
            this.scheduleDisconnectReplace(result.roomCode, info.position, result.nickname);
          }
        }
      });
    });
  }

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

    // Join all sockets to the Socket.IO room and store session mappings
    for (const sid of socketIds) {
      const sock = this.io.sockets.sockets.get(sid);
      if (sock) {
        sock.join(roomCode);
        // Find the player's session ID
        for (const [, player] of room.players) {
          if (player.socketId === sid && player.sessionId) {
            this.socketToSession.set(sid, player.sessionId);
            break;
          }
        }
      }
    }

    // Log game start
    this.logGameStart(roomCode, room.targetScore, false, 'hard', null);

    // Increment games_played for all human players
    for (const [pos, player] of room.players) {
      if (!room.botPositions.has(pos)) {
        const pid = this.db?.getOrCreatePlayer(player.nickname, null);
        if (pid) this.db?.incrementPlayerGames(pid);
      }
    }

    this.broadcastGameState(roomCode);
  }

  private handleGameAction(
    socket: TypedSocket,
    actionType: string,
    action: (
      engine: GameEngine,
      position: PlayerPosition
    ) => GameEvent[]
  ): void {
    let info = this.rooms.getRoomForSocket(socket.id);

    // Session-based fallback: if socket mapping is missing, try to recover via stored session
    if (!info) {
      const sessionId = this.socketToSession.get(socket.id);
      if (sessionId) {
        const result = this.rooms.reconnectBySession(socket.id, sessionId);
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

      // Log events to DB and broadcast to the room
      const gameId = roomGameIds.get(info.room.code) || null;
      for (const event of events) {
        this.db?.logGameEvent(gameId, info.room.code, event.type, event.playerPosition ?? null, event.data);
        this.io.to(info.room.code).emit('game:event', event);

        // Detect game end
        if (event.type === 'GAME_OVER' && gameId) {
          const engine = info.room.engine;
          if (engine) {
            const s = engine.state.scores;
            const winner = s[0] > s[1] ? 'Team 0-2' : s[1] > s[0] ? 'Team 1-3' : 'Tie';
            const roundHistory = engine.getRoundHistory();

            // Wrap all game-end DB writes in a transaction for atomicity
            this.db?.transaction(() => {
            this.db?.logGameEnd(gameId, s[0], s[1], winner, roundHistory.length);
            // Update player wins
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

            // Update leaderboard stats — skip solo games (3 bots)
            const isSolo = info.room.botPositions.size === 3;
            if (!isSolo && this.db) {
              const winTeam = s[0] > s[1] ? 0 : s[1] > s[0] ? 1 : -1;
              const finishOrder = engine.state.finishOrder;

              // Gather tichu results from all rounds
              const allTichuResults = roundHistory.flatMap((r) => r.tichuResults);
              const allDoubleVictories = roundHistory.filter((r) => r.doubleVictory !== null);

              // Collect all human userIds to update: active players + disconnected players
              const playersToUpdate: Array<{ pos: number; userId: number; disconnected: boolean }> = [];

              for (const [pos, player] of info.room.players) {
                if (info.room.botPositions.has(pos) || !player.userId) continue;
                playersToUpdate.push({ pos, userId: player.userId, disconnected: false });
              }

              // Include disconnected players who were replaced by bots
              const dcPlayers = this.disconnectedPlayers.get(info.room.code);
              if (dcPlayers) {
                for (const [pos, userId] of dcPlayers) {
                  // Don't double-count if they somehow reconnected
                  if (!playersToUpdate.some((p) => p.userId === userId)) {
                    playersToUpdate.push({ pos, userId, disconnected: true });
                  }
                }
                this.disconnectedPlayers.delete(info.room.code);
              }

              for (const { pos, userId, disconnected } of playersToUpdate) {
                const team = pos % 2 === 0 ? 0 : 1;
                const won = winTeam === team;
                const firstOut = finishOrder[0] === pos;

                // Tichu stats for this player across all rounds
                const playerTichus = allTichuResults.filter((r) => r.position === pos);
                const tichuCall = playerTichus.some((r) => r.call === 'tichu');
                const tichuSuccess = playerTichus.some((r) => r.call === 'tichu' && r.success);
                const grandTichuCall = playerTichus.some((r) => r.call === 'grand_tichu');
                const grandTichuSuccess = playerTichus.some((r) => r.call === 'grand_tichu' && r.success);

                // Double victories for this player's team
                const doubleVictory = allDoubleVictories.some((r) => r.doubleVictory === team);

                // Points scored by this player's team
                const teamPoints = team === 0 ? s[0] : s[1];

                this.db.updateUserStats(userId, {
                  won,
                  firstOut,
                  tichuCall,
                  tichuSuccess,
                  grandTichuCall,
                  grandTichuSuccess,
                  doubleVictory,
                  roundsPlayed: roundHistory.length,
                  pointsScored: teamPoints,
                  disconnected,
                });

                // Compute rating
                this.computeAndUpdateRating(userId);
              }
            }

            }); // end transaction

            roomGameIds.delete(info.room.code);
          }
        }
      }

      // Broadcast updated game state to each player
      this.broadcastGameState(info.room.code);
    } catch (err) {
      socket.emit('game:error', (err as Error).message);
    }
  }

  private computeAndUpdateRating(userId: number): void {
    if (!this.db) return;
    const stats = this.db.getUserLeaderboardStats(userId);
    if (!stats || stats.games_played === 0) return;

    const gp = stats.games_played;
    // Win rate (40%)
    const winRate = stats.games_won / gp;
    // First out rate (20%)
    const firstOutRate = stats.first_out_count / gp;
    // Tichu efficiency (20%) — success rate when called, 0 if never called
    const tichuEff = stats.tichu_calls > 0 ? stats.tichu_successes / stats.tichu_calls : 0;
    // Grand tichu bonus (10%) — success rate when called
    const grandEff = stats.grand_tichu_calls > 0 ? stats.grand_tichu_successes / stats.grand_tichu_calls : 0;
    // Double victory rate (10%)
    const dvRate = stats.double_victories / gp;

    const rating = (winRate * 40 + firstOutRate * 20 + tichuEff * 20 + grandEff * 10 + dvRate * 10) * 10;
    // Scale 0-1000, clamp
    this.db.updateUserRating(userId, Math.round(Math.max(0, Math.min(1000, rating))));
  }

  private broadcastRoomState(roomCode: string): void {
    const state = this.rooms.getRoomState(roomCode);
    if (state) {
      this.io.to(roomCode).emit('room:state', state);
    }
  }

  private broadcastGameState(roomCode: string): void {
    const room = this.rooms.getRoom(roomCode);
    if (!room || !room.engine) return;

    // Build avatar map and disconnected set from room players
    const avatars = new Map<PlayerPosition, string>();
    const disconnected = new Set<PlayerPosition>();
    for (const [pos, player] of room.players) {
      if (player.avatar) avatars.set(pos, player.avatar);
      if (!player.connected) disconnected.add(pos);
    }

    // Schedule turn timer for human players
    this.scheduleTurnTimer(roomCode);

    const deadline = this.turnDeadlines.get(roomCode) ?? null;

    const sockets = this.rooms.getSocketIdsForRoom(roomCode);
    for (const [position, socketId] of sockets) {
      const isSolo = room.botPositions.size === 3;
      const state = room.engine.getClientState(position, roomCode, room.botPositions, avatars, disconnected, isSolo);
      state.turnDeadline = deadline;
      this.io.to(socketId).emit('game:state', state);
    }

    // Save latest game state for debugging + persist rooms for crash recovery
    this.saveGameState(roomCode, room);
    this.persistRooms();

    // If Dog is pending, schedule delayed resolution
    if (room.engine.state.dogPending) {
      this.scheduleDogResolve(roomCode);
      return; // Don't schedule bot actions while Dog is pending
    }

    // If trick was just won, show it for a moment before clearing
    if (room.engine.state.trickWonPending) {
      this.scheduleTrickWonResolve(roomCode);
      return; // Don't schedule bot actions while trick is showing
    }

    // Schedule bot actions if this is a solo room
    this.scheduleBotAction(roomCode);
  }

  /** Persist the latest game state to disk for debugging. */
  private saveGameState(roomCode: string, room: Room): void {
    try {
      const engine = room.engine;
      if (!engine) return;

      const snapshot = {
        roomCode,
        timestamp: new Date().toISOString(),
        phase: engine.state.phase,
        currentPlayer: engine.state.currentPlayer,
        scores: engine.state.scores,
        roundScores: engine.state.roundScores,
        finishOrder: engine.state.finishOrder,
        currentTrick: engine.state.currentTrick,
        wish: engine.state.wish,
        dragonWinner: engine.state.dragonWinner,
        players: engine.state.players.map((p) => ({
          position: p.position,
          nickname: p.nickname,
          hand: p.hand.map((c) => c.id),
          cardCount: p.hand.length,
          tichuCall: p.tichuCall,
          isOut: p.isOut,
          finishOrder: p.finishOrder,
          hasPlayedCards: p.hasPlayedCards,
          wonTricksCount: p.wonTricks.length,
          collectedCards: p.wonTricks.reduce((sum, t) => sum + t.length, 0),
        })),
        isSolo: room.botPositions.size > 0,
        botDifficulty: room.botDifficulty,
      };

      // Save latest snapshot (overwrite)
      writeFileSync(
        join(DATA_DIR, `latest-game-${roomCode}.json`),
        JSON.stringify(snapshot, null, 2)
      );

      // Append to move log (one JSON line per state change)
      const logLine = {
        t: snapshot.timestamp,
        phase: snapshot.phase,
        currentPlayer: snapshot.currentPlayer,
        trick: snapshot.currentTrick.plays.map((p) => ({
          pos: p.playerPosition,
          cards: p.combination.cards.map((c) => c.id),
          type: p.combination.type,
        })),
        trickWinner: snapshot.currentTrick.currentWinner,
        finishOrder: snapshot.finishOrder,
        scores: snapshot.scores,
        roundScores: snapshot.roundScores,
        players: snapshot.players.map((p) => ({
          pos: p.position,
          name: p.nickname,
          cards: p.cardCount,
          hand: p.hand,
          tichu: p.tichuCall,
          out: p.isOut,
          finishPos: p.finishOrder,
        })),
      };

      appendFileSync(
        join(DATA_DIR, `game-log-${roomCode}.jsonl`),
        JSON.stringify(logLine) + '\n'
      );
    } catch {
      // Don't crash the game if saving fails
    }
  }

  // ─── Disconnect → Bot Replacement ──────────────────────────────────────

  private scheduleDisconnectReplace(roomCode: string, position: PlayerPosition, nickname: string): void {
    const timerKey = `${roomCode}-${position}`;
    // Clear existing timer for this slot if any
    const existing = this.disconnectTimers.get(timerKey);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.disconnectTimers.delete(timerKey);

      // Save userId before replacement so game-end can still credit them
      const roomBeforeReplace = this.rooms.getRoom(roomCode);
      const playerBeforeReplace = roomBeforeReplace?.players.get(position);
      if (playerBeforeReplace?.userId) {
        if (!this.disconnectedPlayers.has(roomCode)) {
          this.disconnectedPlayers.set(roomCode, new Map());
        }
        this.disconnectedPlayers.get(roomCode)!.set(position, playerBeforeReplace.userId);
      }

      const replaced = this.rooms.replacePlayerWithBot(roomCode, position);
      if (!replaced) return;

      const room = this.rooms.getRoom(roomCode);
      if (!room) return;

      const botPlayer = room.players.get(position);
      const botName = botPlayer?.nickname ?? 'Bot';

      // Notify players
      this.io.to(roomCode).emit('room:player_disconnected',
        `${nickname} was replaced by ${botName}`
      );

      // Broadcast updated game state (bot now plays for them)
      this.broadcastGameState(roomCode);
    }, DISCONNECT_REPLACE_MS);

    this.disconnectTimers.set(timerKey, timer);
  }

  // ─── Dog Delay ─────────────────────────────────────────────────────────

  private scheduleDogResolve(roomCode: string): void {
    // Clear any existing Dog timer for this room to prevent stacking
    const existing = this.dogTimers.get(roomCode);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.dogTimers.delete(roomCode);
      const room = this.rooms.getRoom(roomCode);
      if (!room || !room.engine || !room.engine.state.dogPending) return;

      try {
        const events = room.engine.resolveDog();
        for (const event of events) {
          this.io.to(roomCode).emit('game:event', event);
        }
        this.broadcastGameState(roomCode);
      } catch (err) {
        console.error(`Dog resolve error in room ${roomCode}:`, err);
      }
    }, 1500);

    this.dogTimers.set(roomCode, timer);
  }

  private scheduleTrickWonResolve(roomCode: string): void {
    const existing = this.trickWonTimers.get(roomCode);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.trickWonTimers.delete(roomCode);
      const room = this.rooms.getRoom(roomCode);
      if (!room || !room.engine || !room.engine.state.trickWonPending) return;

      try {
        const events = room.engine.completeTrickWon();
        for (const event of events) {
          this.io.to(roomCode).emit('game:event', event);
        }
        this.broadcastGameState(roomCode);
      } catch (err) {
        console.error(`Trick won resolve error in room ${roomCode}:`, err);
      }
    }, 1200);

    this.trickWonTimers.set(roomCode, timer);
  }

  // ─── Turn Timer ────────────────────────────────────────────────────────

  private clearTurnTimer(roomCode: string): void {
    const existing = this.turnTimers.get(roomCode);
    if (existing) clearTimeout(existing);
    this.turnTimers.delete(roomCode);
    this.turnDeadlines.delete(roomCode);
  }

  private scheduleTurnTimer(roomCode: string): void {
    // Always clear previous timer first
    this.clearTurnTimer(roomCode);

    const room = this.rooms.getRoom(roomCode);
    if (!room || !room.engine) return;

    // No timer in solo games (3 bots)
    if (room.botPositions.size >= 3) return;

    const engine = room.engine;
    // Only run timer during PLAYING phase for human players
    if (engine.state.phase !== GamePhase.PLAYING) return;
    // Don't start timer while wish is pending
    if (engine.state.wishPending !== null) return;

    const currentPlayer = engine.state.currentPlayer;
    // Don't time bots
    if (room.botPositions.has(currentPlayer)) return;

    const deadline = Date.now() + TURN_TIMEOUT_MS;
    this.turnDeadlines.set(roomCode, deadline);

    const timer = setTimeout(() => {
      this.turnTimers.delete(roomCode);
      this.turnDeadlines.delete(roomCode);

      const currentRoom = this.rooms.getRoom(roomCode);
      if (!currentRoom || !currentRoom.engine) return;

      const eng = currentRoom.engine;
      // Verify it's still this player's turn in PLAYING phase
      if (eng.state.phase !== GamePhase.PLAYING) return;
      if (eng.state.currentPlayer !== currentPlayer) return;

      try {
        let events;
        const hasTrickOnTable = eng.state.currentTrick.plays.length > 0;
        if (hasTrickOnTable) {
          // Check if wish forces a play before trying to pass
          if (eng.state.wish.active && eng.state.wish.wishedRank !== null) {
            const player = eng.state.players[currentPlayer];
            const currentTop = eng.state.currentTrick.plays[eng.state.currentTrick.plays.length - 1].combination;
            const playable = findPlayableFromHand(player.hand, currentTop, eng.state.wish);
            const wishedPlays = playable.filter((cards) =>
              cards.some((c) => c.type === 'normal' && c.rank === eng.state.wish.wishedRank)
            );
            if (wishedPlays.length > 0) {
              // Pick the cheapest option: prefer single, then smallest combo
              const cheapest = wishedPlays.sort((a, b) => a.length - b.length)[0];
              events = eng.playCards(currentPlayer, cheapest.map((c) => c.id));
            } else {
              events = eng.passTurn(currentPlayer);
            }
          } else {
            events = eng.passTurn(currentPlayer);
          }
        } else {
          // Must lead — play the lowest single card
          const player = eng.state.players[currentPlayer];
          const lowestCard = player.hand[0]; // hand is sorted, first is lowest
          events = eng.playCards(currentPlayer, [lowestCard.id]);
        }

        for (const event of events) {
          this.io.to(roomCode).emit('game:event', event);
        }
        this.broadcastGameState(roomCode);
      } catch (err) {
        console.error(`Turn timer auto-action error in room ${roomCode}:`, err);
      }
    }, TURN_TIMEOUT_MS);

    this.turnTimers.set(roomCode, timer);
  }

  // ─── Bot Turn Processing ──────────────────────────────────────────────

  private scheduleBotAction(roomCode: string): void {
    const room = this.rooms.getRoom(roomCode);
    if (!room || !room.engine || room.botPositions.size === 0) return;

    const engine = room.engine;
    const botAI = new BotAI(room.botDifficulty);

    const action = this.findBotAction(room, engine, botAI);
    if (!action) return;

    // Check if the human player is out (finished)
    const humanPositions = ([0, 1, 2, 3] as PlayerPosition[]).filter(
      (p) => !room.botPositions.has(p)
    );
    const humanIsOut = humanPositions.every((p) => engine.state.players[p].isOut);
    const delay = botAI.getDelay(humanIsOut);
    setTimeout(() => {
      // Re-check room still exists
      const currentRoom = this.rooms.getRoom(roomCode);
      if (!currentRoom || !currentRoom.engine) return;

      try {
        const events = action();
        const gameId = roomGameIds.get(roomCode) || null;
        for (const event of events) {
          this.db?.logGameEvent(gameId, roomCode, event.type, event.playerPosition ?? null, event.data);
          this.io.to(roomCode).emit('game:event', event);
        }
        this.broadcastGameState(roomCode);
      } catch (err) {
        console.error(`Bot action error in room ${roomCode}:`, err);
      }
    }, delay);
  }

  /** Compute all cards that have been played this round (won tricks + current trick). */
  private getPlayedCards(engine: GameEngine): Card[] {
    const played: Card[] = [];
    for (const p of engine.state.players) {
      for (const trick of p.wonTricks) {
        played.push(...trick);
      }
    }
    for (const play of engine.state.currentTrick.plays) {
      played.push(...play.combination.cards);
    }
    return played;
  }

  /** Build the full game context for hard mode bot decisions. */
  private buildGameContext(engine: GameEngine): GameContext {
    return {
      playerCardCounts: new Map<PlayerPosition, number>(
        engine.state.players.map((p) => [p.position, p.hand.length])
      ),
      tichuCalls: {
        0: engine.state.players[0].tichuCall,
        1: engine.state.players[1].tichuCall,
        2: engine.state.players[2].tichuCall,
        3: engine.state.players[3].tichuCall,
      } as Record<PlayerPosition, TichuCall>,
      finishOrder: engine.state.finishOrder as PlayerPosition[],
      playedCards: this.getPlayedCards(engine),
      scores: [...engine.state.scores] as [number, number],
    };
  }

  private findBotAction(
    room: Room,
    engine: GameEngine,
    botAI: BotAI
  ): (() => GameEvent[]) | null {
    const phase = engine.state.phase;

    if (
      phase === GamePhase.ROUND_SCORING ||
      phase === GamePhase.GAME_OVER ||
      phase === GamePhase.WAITING
    ) {
      return null; // Human must act
    }

    if (phase === GamePhase.GRAND_TICHU) {
      for (const pos of room.botPositions) {
        if (!engine.state.players[pos].grandTichuDecided) {
          const call = botAI.decideGrandTichu(engine.state.players[pos].hand);
          return () => engine.grandTichuDecision(pos, call);
        }
      }
      return null;
    }

    if (phase === GamePhase.PASSING) {
      for (const pos of room.botPositions) {
        if (!engine.state.players[pos].passedCards) {
          const tichuCalls = {
            0: engine.state.players[0].tichuCall,
            1: engine.state.players[1].tichuCall,
            2: engine.state.players[2].tichuCall,
            3: engine.state.players[3].tichuCall,
          } as Record<PlayerPosition, TichuCall>;
          const cards = botAI.choosePassCards(engine.state.players[pos].hand, pos, tichuCalls);
          return () => engine.passCards(pos, cards);
        }
      }
      return null;
    }

    if (phase === GamePhase.PLAYING) {
      // First: check for pending Mahjong wish from a bot
      if (engine.state.wishPending !== null && room.botPositions.has(engine.state.wishPending)) {
        const wishPos = engine.state.wishPending;
        const hand = engine.state.players[wishPos].hand;
        const gameContext = this.buildGameContext(engine);
        const rank = botAI.chooseWish(hand, gameContext);
        return () => engine.setWish(wishPos, rank);
      }

      // Block bot play while wish is pending (human hasn't chosen yet)
      if (engine.state.wishPending !== null) return null;

      // Regular play
      const currentPlayer = engine.state.currentPlayer;
      if (!room.botPositions.has(currentPlayer)) return null;

      const player = engine.state.players[currentPlayer];

      // Bot Tichu calling: call before first play if hand is strong enough
      if (player.tichuCall === 'none' && !player.hasPlayedCards) {
        if (botAI.decideTichu(player.hand)) {
          return () => engine.callTichu(currentPlayer);
        }
      }

      const hand = player.hand;
      const gameContext = this.buildGameContext(engine);

      let cardIds = botAI.choosePlay(
        hand,
        engine.state.currentTrick,
        engine.state.wish,
        currentPlayer,
        gameContext
      );

      // If bot wants to pass but wish forces a play, find a valid wished-rank combo
      if (!cardIds && engine.state.wish.active && engine.state.wish.wishedRank !== null) {
        const currentTop = engine.state.currentTrick.plays.length > 0
          ? engine.state.currentTrick.plays[engine.state.currentTrick.plays.length - 1].combination
          : null;
        const playable = findPlayableFromHand(hand, currentTop, engine.state.wish);
        const wishedPlay = playable.find((cards) =>
          cards.some((c) => c.type === 'normal' && c.rank === engine.state.wish.wishedRank)
        );
        if (wishedPlay) {
          cardIds = wishedPlay.map((c) => c.id);
        }
      }

      if (cardIds) {
        return () => engine.playCards(currentPlayer, cardIds!);
      } else {
        return () => engine.passTurn(currentPlayer);
      }
    }

    if (phase === GamePhase.DRAGON_GIVE) {
      const winner = engine.state.dragonWinner;
      if (winner === null || !room.botPositions.has(winner)) return null;

      const opponents = ([0, 1, 2, 3] as PlayerPosition[]).filter(
        (p) => p % 2 !== winner % 2
      );
      const cardCounts = new Map<PlayerPosition, number>();
      for (const p of engine.state.players) {
        cardCounts.set(p.position, p.hand.length);
      }
      const gameContext = this.buildGameContext(engine);
      const target = botAI.chooseDragonGiveTarget(opponents, cardCounts, gameContext);
      return () => engine.dragonGive(winner, target);
    }

    return null;
  }

  // ─── Room Persistence ─────────────────────────────────────────────────

  /** Save all active rooms with games to disk (debounced — at most once per 5s). */
  persistRooms(): void {
    if (this.persistTimer) return; // already scheduled
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.persistRoomsSync();
    }, 5_000);
  }

  /** Immediate synchronous persist (used by debounce timer and shutdown). */
  private persistRoomsSync(): void {
    try {
      mkdirSync(DATA_DIR, { recursive: true });
      const data = this.rooms.serializeRooms();
      writeFileSync(ROOMS_PERSIST_FILE, JSON.stringify(data));
      // Clean up roomGameIds for rooms that no longer exist
      for (const roomCode of roomGameIds.keys()) {
        if (!this.rooms.getRoom(roomCode)) roomGameIds.delete(roomCode);
      }
    } catch {
      // Don't crash if persistence fails
    }
  }

  /** Load persisted rooms from disk (call on server startup, before setup). */
  loadPersistedRooms(): number {
    try {
      if (!existsSync(ROOMS_PERSIST_FILE)) return 0;
      const raw = readFileSync(ROOMS_PERSIST_FILE, 'utf-8');
      const data = JSON.parse(raw);
      const count = this.rooms.restoreRooms(data);
      // Clear the file after loading so stale data isn't reloaded on next restart
      writeFileSync(ROOMS_PERSIST_FILE, '[]');

      // Schedule bot actions for restored solo rooms where it's a bot's turn
      for (const entry of data) {
        const room = this.rooms.getRoom(entry.code);
        if (room?.engine && room.botPositions.size > 0) {
          this.scheduleBotAction(entry.code);
        }
      }

      return count;
    } catch {
      return 0;
    }
  }
}
