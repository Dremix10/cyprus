import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TrackerDB } from '../Database.js';

describe('privacy retention (pruneOldPersonalData)', () => {
  let dir: string;
  let path: string;
  let db: TrackerDB;
  let raw: BetterSqlite3.Database;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cyprus-retention-'));
    path = join(dir, 'retention.db');
    db = new TrackerDB(path);
    raw = new BetterSqlite3(path);
  });

  afterEach(() => {
    raw.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const count = (sql: string) => (raw.prepare(sql).get() as { c: number }).c;

  it('deletes old connection and request logs and clears old IPs, keeping recent data and results', () => {
    raw.prepare(`INSERT INTO connections (socket_id, ip, connected_at) VALUES ('old', '1.1.1.1', datetime('now', '-13 months'))`).run();
    raw.prepare(`INSERT INTO connections (socket_id, ip, connected_at) VALUES ('new', '2.2.2.2', datetime('now', '-11 months'))`).run();
    raw.prepare(`INSERT INTO http_requests (path, ip, created_at) VALUES ('/old', '1.1.1.1', datetime('now', '-13 months'))`).run();
    raw.prepare(`INSERT INTO http_requests (path, ip, created_at) VALUES ('/new', '2.2.2.2', datetime('now'))`).run();
    raw.prepare(`INSERT INTO players (nickname, ip, last_seen) VALUES ('Old', '1.1.1.1', datetime('now', '-13 months'))`).run();
    raw.prepare(`INSERT INTO players (nickname, ip, last_seen) VALUES ('New', '2.2.2.2', datetime('now'))`).run();
    const oldGame = raw.prepare(`INSERT INTO games (room_code, started_at, winner_team) VALUES ('OLD', datetime('now', '-13 months'), 'Team A')`).run().lastInsertRowid;
    const newGame = raw.prepare(`INSERT INTO games (room_code, started_at, winner_team) VALUES ('NEW', datetime('now'), 'Team B')`).run().lastInsertRowid;
    raw.prepare(`INSERT INTO game_players (game_id, nickname, position, ip) VALUES (?, 'Old', 0, '1.1.1.1')`).run(oldGame);
    raw.prepare(`INSERT INTO game_players (game_id, nickname, position, ip) VALUES (?, 'New', 0, '2.2.2.2')`).run(newGame);

    const result = db.pruneOldPersonalData(12);

    expect(result).toEqual({ connections: 1, requests: 1, anonymized: 2 });
    expect(count(`SELECT COUNT(*) c FROM connections WHERE socket_id = 'new'`)).toBe(1);
    expect(count(`SELECT COUNT(*) c FROM connections`)).toBe(1);
    expect(count(`SELECT COUNT(*) c FROM http_requests WHERE path = '/new'`)).toBe(1);
    expect(count(`SELECT COUNT(*) c FROM http_requests`)).toBe(1);
    expect(count(`SELECT COUNT(*) c FROM players WHERE ip IS NULL`)).toBe(1);
    expect(count(`SELECT COUNT(*) c FROM players WHERE nickname = 'New' AND ip = '2.2.2.2'`)).toBe(1);
    expect(count(`SELECT COUNT(*) c FROM game_players WHERE nickname = 'Old' AND ip IS NULL`)).toBe(1);
    expect(count(`SELECT COUNT(*) c FROM game_players WHERE nickname = 'New' AND ip = '2.2.2.2'`)).toBe(1);
    // Game results stay for the leaderboard.
    expect(count(`SELECT COUNT(*) c FROM games`)).toBe(2);

    // Running it again changes nothing.
    expect(db.pruneOldPersonalData(12)).toEqual({ connections: 0, requests: 0, anonymized: 0 });
  });
});
