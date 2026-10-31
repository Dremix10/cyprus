import { request as pwRequest, type APIRequestContext, type BrowserContext } from '@playwright/test';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const E2E_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const REPO_ROOT = path.resolve(E2E_ROOT, '../..');
export const QA_DB_PATH = path.join(E2E_ROOT, '.qa-server/packages/server/data/cyprus.db');
export const SCREENSHOT_DIR = path.join(E2E_ROOT, 'screenshots');

let ipCounter = Math.floor(Math.random() * 200);

/**
 * Auth endpoints allow 5 requests/min per IP. The server trusts one proxy
 * hop, so a distinct X-Forwarded-For per request keeps QA out of that limit.
 */
export function uniqueIp(): string {
  ipCounter += 1;
  const n = (process.pid % 200) * 65536 + ipCounter;
  return `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;
}

export function uniqueName(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 7);
  return `${prefix}${rand}`.slice(0, 20);
}

export type TestUser = {
  id: number;
  username: string;
  displayName: string;
  password: string;
};

export async function newApi(baseURL: string): Promise<APIRequestContext> {
  return pwRequest.newContext({ baseURL });
}

/** Register a user. The returned request context holds that user's auth cookie. */
export async function registerUser(
  baseURL: string,
  opts: { prefix?: string; displayName?: string } = {},
): Promise<{ user: TestUser; api: APIRequestContext }> {
  const api = await newApi(baseURL);
  const username = uniqueName(opts.prefix ?? 'qa_');
  const password = 'qa-password-123';
  const displayName = opts.displayName ?? username;
  const res = await api.post('/auth/register', {
    headers: { 'X-Forwarded-For': uniqueIp() },
    data: { username, password, displayName, email: `${username}@example.test` },
  });
  if (res.status() !== 201) {
    throw new Error(`register ${username} failed: ${res.status()} ${await res.text()}`);
  }
  const body = await res.json();
  return { user: { id: body.user.id, username, displayName, password }, api };
}

/** Log a browser context in through the REST API (shares the context's cookie jar). */
export async function loginContext(context: BrowserContext, user: TestUser): Promise<void> {
  const res = await context.request.post('/auth/login', {
    headers: { 'X-Forwarded-For': uniqueIp() },
    data: { username: user.username, password: user.password },
  });
  if (!res.ok()) throw new Error(`login ${user.username} failed: ${res.status()} ${await res.text()}`);
}

/** A sends a friend request, B accepts it. */
export async function makeFriends(
  a: { user: TestUser; api: APIRequestContext },
  b: { user: TestUser; api: APIRequestContext },
): Promise<void> {
  const sent = await a.api.post('/api/friends/request', { data: { friendId: b.user.id } });
  if (!sent.ok()) throw new Error(`friend request failed: ${sent.status()} ${await sent.text()}`);
  const accepted = await b.api.post('/api/friends/accept', { data: { userId: a.user.id } });
  if (!accepted.ok()) throw new Error(`friend accept failed: ${accepted.status()} ${await accepted.text()}`);
}

/**
 * better-sqlite3 is a native module; reuse the copy the repo already built
 * instead of compiling another one inside e2e/web.
 */
export function openQaDb(): any {
  const require = createRequire(path.join(REPO_ROOT, 'package.json'));
  const Database = require('better-sqlite3');
  const db = new Database(QA_DB_PATH);
  db.pragma('busy_timeout = 5000');
  return db;
}

/** Insert `count` users that qualify for the leaderboard (games_played >= 3). */
export function seedLeaderboard(count: number, prefix = 'lb'): string[] {
  const db = openQaDb();
  const names: string[] = [];
  try {
    const insertUser = db.prepare(
      'INSERT INTO users (username, display_name, password_hash, email) VALUES (?, ?, NULL, NULL)',
    );
    const insertStats = db.prepare(
      `INSERT OR REPLACE INTO user_stats
         (user_id, games_played, games_won, games_lost, first_out_count, tichu_calls, tichu_successes,
          grand_tichu_calls, grand_tichu_successes, double_victories, total_rounds, rating, elo, elo_peak, elo_games)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const tx = db.transaction(() => {
      for (let i = 0; i < count; i++) {
        const username = `${prefix}${String(i).padStart(3, '0')}_${Math.random().toString(36).slice(2, 6)}`;
        const info = insertUser.run(username, username);
        const played = 5 + i;
        const won = Math.floor(played / 2);
        insertStats.run(info.lastInsertRowid, played, won, played - won, i % 4, 2, 1, 1, 0, i % 3, played * 3, 0, 1400 - i * 5, 1450 - i * 5, played);
        names.push(username);
      }
    });
    tx();
  } finally {
    db.close();
  }
  return names;
}

export type SeededResult = 'win' | 'loss' | 'tie';

/**
 * Give a user finished games (newest first in `results`) plus a stats row, so the
 * leaderboard shows "Your Stats" with the recent-games badges. The user sits at
 * position 0 (team 0-2) in every game.
 */
export function seedGameHistory(userId: number, results: SeededResult[]): void {
  const db = openQaDb();
  try {
    const insertGame = db.prepare(
      `INSERT INTO games (room_code, started_at, ended_at, target_score, is_solo, bot_difficulty,
                          final_score_02, final_score_13, winner_team, rounds_played)
       VALUES (?, datetime('now', ?), datetime('now', ?), 500, 0, NULL, ?, ?, ?, 3)`,
    );
    const insertPlayer = db.prepare(
      'INSERT INTO game_players (game_id, nickname, position, is_bot, ip, user_id) VALUES (?, ?, 0, 0, NULL, ?)',
    );
    const insertStats = db.prepare(
      `INSERT OR REPLACE INTO user_stats (user_id, games_played, games_won, games_lost, elo, elo_peak, elo_games)
       VALUES (?, ?, ?, ?, 1000, 1000, ?)`,
    );
    const tx = db.transaction(() => {
      results.forEach((result, i) => {
        const [mine, theirs, winner] =
          result === 'win' ? [520, 300, 'Team 0-2'] : result === 'loss' ? [300, 520, 'Team 1-3'] : [400, 400, 'Tie'];
        // Newest first: game i ended i hours ago.
        const game = insertGame.run('QATI', `-${i + 1} hours`, `-${i} hours`, mine, theirs, winner);
        insertPlayer.run(game.lastInsertRowid, `qa${userId}`, userId);
      });
      const won = results.filter((r) => r === 'win').length;
      const lost = results.filter((r) => r === 'loss').length;
      insertStats.run(userId, results.length, won, lost, results.length);
    });
    tx();
  } finally {
    db.close();
  }
}
