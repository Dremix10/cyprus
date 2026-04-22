# Testing Notes — Bugfix Session 2026-04-22

Scratch file for tracking in-progress testing of the 6 fixes shipped on
commit `1dab7c2` (branch `dev`). Delete or clear when fully deployed.

## What to check

| # | Fix | How to verify |
|---|---|---|
| 2 | Leaderboard: solo counts for auth users | After a solo game, `user_stats.games_played` increments; `rating` does not. |
| 3 | Drain deploy | `POST /admin/api/drain` → banner appears; new rooms blocked; `drain-status` returns active count. |
| 4 | Phoenix rank label (partner's fix) | 22+77+Phx shows **7**; straight 10-J-Q-K-A+Phx shows Phoenix as **9** (extends down from Ace). |
| 5 | Disconnect countdown 30s, turn-gated | Only visible when it's the disconnected player's turn; cancels on reclaim; 30s to bot replacement. |
| 6 | Auto-pass | Fires after ~900ms when hand has no legal play; respects wish/bomb/leading constraints. |

(Issue #1 profile pics — deferred to backlog in CLAUDE.md.)

## Test session log

Log observations here as games are played. Format: `HH:MM — game context — observation`.

- _(awaiting gameplay)_

## Follow-up work surfaced during testing

- **uncaughtException EPIPE loop (dev-only)** — index.ts:326 logs via
  `console.error` inside the handler. If stdout pipe breaks (e.g. parent
  `concurrently` process killed), write EPIPE → re-fires handler → 100%
  CPU. Production is safe (nohup → file), but should wrap in try/catch
  or use `process._rawDebug` to harden. Repro: `pkill concurrently` while
  server is child process.

- **Grand Tichu phase timer missing** — in multiplayer, the initial 8-card
  Grand Tichu decision has no deadline. If a player doesn't decide, the
  game stalls forever. Add a timer (probably 30s) that auto-decides
  "no tichu" for any human who hasn't decided. Requires server change
  (TimerManager + BotController hookup + broadcastGameState call-site),
  so ship between games.
- **Auto-pass → pass highlight in multiplayer** ✓ SHIPPED — `.btn-pass-recommended`
  glow on the Pass button when `mustPass && !isSolo`. Client-only, no
  info leak to opponents.
- **Solo-only auto-pass** ✓ SHIPPED — gate on `gameState.isSolo`.

## Post-session audit queries

When the user asks me to audit after some games, I'll run these against
the local dev DB (or prod via the API) to look for anomalies.

### Recent games + who played
```sql
SELECT g.id, g.room_code, g.started_at, g.ended_at, g.is_solo,
       g.final_score_02, g.final_score_13, g.winner_team, g.rounds_played,
       (SELECT GROUP_CONCAT(nickname, '|') FROM game_players WHERE game_id = g.id) AS players
FROM games g
WHERE g.started_at > datetime('now', '-3 hours')
ORDER BY g.started_at DESC;
```

### User stats delta (look at rating/games/elo)
```sql
SELECT u.username, us.games_played, us.games_won, us.games_lost,
       us.rating, us.elo, us.elo_games, us.tichu_calls, us.tichu_successes,
       us.disconnects, us.updated_at
FROM users u JOIN user_stats us ON us.user_id = u.id
WHERE us.updated_at > datetime('now', '-3 hours');
```

### Errors + anomalies in logs
```sql
SELECT level, category, message, created_at
FROM server_logs
WHERE level IN ('error','warn') AND created_at > datetime('now', '-3 hours')
ORDER BY created_at DESC
LIMIT 50;
```

### Game events — scan for bugs
- `BOMB` events in solo games (should still work)
- `PLAYER_OUT` events (trick cards handoff after partner fix)
- `GAME_OVER` events — winner_team matches final scores?
- Unusual `TURN_PASS` clusters (may indicate auto-pass misfires)

```sql
SELECT event_type, COUNT(*) as n
FROM game_events
WHERE created_at > datetime('now', '-3 hours')
GROUP BY event_type
ORDER BY n DESC;
```

### Specific checks per fix

**#2 Leaderboard solo** — did solo games update user_stats?
```sql
SELECT g.id, g.is_solo, gp.user_id, us.games_played
FROM games g
JOIN game_players gp ON gp.game_id = g.id
LEFT JOIN user_stats us ON us.user_id = gp.user_id
WHERE g.is_solo = 1 AND g.ended_at > datetime('now', '-3 hours');
```

**#6 Auto-pass** — look for quick successive PASS events where hand was empty-for-beating
```sql
SELECT game_id, player_position, data, created_at
FROM game_events
WHERE event_type = 'TURN_PASS' AND created_at > datetime('now', '-3 hours')
ORDER BY created_at DESC
LIMIT 50;
```

## Findings / bugs spotted

_(Claude to fill in after audit.)_
