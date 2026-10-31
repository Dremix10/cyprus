import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TrackerDB } from '../Database.js';

const base = {
  firstOut: false,
  tichuCalls: 0,
  tichuSuccesses: 0,
  grandTichuCalls: 0,
  grandTichuSuccesses: 0,
  doubleVictory: false,
  roundsPlayed: 1,
  pointsScored: 50,
  disconnected: false,
};

describe('user stats', () => {
  let dir: string;
  let db: TrackerDB;
  let userId: number;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cyprus-user-stats-'));
    db = new TrackerDB(join(dir, 'stats.db'));
    userId = db.createUser('stats_user', 'Stats', null);
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('counts a win and a loss', () => {
    db.updateUserStats(userId, { ...base, won: true });
    db.updateUserStats(userId, { ...base, won: false });
    expect(db.getUserLeaderboardStats(userId)).toMatchObject({ games_played: 2, games_won: 1, games_lost: 1 });
  });

  it('counts a tied quick game as played, but neither won nor lost', () => {
    db.updateUserStats(userId, { ...base, won: false, tied: true });
    expect(db.getUserLeaderboardStats(userId)).toMatchObject({ games_played: 1, games_won: 0, games_lost: 0 });
  });
});
