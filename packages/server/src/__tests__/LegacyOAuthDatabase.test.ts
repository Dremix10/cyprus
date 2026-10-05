import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { TrackerDB } from '../Database.js';
import { AuthService } from '../AuthService.js';

// Match the original production users table, before passwordless providers.
function legacyDatabase(path: string) {
  const db = new BetterSqlite3(path);
  db.exec(`CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    locked_until TEXT,
    failed_login_attempts INTEGER DEFAULT 0,
    last_login_at TEXT
  )`);
  db.close();
}

describe('OAuth on the legacy production database', () => {
  it.each(['apple', 'google'] as const)('creates a passwordless %s account without rebuilding users', async (provider) => {
    const dir = mkdtempSync(join(tmpdir(), 'cyprus-legacy-auth-'));
    const path = join(dir, 'legacy.db');
    legacyDatabase(path);
    const db = new TrackerDB(path);
    try {
      const auth = new AuthService(db);
      const local = await auth.register('existing', 'password123', 'Existing', 'existing@example.com');
      expect(local).toHaveProperty('user');
      const result = provider === 'apple'
        ? await auth.loginWithApple('apple-sub', 'apple@example.com', 'Apple', null, null)
        : await auth.loginWithGoogle('google-sub', 'google@example.com', 'Google', null, null);
      expect(result.user.hasPassword).toBe(false);
      expect(result.user[provider === 'apple' ? 'hasApple' : 'hasGoogle']).toBe(true);
      expect(auth.validateSession(result.token)?.userId).toBe(result.user.id);
      expect(await auth.login(result.user.username, '', null, null)).toHaveProperty('error');
      expect(await auth.login('existing', 'password123', null, null)).toHaveProperty('token');
      const again = provider === 'apple'
        ? await auth.loginWithApple('apple-sub', null, null, null, null)
        : await auth.loginWithGoogle('google-sub', 'google@example.com', 'Google', null, null);
      expect(again.user.id).toBe(result.user.id);
    } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
  });
});
