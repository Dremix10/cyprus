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
        email TEXT UNIQUE COLLATE NOCASE,
        google_id TEXT UNIQUE,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        locked_until TEXT,
        failed_login_attempts INTEGER DEFAULT 0,
        last_login_at TEXT
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

      CREATE INDEX IF NOT EXISTS idx_conn_ip ON connections(ip);
      CREATE INDEX IF NOT EXISTS idx_conn_at ON connections(connected_at);
      CREATE INDEX IF NOT EXISTS idx_conn_socket ON connections(socket_id);
      CREATE INDEX IF NOT EXISTS idx_players_nick ON players(nickname);
      CREATE INDEX IF NOT EXISTS idx_games_at ON games(started_at);
      CREATE INDEX IF NOT EXISTS idx_game_events_gid ON game_events(game_id);
      CREATE INDEX IF NOT EXISTS idx_http_at ON http_requests(created_at);
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);
      CREATE INDEX IF NOT EXISTS idx_reset_tokens_expires ON password_reset_tokens(expires_at);
    `);

    // ─── Migrations for existing databases ──────────────────────────
    // Add columns that may not exist yet (SQLite ADD COLUMN is safe if column exists → catch error)
    const migrations = [
      `ALTER TABLE users ADD COLUMN email TEXT UNIQUE COLLATE NOCASE`,
      `ALTER TABLE users ADD COLUMN google_id TEXT UNIQUE`,
    ];
    for (const sql of migrations) {
      try { this.db.exec(sql); } catch { /* column already exists */ }
    }

    // Indexes on migrated columns (must run after ALTER TABLE)
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_google ON users(google_id);
    `);
  }

  // ─── Connections ────────────────────────────────────────────────────

  logConnection(socketId: string, ip: string | null, userAgent: string | null): void {
    this.db.prepare(
      `INSERT INTO connections (socket_id, ip, user_agent) VALUES (?, ?, ?)`
    ).run(socketId, ip, userAgent);
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
    players: Array<{ nickname: string; position: number; isBot: boolean; ip: string | null }>
  ): number {
    const result = this.db.prepare(
      `INSERT INTO games (room_code, target_score, is_solo, bot_difficulty) VALUES (?, ?, ?, ?)`
    ).run(roomCode, targetScore, isSolo ? 1 : 0, botDifficulty);

    const gameId = Number(result.lastInsertRowid);
    const stmt = this.db.prepare(
      `INSERT INTO game_players (game_id, nickname, position, is_bot, ip) VALUES (?, ?, ?, ?, ?)`
    );

    for (const p of players) {
      stmt.run(gameId, p.nickname, p.position, p.isBot ? 1 : 0, p.ip);
    }

    return gameId;
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
  } | undefined {
    return this.db.prepare(
      `SELECT id, username, display_name, created_at, last_login_at, email FROM users WHERE id = ?`
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

  // ─── Read-Only Query ─────────────────────────────────────────────

  runReadOnlyQuery(sql: string, limit: number = 200): { columns: string[]; rows: unknown[][]; rowCount: number } {
    const trimmed = sql.trim().replace(/;+$/, '');

    // Only allow SELECT and WITH (CTE) statements
    const firstWord = trimmed.split(/\s/)[0].toUpperCase();
    if (firstWord !== 'SELECT' && firstWord !== 'WITH') {
      throw new Error('Only SELECT queries are allowed');
    }

    // Block dangerous keywords that could appear inside CTEs or subqueries
    const forbidden = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|ATTACH|DETACH|REPLACE|PRAGMA\s+(?!.*=))\b/i;
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

  close(): void {
    this.db.close();
  }
}
