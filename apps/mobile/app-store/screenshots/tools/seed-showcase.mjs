#!/usr/bin/env node
// Seed the screenshot server (port 3321) with a realistic-looking community.
//
//   SHOTS_DB=$SHOTS_QA/packages/server/data/cyprus.db node seed-showcase.mjs [--reset-bots]
//   (or simply: shots-server.sh seed)
//
// - registers the showcase account (andreas_cy / "Andreas") and 17 Greek-named regulars
// - makes Andreas friends with 6 of them (3 are kept online by friends-online.mjs)
// - writes ELO / stats straight into user_stats so the leaderboard looks lived-in
// - writes ~8 finished games for Andreas so "Recent" shows wins and losses (online + vs bots)
// - --reset-bots hides the bot rows again (solo games played during capture give bots ELO)
// Idempotent: run it again any time. Never point SHOTS_DB at a real database.
import { BASE, PLAYERS, SHOWCASE, befriend, ensureUser, http } from './shots-common.mjs';

const dbPath = process.env.SHOTS_DB;
if (!dbPath || !/titsu-shots-server|scratch|tmp/i.test(dbPath)) {
  console.error(`Refusing: SHOTS_DB must point at the disposable screenshot DB (got ${dbPath ?? 'nothing'}).`);
  process.exit(2);
}

const me = await ensureUser(SHOWCASE);
await http('/auth/change-avatar', { method: 'POST', token: me.token, body: { avatar: SHOWCASE.avatar } });

const users = [];
for (const p of PLAYERS) {
  const u = await ensureUser(p);
  await http('/auth/change-avatar', { method: 'POST', token: u.token, body: { avatar: p.avatar } });
  users.push({ ...p, ...u });
}
for (const u of users.filter((x) => x.friend)) await befriend(me, u);
console.log(`users ok on ${BASE}: showcase id=${me.user.id}, ${users.length} regulars, ${users.filter((x) => x.friend).length} friends`);

const { default: Database } = await import('better-sqlite3');
const db = new Database(dbPath);

// ── Leaderboard stats ────────────────────────────────────────────────
const upsert = db.prepare(`
  INSERT INTO user_stats (user_id, games_played, games_won, games_lost, first_out_count, tichu_calls,
    tichu_successes, grand_tichu_calls, grand_tichu_successes, double_victories, total_rounds,
    total_points_scored, elo, elo_peak, elo_games)
  VALUES (@id, @gp, @gw, @gl, @fo, @tc, @ts, @gc, @gs, @dv, @rounds, @pts, @elo, @peak, @gp)
  ON CONFLICT(user_id) DO UPDATE SET games_played=@gp, games_won=@gw, games_lost=@gl, first_out_count=@fo,
    tichu_calls=@tc, tichu_successes=@ts, grand_tichu_calls=@gc, grand_tichu_successes=@gs,
    double_victories=@dv, total_rounds=@rounds, total_points_scored=@pts, elo=@elo, elo_peak=@peak, elo_games=@gp
`);
const statsFor = (id, gp, wr, elo, peakBonus) => {
  const gw = Math.round(gp * wr);
  const rounds = gp * 7;
  const tc = Math.round(rounds * 0.09);
  const gc = Math.round(rounds * 0.025);
  return {
    id, gp, gw, gl: gp - gw,
    fo: Math.round(rounds * 0.27), tc, ts: Math.round(tc * 0.72), gc, gs: Math.round(gc * 0.55),
    dv: Math.round(rounds * 0.06), rounds, pts: rounds * 52, elo, peak: elo + peakBonus,
  };
};
db.transaction(() => {
  users.forEach((u, i) => upsert.run(statsFor(u.user.id, u.gp, u.wr, u.elo, 12 + ((i * 7) % 40))));
  upsert.run(statsFor(me.user.id, 168, 0.56, 1498, 33));
})();

// ── Recent games for the showcase account ────────────────────────────
// winner_team strings must match index.ts (/api/leaderboard/history): 'Team 0-2' | 'Team 1-3' | 'Tie'.
const byName = Object.fromEntries(users.map((u) => [u.username, u]));
const GAMES = [
  // [hoursAgo, target, solo, botDifficulty, myScore, theirScore, partner, opp1, opp2]
  [3, 500, 0, null, 535, 410, 'maria_p', 'stelios_k', 'georgia_n'],
  [5, 1000, 1, 'hard', 1015, 780, 'Bot Athena', 'Bot Zeus', 'Bot Apollo'],
  [26, 500, 0, null, 380, 505, 'kostas_lim', 'panikos', 'eleni_ch'],
  [29, 500, 0, null, 520, 300, 'panikos', 'michalis_v', 'sofia_a'],
  [50, 250, 1, 'extreme', 190, 265, 'Bot Athena', 'Bot Zeus', 'Bot Apollo'],
  [74, 500, 0, null, 610, 395, 'maria_p', 'nikos_thess', 'christos_m'],
  [98, 1000, 0, null, 1040, 860, 'loukia', 'dimitra', 'pavlos_k'],
  [122, 500, 0, null, 455, 515, 'eleni_ch', 'stelios_k', 'katerina_r'],
];
const insGame = db.prepare(`
  INSERT INTO games (room_code, started_at, ended_at, target_score, is_solo, bot_difficulty,
    final_score_02, final_score_13, winner_team, rounds_played)
  VALUES (@code, datetime('now', @start), datetime('now', @end), @target, @solo, @diff, @s02, @s13, @winner, @rounds)
`);
const insPlayer = db.prepare(`
  INSERT INTO game_players (game_id, nickname, position, is_bot, ip, user_id) VALUES (?, ?, ?, ?, '127.0.0.1', ?)
`);
db.transaction(() => {
  // Wipe earlier seeded games for Andreas so re-runs stay at exactly these.
  db.prepare(`DELETE FROM game_players WHERE game_id IN (SELECT id FROM games WHERE room_code LIKE 'SHW%')`).run();
  db.prepare(`DELETE FROM games WHERE room_code LIKE 'SHW%'`).run();
  GAMES.forEach(([hoursAgo, target, solo, diff, mine, theirs, partner, o1, o2], i) => {
    const { lastInsertRowid } = insGame.run({
      code: `SHW${i}`,
      start: `-${hoursAgo + 1} hours`,
      end: `-${hoursAgo} hours`,
      target, solo, diff,
      s02: mine, s13: theirs,
      winner: mine > theirs ? 'Team 0-2' : 'Team 1-3',
      rounds: Math.max(1, Math.round(target / 120)),
    });
    const seat = (name, pos) => {
      const u = byName[name];
      insPlayer.run(lastInsertRowid, u ? u.displayName : name, pos, u ? 0 : 1, u ? u.user.id : null);
    };
    insPlayer.run(lastInsertRowid, SHOWCASE.displayName, 0, 0, me.user.id);
    seat(o1, 1);
    seat(partner, 2);
    seat(o2, 3);
  });
})();

if (process.argv.includes('--reset-bots')) {
  db.prepare(`UPDATE bot_elo SET elo_games = 0, games_won = 0, elo = 1000, elo_peak = 1000`).run();
  console.log('bot rows hidden from the leaderboard');
}
db.close();

const lb = await http('/api/leaderboard?limit=30');
const hist = await http('/api/leaderboard/history', { token: me.token });
console.log(`leaderboard rows: ${Array.isArray(lb.json) ? lb.json.length : lb.status}; Andreas recent games: ${Array.isArray(hist.json) ? hist.json.length : hist.status}`);
console.log(`sign in on the simulator as ${SHOWCASE.username} / (SHOTS_PASSWORD, default showcase-pass-123)`);
