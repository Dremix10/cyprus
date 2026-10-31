#!/usr/bin/env node
// Seed a disposable local QA server for the iPhone Maestro flows.
//
//   QA_DB=$QA/packages/server/data/cyprus.db node apps/mobile/e2e/helpers/qa-seed.mjs
//
// - registers qa_host / qa_friend / qa_friend2 (password QA_PASSWORD, default qa-password-123)
// - makes qa_host friends with both
// - if QA_DB points at the QA server's SQLite file, also creates 14 leaderboard players with
//   >= 3 games each (written straight into user_stats) so the leaderboard list scrolls.
// Never point QA_DB at a production database.
import { BASE, USERS, befriend, ensureUser } from './qa-common.mjs';

const host = await ensureUser(USERS.host);
const friend = await ensureUser(USERS.friend);
const friend2 = await ensureUser(USERS.friend2);
await befriend(host, friend);
await befriend(host, friend2);
console.log(`users ok on ${BASE}: host=${host.user.id} friend=${friend.user.id} friend2=${friend2.user.id}`);

const dbPath = process.env.QA_DB;
if (dbPath) {
  if (!/qa-server|scratch|tmp/i.test(dbPath)) {
    console.error(`Refusing to write to ${dbPath}: QA_DB must be a disposable QA database path.`);
    process.exit(2);
  }
  const ids = [];
  for (let i = 1; i <= 14; i++) {
    const n = String(i).padStart(2, '0');
    const { user } = await ensureUser({ username: `lb_${n}`, displayName: `Ranked ${n}` });
    ids.push(user.id);
  }
  const { default: Database } = await import('better-sqlite3');
  const db = new Database(dbPath);
  const upsert = db.prepare(`
    INSERT INTO user_stats (user_id, games_played, games_won, games_lost, first_out_count, tichu_calls,
      tichu_successes, grand_tichu_calls, grand_tichu_successes, double_victories, total_rounds, elo, elo_peak, elo_games)
    VALUES (@id, @gp, @gw, @gl, @fo, @tc, @ts, 1, 0, 1, @rounds, @elo, @peak, @gp)
    ON CONFLICT(user_id) DO UPDATE SET games_played=@gp, games_won=@gw, games_lost=@gl, elo=@elo, elo_peak=@peak, elo_games=@gp
  `);
  const all = [...ids, host.user.id];
  all.forEach((id, i) => {
    const gp = 3 + i;
    const gw = Math.ceil(gp / 2);
    upsert.run({ id, gp, gw, gl: gp - gw, fo: i % 4, tc: 2, ts: 1, rounds: gp * 4, elo: 1250 - i * 15, peak: 1260 - i * 10 });
  });
  db.close();
  console.log(`leaderboard seeded: ${all.length} ranked players in ${dbPath}`);
}
