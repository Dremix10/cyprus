import type { TrackerDB } from './Database.js';

type LogLevel = 'info' | 'warn' | 'error';

/**
 * Structured game monitoring and logging.
 * All events are written to the server_logs DB table for querying via admin API.
 * Categories organize logs for filtering: game, auth, connection, bot, performance, system.
 */
export class GameMonitor {
  private logCleanupInterval: ReturnType<typeof setInterval>;

  constructor(private db: TrackerDB) {
    // Clean logs older than 7 days every 6 hours
    this.logCleanupInterval = setInterval(() => {
      this.db.cleanOldLogs(7);
    }, 6 * 60 * 60_000);
    this.logCleanupInterval.unref();
  }

  destroy(): void {
    clearInterval(this.logCleanupInterval);
  }

  // ─── Core Logging ─────────────────────────────────────────────────

  private log(level: LogLevel, category: string, message: string, roomCode?: string, userId?: number, data?: Record<string, unknown>): void {
    try {
      this.db.writeLog(level, category, message, roomCode, userId, data);
    } catch {
      // Don't crash on logging failure
    }
  }

  // ─── Game Lifecycle ───────────────────────────────────────────────

  gameCreated(roomCode: string, targetScore: number, isSolo: boolean, botDifficulty: string, userId?: number): void {
    this.log('info', 'game', 'Room created', roomCode, userId, { targetScore, isSolo, botDifficulty });
  }

  gameStarted(roomCode: string, playerCount: number, botCount: number): void {
    this.log('info', 'game', 'Game started', roomCode, undefined, { playerCount, botCount });
  }

  gameEnded(roomCode: string, winner: string, scores: [number, number], rounds: number): void {
    this.log('info', 'game', 'Game ended', roomCode, undefined, { winner, scores, rounds });
  }

  roundEnded(roomCode: string, roundNum: number, scores: [number, number]): void {
    this.log('info', 'game', 'Round ended', roomCode, undefined, { roundNum, scores });
  }

  // ─── Player Events ────────────────────────────────────────────────

  playerJoined(roomCode: string, nickname: string, userId?: number): void {
    this.log('info', 'connection', 'Player joined', roomCode, userId, { nickname });
  }

  playerDisconnected(roomCode: string, nickname: string, userId?: number): void {
    this.log('warn', 'connection', 'Player disconnected', roomCode, userId, { nickname });
  }

  playerReconnected(roomCode: string, nickname: string, userId?: number): void {
    this.log('info', 'connection', 'Player reconnected', roomCode, userId, { nickname });
  }

  playerReplacedByBot(roomCode: string, nickname: string, botName: string, userId?: number): void {
    this.log('warn', 'connection', 'Player replaced by bot', roomCode, userId, { nickname, botName });
  }

  reconnectFailed(reason: string, sessionIdPrefix: string): void {
    this.log('warn', 'connection', 'Reconnect failed', undefined, undefined, { reason, sessionIdPrefix });
  }

  // ─── Auth Events ──────────────────────────────────────────────────

  loginSuccess(userId: number, username: string, ip: string | null): void {
    this.log('info', 'auth', 'Login success', undefined, userId, { username, ip });
  }

  loginFailed(username: string, ip: string | null, reason: string): void {
    this.log('warn', 'auth', 'Login failed', undefined, undefined, { username, ip, reason });
  }

  accountCreated(userId: number, username: string): void {
    this.log('info', 'auth', 'Account created', undefined, userId, { username });
  }

  // ─── Bot / Performance ────────────────────────────────────────────

  botActionError(roomCode: string, error: string): void {
    this.log('error', 'bot', 'Bot action error', roomCode, undefined, { error });
  }

  mcSimPerformance(roomCode: string, simCount: number, durationMs: number, candidateCount: number): void {
    this.log('info', 'performance', 'MC simulation', roomCode, undefined, { simCount, durationMs, candidateCount });
  }

  // ─── System Events ────────────────────────────────────────────────

  serverStarted(commit: string): void {
    this.log('info', 'system', 'Server started', undefined, undefined, { commit });
  }

  serverShutdown(): void {
    this.log('info', 'system', 'Server shutting down');
  }

  deployReceived(): void {
    this.log('info', 'system', 'Deploy signal received');
  }

  roomPersisted(roomCount: number): void {
    this.log('info', 'system', 'Rooms persisted', undefined, undefined, { roomCount });
  }

  roomRestored(roomCount: number): void {
    this.log('info', 'system', 'Rooms restored', undefined, undefined, { roomCount });
  }

  uncaughtError(error: string, stack?: string): void {
    this.log('error', 'system', 'Uncaught error', undefined, undefined, { error, stack });
  }
}
