import BetterSqlite3 from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');

export class TrackerDB {
  private db: BetterSqlite3.Database;

  constructor(dbPath?: string) {
    mkdirSync(DATA_DIR, { recursive: true });
    const path = dbPath || join(DATA_DIR, 'cyprus.db');
    this.db = new BetterSqlite3(path);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS connections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        socket_id TEXT NOT NULL,
        ip TEXT,
        user_agent TEXT,
        connected_at TEXT DEFAULT (datetime('now')),
        disconnected_at TEXT,
        nickname TEXT,
        room_code TEXT
      );

      CREATE TABLE IF NOT EXISTS players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nickname TEXT NOT NULL,
        ip TEXT,
        first_seen TEXT DEFAULT (datetime('now')),
        last_seen TEXT DEFAULT (datetime('now')),
        games_played INTEGER DEFAULT 0,
        games_won INTEGER DEFAULT 0,
        UNIQUE(nickname, ip)
      );

      CREATE TABLE IF NOT EXISTS games (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_code TEXT NOT NULL,
        started_at TEXT DEFAULT (datetime('now')),
        ended_at TEXT,
        target_score INTEGER,
        is_solo INTEGER DEFAULT 0,
        bot_difficulty TEXT,
        final_score_02 INTEGER,
        final_score_13 INTEGER,
        winner_team TEXT,
        rounds_played INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS game_players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id INTEGER NOT NULL REFERENCES games(id),
        nickname TEXT NOT NULL,
        position INTEGER NOT NULL,
        is_bot INTEGER DEFAULT 0,
        ip TEXT
      );

      CREATE TABLE IF NOT EXISTS game_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id INTEGER REFERENCES games(id),
        room_code TEXT,
        event_type TEXT NOT NULL,
        player_position INTEGER,
        data TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS server_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        level TEXT NOT NULL,
        category TEXT NOT NULL,
        message TEXT NOT NULL,
        room_code TEXT,
        user_id INTEGER,
        data TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS http_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        method TEXT,
        path TEXT,
        ip TEXT,
        user_agent TEXT,
        status_code INTEGER,
        response_time_ms INTEGER,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS admin_sessions (
        token TEXT PRIMARY KEY,
        created_at TEXT DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        display_name TEXT NOT NULL,
        password_hash TEXT,
        email TEXT COLLATE NOCASE,
        google_id TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        locked_until TEXT,
        failed_login_attempts INTEGER DEFAULT 0,
        last_login_at TEXT,
        avatar TEXT,
        display_name_changed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS user_sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL,
        ip TEXT,
        user_agent TEXT
      );

      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL,
        used INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS user_stats (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        games_played INTEGER DEFAULT 0,
        games_won INTEGER DEFAULT 0,
        games_lost INTEGER DEFAULT 0,
        first_out_count INTEGER DEFAULT 0,
        tichu_calls INTEGER DEFAULT 0,
        tichu_successes INTEGER DEFAULT 0,
        grand_tichu_calls INTEGER DEFAULT 0,
        grand_tichu_successes INTEGER DEFAULT 0,
        double_victories INTEGER DEFAULT 0,
        total_rounds INTEGER DEFAULT 0,
        total_points_scored INTEGER DEFAULT 0,
        disconnects INTEGER DEFAULT 0,
        rating REAL DEFAULT 0,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_conn_ip ON connections(ip);
      CREATE INDEX IF NOT EXISTS idx_conn_at ON connections(connected_at);
      CREATE INDEX IF NOT EXISTS idx_conn_socket ON connections(socket_id);
      CREATE INDEX IF NOT EXISTS idx_players_nick ON players(nickname);
      CREATE INDEX IF NOT EXISTS idx_games_at ON games(started_at);
      CREATE INDEX IF NOT EXISTS idx_game_events_gid ON game_events(game_id);
      CREATE INDEX IF NOT EXISTS idx_http_at ON http_requests(created_at);
      CREATE INDEX IF NOT EXISTS idx_server_logs_at ON server_logs(created_at);
      CREATE INDEX IF NOT EXISTS idx_server_logs_cat ON server_logs(category);
      CREATE INDEX IF NOT EXISTS idx_server_logs_level ON server_logs(level);
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);
      CREATE INDEX IF NOT EXISTS idx_reset_tokens_expires ON password_reset_tokens(expires_at);
    `);

    // ─── Migrations for existing databases ──────────────────────────
    // SQLite ALTER TABLE ADD COLUMN can't use UNIQUE directly — add column, then create unique index
    const addColumnMigrations = [
      `ALTER TABLE users ADD COLUMN email TEXT COLLATE NOCASE`,
      `ALTER TABLE users ADD COLUMN google_id TEXT`,
      `ALTER TABLE game_players ADD COLUMN user_id INTEGER`,
      `ALTER TABLE users ADD COLUMN avatar TEXT`,
      `ALTER TABLE users ADD COLUMN display_name_changed_at TEXT`,
    ];
    for (const sql of addColumnMigrations) {
      try { this.db.exec(sql); } catch { /* column already exists */ }
    }

    // Unique indexes on migrated columns (must run after ALTER TABLE)
    this.db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google ON users(google_id);
    `);

    // Friendships table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS friendships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        friend_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(user_id, friend_id)
      );
      CREATE INDEX IF NOT EXISTS idx_friendships_user ON friendships(user_id);
      CREATE INDEX IF NOT EXISTS idx_friendships_friend ON friendships(friend_id);
    `);
  }

  // ─── Connections ────────────────────────────────────────────────────

  logConnection(socketId: string, ip: string | null, userAgent: string | null): void {
    this.db.prepare(
      `INSERT INTO connections (socket_id, ip, user_agent) VALUES (?, ?, ?)`
    ).run(socketId, ip, userAgent);
  }

  markAllConnectionsDisconnected(): void {
    this.db.prepare(
      `UPDATE connections SET disconnected_at = datetime('now') WHERE disconnected_at IS NULL`
    ).run();
  }

  logDisconnection(socketId: string): void {
    this.db.prepare(
      `UPDATE connections SET disconnected_at = datetime('now') WHERE socket_id = ? AND disconnected_at IS NULL`
    ).run(socketId);
  }

  updateConnectionNickname(socketId: string, nickname: string, roomCode: string | null): void {
    this.db.prepare(
      `UPDATE connections SET nickname = ?, room_code = ? WHERE socket_id = ? AND disconnected_at IS NULL`
    ).run(nickname, roomCode, socketId);
  }

  // ─── Players ────────────────────────────────────────────────────────

  getOrCreatePlayer(nickname: string, ip: string | null): number {
    try {
      // Exact match on nickname + ip (IS handles NULL safely)
      const existing = this.db.prepare(
        `SELECT id FROM players WHERE nickname = ? AND ip IS ? ORDER BY last_seen DESC LIMIT 1`
      ).get(nickname, ip) as { id: number } | undefined;

      if (existing) {
        this.db.prepare(`UPDATE players SET last_seen = datetime('now') WHERE id = ?`).run(existing.id);
        return existing.id;
      }

      const result = this.db.prepare(
        `INSERT INTO players (nickname, ip) VALUES (?, ?)`
      ).run(nickname, ip);
      return Number(result.lastInsertRowid);
    } catch {
      // Constraint violation fallback — find any row with this nickname
      const fallback = this.db.prepare(
        `SELECT id FROM players WHERE nickname = ? ORDER BY last_seen DESC LIMIT 1`
      ).get(nickname) as { id: number } | undefined;
      if (fallback) {
        try { this.db.prepare(`UPDATE players SET last_seen = datetime('now') WHERE id = ?`).run(fallback.id); } catch { /* ignore */ }
        return fallback.id;
      }
      return -1;
    }
  }

  incrementPlayerGames(playerId: number): void {
    this.db.prepare(`UPDATE players SET games_played = games_played + 1 WHERE id = ?`).run(playerId);
  }

  incrementPlayerWins(playerId: number): void {
    this.db.prepare(`UPDATE players SET games_won = games_won + 1 WHERE id = ?`).run(playerId);
  }

  // ─── Games ──────────────────────────────────────────────────────────

  logGameStart(
    roomCode: string,
    targetScore: number,
    isSolo: boolean,
    botDifficulty: string | null,
    players: Array<{ nickname: string; position: number; isBot: boolean; ip: string | null; userId?: number }>
  ): number {
    const insertGame = this.db.prepare(
      `INSERT INTO games (room_code, target_score, is_solo, bot_difficulty) VALUES (?, ?, ?, ?)`
    );
    const insertPlayer = this.db.prepare(
      `INSERT INTO game_players (game_id, nickname, position, is_bot, ip, user_id) VALUES (?, ?, ?, ?, ?, ?)`
    );

    return this.db.transaction(() => {
      const result = insertGame.run(roomCode, targetScore, isSolo ? 1 : 0, botDifficulty);
      const gameId = Number(result.lastInsertRowid);
      for (const p of players) {
        insertPlayer.run(gameId, p.nickname, p.position, p.isBot ? 1 : 0, p.ip, p.userId ?? null);
      }
      return gameId;
    })();
  }

  logGameEnd(
    gameId: number,
    finalScore02: number,
    finalScore13: number,
    winnerTeam: string,
    roundsPlayed: number
  ): void {
    this.db.prepare(
      `UPDATE games SET ended_at = datetime('now'), final_score_02 = ?, final_score_13 = ?, winner_team = ?, rounds_played = ? WHERE id = ?`
    ).run(finalScore02, finalScore13, winnerTeam, roundsPlayed, gameId);
  }

  // ─── Game Events ────────────────────────────────────────────────────

  logGameEvent(
    gameId: number | null,
    roomCode: string,
    eventType: string,
    playerPosition: number | null,
    data?: Record<string, unknown>
  ): void {
    this.db.prepare(
      `INSERT INTO game_events (game_id, room_code, event_type, player_position, data) VALUES (?, ?, ?, ?, ?)`
    ).run(gameId, roomCode, eventType, playerPosition, data ? JSON.stringify(data) : null);
  }

  // ─── HTTP Requests ──────────────────────────────────────────────────

  logHttpRequest(
    method: string,
    path: string,
    ip: string | null,
    userAgent: string | null,
    statusCode: number,
    responseTimeMs: number
  ): void {
    this.db.prepare(
      `INSERT INTO http_requests (method, path, ip, user_agent, status_code, response_time_ms) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(method, path, ip, userAgent, statusCode, responseTimeMs);
  }

  // ─── Server Logs ────────────────────────────────────────────────────

  writeLog(level: string, category: string, message: string, roomCode?: string, userId?: number, data?: Record<string, unknown>): void {
    this.db.prepare(
      `INSERT INTO server_logs (level, category, message, room_code, user_id, data) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(level, category, message, roomCode ?? null, userId ?? null, data ? JSON.stringify(data) : null);
  }

  getServerLogs(options: { level?: string; category?: string; limit?: number; roomCode?: string } = {}): unknown[] {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (options.level) { conditions.push('level = ?'); params.push(options.level); }
    if (options.category) { conditions.push('category = ?'); params.push(options.category); }
    if (options.roomCode) { conditions.push('room_code = ?'); params.push(options.roomCode); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(options.limit || 200, 1000);
    params.push(limit);
    return this.db.prepare(
      `SELECT id, level, category, message, room_code, user_id, data, created_at FROM server_logs ${where} ORDER BY created_at DESC LIMIT ?`
    ).all(...params);
  }

  cleanOldLogs(daysToKeep: number = 7): void {
    this.db.prepare(`DELETE FROM server_logs WHERE created_at < datetime('now', '-' || ? || ' days')`).run(daysToKeep);
  }

  // ─── Admin Sessions ─────────────────────────────────────────────────

  createAdminSession(token: string, expiresInHours: number = 24): void {
    this.db.prepare(
      `INSERT INTO admin_sessions (token, expires_at) VALUES (?, datetime('now', '+' || ? || ' hours'))`
    ).run(token, expiresInHours);
  }

  validateAdminSession(token: string): boolean {
    const row = this.db.prepare(
      `SELECT token FROM admin_sessions WHERE token = ? AND expires_at > datetime('now')`
    ).get(token);
    return !!row;
  }

  cleanExpiredSessions(): void {
    this.db.prepare(`DELETE FROM admin_sessions WHERE expires_at <= datetime('now')`).run();
  }

  // ─── Dashboard Queries ──────────────────────────────────────────────

  getStats(): {
    totalPlayers: number;
    totalGames: number;
    totalConnections: number;
    activeConnections: number;
    gamesInProgress: number;
    totalHttpRequests: number;
    uniqueIPs: number;
  } {
    const totalPlayers = (this.db.prepare(`SELECT COUNT(*) as c FROM players`).get() as { c: number }).c;
    const totalGames = (this.db.prepare(`SELECT COUNT(*) as c FROM games`).get() as { c: number }).c;
    const totalConnections = (this.db.prepare(`SELECT COUNT(*) as c FROM connections`).get() as { c: number }).c;
    const activeConnections = (this.db.prepare(`SELECT COUNT(*) as c FROM connections WHERE disconnected_at IS NULL`).get() as { c: number }).c;
    const gamesInProgress = (this.db.prepare(`SELECT COUNT(*) as c FROM games WHERE ended_at IS NULL`).get() as { c: number }).c;
    const totalHttpRequests = (this.db.prepare(`SELECT COUNT(*) as c FROM http_requests`).get() as { c: number }).c;
    const uniqueIPs = (this.db.prepare(`SELECT COUNT(DISTINCT ip) as c FROM connections WHERE ip IS NOT NULL`).get() as { c: number }).c;
    return { totalPlayers, totalGames, totalConnections, activeConnections, gamesInProgress, totalHttpRequests, uniqueIPs };
  }

  getRecentConnections(limit: number = 50): unknown[] {
    return this.db.prepare(
      `SELECT socket_id, ip, user_agent, nickname, room_code, connected_at, disconnected_at FROM connections ORDER BY connected_at DESC LIMIT ?`
    ).all(limit);
  }

  getPlayers(limit: number = 100): unknown[] {
    return this.db.prepare(
      `SELECT nickname, ip, first_seen, last_seen, games_played, games_won FROM players ORDER BY last_seen DESC LIMIT ?`
    ).all(limit);
  }

  getRecentGames(limit: number = 50): unknown[] {
    return this.db.prepare(`
      SELECT g.id, g.room_code, g.started_at, g.ended_at, g.target_score, g.is_solo,
             g.bot_difficulty, g.final_score_02, g.final_score_13, g.winner_team, g.rounds_played,
             GROUP_CONCAT(gp.nickname || ' (P' || gp.position || CASE WHEN gp.is_bot THEN ' BOT' ELSE '' END || ')', ', ') as players
      FROM games g
      LEFT JOIN game_players gp ON gp.game_id = g.id
      GROUP BY g.id
      ORDER BY g.started_at DESC LIMIT ?
    `).all(limit);
  }

  getRecentEvents(limit: number = 100): unknown[] {
    return this.db.prepare(
      `SELECT game_id, room_code, event_type, player_position, data, created_at FROM game_events ORDER BY created_at DESC LIMIT ?`
    ).all(limit);
  }

  getRecentHttpRequests(limit: number = 100): unknown[] {
    return this.db.prepare(
      `SELECT method, path, ip, user_agent, status_code, response_time_ms, created_at FROM http_requests ORDER BY created_at DESC LIMIT ?`
    ).all(limit);
  }

  getHourlyTraffic(hours: number = 24): unknown[] {
    return this.db.prepare(`
      SELECT strftime('%Y-%m-%d %H:00', created_at) as hour, COUNT(*) as count
      FROM http_requests
      WHERE created_at >= datetime('now', '-' || ? || ' hours')
      GROUP BY hour ORDER BY hour
    `).all(hours);
  }

  getTopIPs(limit: number = 20): unknown[] {
    return this.db.prepare(`
      SELECT ip, COUNT(*) as connection_count,
             MAX(connected_at) as last_seen,
             GROUP_CONCAT(DISTINCT nickname) as nicknames
      FROM connections WHERE ip IS NOT NULL
      GROUP BY ip ORDER BY connection_count DESC LIMIT ?
    `).all(limit);
  }

  // ─── Users ──────────────────────────────────────────────────────────

  createUser(username: string, displayName: string, passwordHash: string | null, email: string | null = null, googleId: string | null = null): number {
    const result = this.db.prepare(
      `INSERT INTO users (username, display_name, password_hash, email, google_id) VALUES (?, ?, ?, ?, ?)`
    ).run(username, displayName, passwordHash, email, googleId);
    return Number(result.lastInsertRowid);
  }

  getUserByUsername(username: string): {
    id: number; username: string; display_name: string; password_hash: string | null;
    email: string | null; google_id: string | null;
    created_at: string; locked_until: string | null; failed_login_attempts: number;
  } | undefined {
    return this.db.prepare(
      `SELECT id, username, display_name, password_hash, email, google_id, created_at, locked_until, failed_login_attempts FROM users WHERE username = ?`
    ).get(username) as ReturnType<TrackerDB['getUserByUsername']>;
  }

  getUserByEmail(email: string): ReturnType<TrackerDB['getUserByUsername']> {
    return this.db.prepare(
      `SELECT id, username, display_name, password_hash, email, google_id, created_at, locked_until, failed_login_attempts FROM users WHERE email = ?`
    ).get(email) as ReturnType<TrackerDB['getUserByEmail']>;
  }

  getUserByGoogleId(googleId: string): ReturnType<TrackerDB['getUserByUsername']> {
    return this.db.prepare(
      `SELECT id, username, display_name, password_hash, email, google_id, created_at, locked_until, failed_login_attempts FROM users WHERE google_id = ?`
    ).get(googleId) as ReturnType<TrackerDB['getUserByGoogleId']>;
  }

  linkGoogleAccount(userId: number, googleId: string, email: string): void {
    this.db.prepare(
      `UPDATE users SET google_id = ?, email = COALESCE(email, ?), updated_at = datetime('now') WHERE id = ?`
    ).run(googleId, email, userId);
  }

  updateUserEmail(userId: number, email: string): void {
    this.db.prepare(`UPDATE users SET email = ?, updated_at = datetime('now') WHERE id = ?`).run(email, userId);
  }

  getUserById(id: number): {
    id: number; username: string; display_name: string; created_at: string;
    last_login_at: string | null; email: string | null;
    avatar: string | null; display_name_changed_at: string | null;
  } | undefined {
    return this.db.prepare(
      `SELECT id, username, display_name, created_at, last_login_at, email, avatar, display_name_changed_at FROM users WHERE id = ?`
    ).get(id) as ReturnType<TrackerDB['getUserById']>;
  }

  updateUserPassword(userId: number, passwordHash: string): void {
    this.db.prepare(
      `UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(passwordHash, userId);
  }

  getUserPasswordHash(userId: number): string | undefined {
    const row = this.db.prepare(`SELECT password_hash FROM users WHERE id = ?`).get(userId) as { password_hash: string } | undefined;
    return row?.password_hash;
  }

  recordLoginSuccess(userId: number): void {
    this.db.prepare(
      `UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = datetime('now') WHERE id = ?`
    ).run(userId);
  }

  recordLoginFailure(userId: number): void {
    this.db.prepare(
      `UPDATE users SET failed_login_attempts = failed_login_attempts + 1 WHERE id = ?`
    ).run(userId);
  }

  lockAccount(userId: number, minutes: number): void {
    this.db.prepare(
      `UPDATE users SET locked_until = datetime('now', '+' || ? || ' minutes') WHERE id = ?`
    ).run(minutes, userId);
  }

  deleteUser(userId: number): void {
    this.db.prepare(`DELETE FROM users WHERE id = ?`).run(userId);
  }

  // ─── Password Reset Tokens ─────────────────────────────────────────

  createPasswordResetToken(tokenHash: string, userId: number, expiresInMinutes: number = 60): void {
    // Invalidate any existing tokens for this user
    this.db.prepare(`DELETE FROM password_reset_tokens WHERE user_id = ?`).run(userId);
    this.db.prepare(
      `INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now', '+' || ? || ' minutes'))`
    ).run(tokenHash, userId, expiresInMinutes);
  }

  validatePasswordResetToken(tokenHash: string): { user_id: number } | undefined {
    return this.db.prepare(
      `SELECT user_id FROM password_reset_tokens WHERE token_hash = ? AND expires_at > datetime('now') AND used = 0`
    ).get(tokenHash) as { user_id: number } | undefined;
  }

  markPasswordResetTokenUsed(tokenHash: string): void {
    this.db.prepare(`UPDATE password_reset_tokens SET used = 1 WHERE token_hash = ?`).run(tokenHash);
  }

  cleanExpiredResetTokens(): void {
    this.db.prepare(`DELETE FROM password_reset_tokens WHERE expires_at <= datetime('now') OR used = 1`).run();
  }

  // ─── User Sessions ─────────────────────────────────────────────────

  createUserSession(token: string, userId: number, expiresInHours: number, ip: string | null, userAgent: string | null): void {
    this.db.prepare(
      `INSERT INTO user_sessions (token, user_id, expires_at, ip, user_agent) VALUES (?, ?, datetime('now', '+' || ? || ' hours'), ?, ?)`
    ).run(token, userId, expiresInHours, ip, userAgent);
  }

  validateUserSession(token: string): { user_id: number } | undefined {
    return this.db.prepare(
      `SELECT user_id FROM user_sessions WHERE token = ? AND expires_at > datetime('now')`
    ).get(token) as { user_id: number } | undefined;
  }

  deleteUserSession(token: string): void {
    this.db.prepare(`DELETE FROM user_sessions WHERE token = ?`).run(token);
  }

  deleteAllUserSessions(userId: number): void {
    this.db.prepare(`DELETE FROM user_sessions WHERE user_id = ?`).run(userId);
  }

  countUserSessions(userId: number): number {
    return (this.db.prepare(
      `SELECT COUNT(*) as c FROM user_sessions WHERE user_id = ? AND expires_at > datetime('now')`
    ).get(userId) as { c: number }).c;
  }

  pruneOldestUserSessions(userId: number, keepCount: number): void {
    this.db.prepare(`
      DELETE FROM user_sessions WHERE user_id = ? AND token NOT IN (
        SELECT token FROM user_sessions WHERE user_id = ? AND expires_at > datetime('now')
        ORDER BY created_at DESC LIMIT ?
      )
    `).run(userId, userId, keepCount);
  }

  cleanExpiredUserSessions(): void {
    this.db.prepare(`DELETE FROM user_sessions WHERE expires_at <= datetime('now')`).run();
  }

  getUserGameStats(userId: number): { games_played: number; games_won: number } {
    const displayName = this.getUserById(userId)?.display_name;
    if (!displayName) return { games_played: 0, games_won: 0 };
    const row = this.db.prepare(
      `SELECT COALESCE(SUM(games_played), 0) as games_played, COALESCE(SUM(games_won), 0) as games_won FROM players WHERE nickname = ?`
    ).get(displayName) as { games_played: number; games_won: number };
    return row;
  }

  // ─── User Stats (Leaderboard) ───────────────────────────────────

  ensureUserStats(userId: number): void {
    this.db.prepare(
      `INSERT OR IGNORE INTO user_stats (user_id) VALUES (?)`
    ).run(userId);
  }

  updateUserStats(
    userId: number,
    data: {
      won: boolean;
      firstOut: boolean;
      tichuCalls: number;
      tichuSuccesses: number;
      grandTichuCalls: number;
      grandTichuSuccesses: number;
      doubleVictory: boolean;
      roundsPlayed: number;
      pointsScored: number;
      disconnected: boolean;
    }
  ): void {
    this.ensureUserStats(userId);
    this.db.prepare(`
      UPDATE user_stats SET
        games_played = games_played + 1,
        games_won = games_won + ?,
        games_lost = games_lost + ?,
        first_out_count = first_out_count + ?,
        tichu_calls = tichu_calls + ?,
        tichu_successes = tichu_successes + ?,
        grand_tichu_calls = grand_tichu_calls + ?,
        grand_tichu_successes = grand_tichu_successes + ?,
        double_victories = double_victories + ?,
        total_rounds = total_rounds + ?,
        total_points_scored = total_points_scored + ?,
        disconnects = disconnects + ?,
        updated_at = datetime('now')
      WHERE user_id = ?
    `).run(
      data.won ? 1 : 0,
      data.won ? 0 : 1,
      data.firstOut ? 1 : 0,
      data.tichuCalls,
      data.tichuSuccesses,
      data.grandTichuCalls,
      data.grandTichuSuccesses,
      data.doubleVictory ? 1 : 0,
      data.roundsPlayed,
      data.pointsScored,
      data.disconnected ? 1 : 0,
      userId
    );
  }

  updateUserRating(userId: number, rating: number): void {
    this.ensureUserStats(userId);
    this.db.prepare(
      `UPDATE user_stats SET rating = ?, updated_at = datetime('now') WHERE user_id = ?`
    ).run(rating, userId);
  }

  recordDisconnect(userId: number): void {
    this.ensureUserStats(userId);
    this.db.prepare(
      `UPDATE user_stats SET
        games_played = games_played + 1,
        games_lost = games_lost + 1,
        disconnects = disconnects + 1,
        updated_at = datetime('now')
      WHERE user_id = ?`
    ).run(userId);
  }

  getLeaderboard(limit: number = 50): Array<{
    user_id: number;
    username: string;
    display_name: string;
    games_played: number;
    games_won: number;
    games_lost: number;
    first_out_count: number;
    tichu_calls: number;
    tichu_successes: number;
    grand_tichu_calls: number;
    grand_tichu_successes: number;
    double_victories: number;
    total_rounds: number;
    disconnects: number;
    rating: number;
  }> {
    return this.db.prepare(`
      SELECT
        us.user_id, u.username, u.display_name,
        us.games_played, us.games_won, us.games_lost,
        us.first_out_count, us.tichu_calls, us.tichu_successes,
        us.grand_tichu_calls, us.grand_tichu_successes,
        us.double_victories, us.total_rounds, us.disconnects,
        us.rating
      FROM user_stats us
      JOIN users u ON u.id = us.user_id
      WHERE us.games_played >= 3
      ORDER BY us.rating DESC
      LIMIT ?
    `).all(limit) as ReturnType<TrackerDB['getLeaderboard']>;
  }

  getUserLeaderboardStats(userId: number): {
    user_id: number;
    games_played: number;
    games_won: number;
    games_lost: number;
    first_out_count: number;
    tichu_calls: number;
    tichu_successes: number;
    grand_tichu_calls: number;
    grand_tichu_successes: number;
    double_victories: number;
    total_rounds: number;
    disconnects: number;
    rating: number;
    rank: number;
  } | undefined {
    this.ensureUserStats(userId);
    const stats = this.db.prepare(`
      SELECT user_id, games_played, games_won, games_lost,
        first_out_count, tichu_calls, tichu_successes,
        grand_tichu_calls, grand_tichu_successes,
        double_victories, total_rounds, disconnects, rating
      FROM user_stats WHERE user_id = ?
    `).get(userId) as {
      user_id: number; games_played: number; games_won: number; games_lost: number;
      first_out_count: number; tichu_calls: number; tichu_successes: number;
      grand_tichu_calls: number; grand_tichu_successes: number;
      double_victories: number; total_rounds: number; disconnects: number; rating: number;
    } | undefined;
    if (!stats) return undefined;

    const rankRow = this.db.prepare(`
      SELECT COUNT(*) + 1 as rank FROM user_stats
      WHERE rating > (SELECT rating FROM user_stats WHERE user_id = ?)
      AND games_played >= 3
    `).get(userId) as { rank: number };

    return { ...stats, rank: stats.games_played >= 3 ? rankRow.rank : 0 };
  }

  getUserGameHistory(userId: number, limit: number = 5): Array<{
    game_id: number;
    ended_at: string;
    final_score_02: number;
    final_score_13: number;
    winner_team: string;
    player_position: number;
    bot_difficulty: string | null;
  }> {
    return this.db.prepare(`
      SELECT g.id as game_id, g.ended_at, g.final_score_02, g.final_score_13,
             g.winner_team, gp.position as player_position, g.bot_difficulty
      FROM games g
      JOIN game_players gp ON gp.game_id = g.id
      WHERE gp.user_id = ? AND g.ended_at IS NOT NULL
      ORDER BY g.ended_at DESC
      LIMIT ?
    `).all(userId, limit) as Array<{
      game_id: number;
      ended_at: string;
      final_score_02: number;
      final_score_13: number;
      winner_team: string;
      player_position: number;
      bot_difficulty: string | null;
    }>;
  }

  // ─── Friendships ────────────────────────────────────────────────

  sendFriendRequest(userId: number, friendId: number): { success: boolean; error?: string } {
    if (userId === friendId) return { success: false, error: 'Cannot add yourself' };

    // Check if any relationship already exists (either direction)
    const existing = this.db.prepare(
      `SELECT id, status, user_id FROM friendships
       WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)`
    ).get(userId, friendId, friendId, userId) as { id: number; status: string; user_id: number } | undefined;

    if (existing) {
      if (existing.status === 'accepted') return { success: false, error: 'Already friends' };
      if (existing.status === 'pending' && existing.user_id === userId) return { success: false, error: 'Request already sent' };
      if (existing.status === 'pending' && existing.user_id === friendId) {
        // They sent us a request — auto-accept
        this.db.prepare(`UPDATE friendships SET status = 'accepted' WHERE id = ?`).run(existing.id);
        return { success: true };
      }
    }

    // Limit pending outbound requests to prevent spam (max 50)
    const pendingCount = this.db.prepare(
      `SELECT COUNT(*) as c FROM friendships WHERE user_id = ? AND status = 'pending'`
    ).get(userId) as { c: number };
    if (pendingCount.c >= 50) {
      return { success: false, error: 'Too many pending requests' };
    }

    this.db.prepare(
      `INSERT INTO friendships (user_id, friend_id, status) VALUES (?, ?, 'pending')`
    ).run(userId, friendId);
    return { success: true };
  }

  acceptFriendRequest(userId: number, requesterId: number): boolean {
    const result = this.db.prepare(
      `UPDATE friendships SET status = 'accepted' WHERE user_id = ? AND friend_id = ? AND status = 'pending'`
    ).run(requesterId, userId);
    return result.changes > 0;
  }

  rejectFriendRequest(userId: number, requesterId: number): boolean {
    const result = this.db.prepare(
      `DELETE FROM friendships WHERE user_id = ? AND friend_id = ? AND status = 'pending'`
    ).run(requesterId, userId);
    return result.changes > 0;
  }

  removeFriend(userId: number, friendId: number): boolean {
    const result = this.db.prepare(
      `DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)`
    ).run(userId, friendId, friendId, userId);
    return result.changes > 0;
  }

  getFriends(userId: number): Array<{ id: number; username: string; displayName: string }> {
    return this.db.prepare(`
      SELECT u.id, u.username, u.display_name as displayName FROM users u
      WHERE u.id IN (
        SELECT friend_id FROM friendships WHERE user_id = ? AND status = 'accepted'
        UNION
        SELECT user_id FROM friendships WHERE friend_id = ? AND status = 'accepted'
      )
      ORDER BY u.display_name
    `).all(userId, userId) as Array<{ id: number; username: string; displayName: string }>;
  }

  getPendingRequests(userId: number): Array<{ id: number; username: string; displayName: string }> {
    return this.db.prepare(`
      SELECT u.id, u.username, u.display_name as displayName FROM users u
      JOIN friendships f ON f.user_id = u.id
      WHERE f.friend_id = ? AND f.status = 'pending'
      ORDER BY f.created_at DESC
    `).all(userId) as Array<{ id: number; username: string; displayName: string }>;
  }

  searchUsers(query: string, excludeUserId: number, limit: number = 10): Array<{ id: number; username: string; displayName: string }> {
    // Escape LIKE wildcard characters to prevent wildcard injection
    const escaped = query.replace(/[%_\\]/g, '\\$&');
    const pattern = `%${escaped}%`;
    return this.db.prepare(`
      SELECT id, username, display_name as displayName FROM users
      WHERE id != ? AND (username LIKE ? ESCAPE '\\' OR display_name LIKE ? ESCAPE '\\')
      LIMIT ?
    `).all(excludeUserId, pattern, pattern, limit) as Array<{ id: number; username: string; displayName: string }>;
  }

  getFriendshipStatus(userId: number, otherUserId: number): 'none' | 'friends' | 'pending_sent' | 'pending_received' {
    const row = this.db.prepare(
      `SELECT user_id, status FROM friendships
       WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)`
    ).get(userId, otherUserId, otherUserId, userId) as { user_id: number; status: string } | undefined;

    if (!row) return 'none';
    if (row.status === 'accepted') return 'friends';
    return row.user_id === userId ? 'pending_sent' : 'pending_received';
  }

  // ─── Profile ─────────────────────────────────────────────────────

  getFriendCount(userId: number): number {
    const row = this.db.prepare(`
      SELECT COUNT(*) as c FROM friendships
      WHERE (user_id = ? OR friend_id = ?) AND status = 'accepted'
    `).get(userId, userId) as { c: number };
    return row.c;
  }

  updateDisplayName(userId: number, displayName: string): void {
    this.db.prepare(
      `UPDATE users SET display_name = ?, display_name_changed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
    ).run(displayName, userId);
  }

  updateAvatar(userId: number, avatar: string): void {
    this.db.prepare(
      `UPDATE users SET avatar = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(avatar, userId);
  }

  // ─── Read-Only Query ─────────────────────────────────────────────

  runReadOnlyQuery(sql: string, limit: number = 200): { columns: string[]; rows: unknown[][]; rowCount: number } {
    const trimmed = sql.trim().replace(/;+$/, '');

    // Only allow SELECT and WITH (CTE) statements
    const firstWord = trimmed.split(/\s/)[0].toUpperCase();
    if (firstWord !== 'SELECT' && firstWord !== 'WITH') {
      throw new Error('Only SELECT queries are allowed');
    }

    // Block dangerous keywords that could appear inside CTEs or subqueries
    const forbidden = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|ATTACH|DETACH|REPLACE|PRAGMA)\b|pragma_/i;
    if (forbidden.test(trimmed)) {
      throw new Error('Query contains forbidden keywords');
    }

    const wrapped = `SELECT * FROM (${trimmed}) LIMIT ${limit}`;
    const stmt = this.db.prepare(wrapped);
    const rows = stmt.all() as Record<string, unknown>[];

    if (rows.length === 0) {
      return { columns: [], rows: [], rowCount: 0 };
    }

    const columns = Object.keys(rows[0]);
    const data = rows.map(r => columns.map(c => r[c]));
    return { columns, rows: data, rowCount: rows.length };
  }

  getTableInfo(): { name: string; rowCount: number }[] {
    const tables = this.db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
    ).all() as { name: string }[];
    return tables.map(t => {
      const count = (this.db.prepare(`SELECT COUNT(*) as c FROM "${t.name}"`).get() as { c: number }).c;
      return { name: t.name, rowCount: count };
    });
  }

  /** Run a function inside a SQLite transaction. Rolls back on error. */
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  close(): void {
    this.db.close();
  }
}
