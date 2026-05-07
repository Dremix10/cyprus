# Database Schema Reference

SQLite via `better-sqlite3`. Single file at `packages/server/data/cyprus.db` (with WAL
sidecar files). Schema is created in `TrackerDB.init` in
[`packages/server/src/Database.ts`](../packages/server/src/Database.ts).

WAL mode is enabled (`journal_mode = WAL`) and foreign keys are on (`foreign_keys = ON`).

## Tables

### `connections`

Every WebSocket connection. Used for traffic / auditing.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK AUTO | |
| `socket_id` | TEXT NOT NULL | Socket.IO socket id |
| `ip` | TEXT | from X-Forwarded-For |
| `user_agent` | TEXT | |
| `connected_at` | TEXT | default `datetime('now')` |
| `disconnected_at` | TEXT NULL | |
| `nickname` | TEXT NULL | populated when known |
| `room_code` | TEXT NULL | populated when known |
| `user_id` | INTEGER NULL | linked auth user (added via migration) |

Indexes: `idx_conn_ip`, `idx_conn_at`, `idx_conn_socket`.

### `players`

Guest player tracking by `(nickname, ip)`. Pre-auth-system stat aggregation.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK AUTO | |
| `nickname` | TEXT NOT NULL | |
| `ip` | TEXT | |
| `first_seen` | TEXT | |
| `last_seen` | TEXT | |
| `games_played` | INTEGER | |
| `games_won` | INTEGER | |
| UNIQUE | `(nickname, ip)` | |

### `games`

One row per game (multiple rounds). Inserted on game start, updated on game end.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK AUTO | |
| `room_code` | TEXT NOT NULL | |
| `started_at` | TEXT | |
| `ended_at` | TEXT NULL | NULL while game in progress |
| `target_score` | INTEGER | usually 1000 |
| `is_solo` | INTEGER | 1 if 3 bots |
| `bot_difficulty` | TEXT NULL | only set when bots present |
| `final_score_02` | INTEGER NULL | team 0+2's final score |
| `final_score_13` | INTEGER NULL | team 1+3's final score |
| `winner_team` | TEXT NULL | `'Team 0-2' \| 'Team 1-3' \| 'Abandoned'` |
| `rounds_played` | INTEGER | |

### `game_players`

One row per seat per game.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK AUTO | |
| `game_id` | INTEGER NOT NULL FK → games.id | |
| `nickname` | TEXT NOT NULL | |
| `position` | INTEGER NOT NULL | 0..3 |
| `is_bot` | INTEGER | |
| `ip` | TEXT NULL | |
| `user_id` | INTEGER NULL | linked auth user (added via migration) |

### `game_events`

Every action in every game. **The single biggest data asset.**

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK AUTO | |
| `game_id` | INTEGER FK → games.id | |
| `room_code` | TEXT | denormalized for queries |
| `event_type` | TEXT NOT NULL | `PLAY \| PASS \| BOMB \| TICHU_CALL \| GRAND_TICHU_CALL \| TRICK_WON \| DRAGON_GIVEN \| WISH_MADE \| WISH_FULFILLED \| PLAYER_OUT \| ROUND_END \| GAME_OVER` |
| `player_position` | INTEGER NULL | 0..3 |
| `data` | TEXT NULL | JSON payload — see below |
| `created_at` | TEXT | |

Indexes: `idx_game_events_gid`.

#### `data` JSON shape

For PLAY / BOMB events:
```json
{
  "combination": { "type": "FULL_HOUSE", "rank": 14, "length": 5,
                   "cards": [{...Card}, ...] },
  "bot": { ... }   // only present when player was a bot
}
```

For PASS events:
```json
{
  "bot": { ... }   // only present when player was a bot
}
```

For WISH_MADE: `{ "rank": 6 }`. For DRAGON_GIVEN: `{ "to": 1 }`. For PLAYER_OUT:
`{ "place": 1 }`. For ROUND_END: `{ "roundScores": [N, N], "totalScores": [N, N] }`.

#### `data.bot` shape (for bot PLAY/PASS/BOMB)

```json
{
  "tier": "unfair",
  "branchTag": "follow:smart-select",
  "hand": ["JADE_3", "STAR_3", ...],
  "trickTop": { "type": "SINGLE", "rank": 13, "length": 1 },
  "trickPoints": 10,
  "oppCardCounts": {"0": 14, "1": 13, "2": 14, "3": 14},
  "tichuCalls": {"0": "grand_tichu", "1": "none", "2": "none", "3": "none"},
  "currentTrickPlays": [
    { "position": 1, "cards": ["SWORD_13"], "comboType": "SINGLE", "rank": 13 }
  ],
  "currentWinner": 1,
  "passCount": 0,
  "wish": { "active": true, "wishedRank": 2 },
  "finishOrder": [],
  "scores": [0, 0]
}
```

This is everything needed to reconstruct full engine state for MC cross-check or replay.

### `server_logs`

Free-form server telemetry from `GameMonitor`.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK AUTO | |
| `level` | TEXT | `info | warn | error` |
| `category` | TEXT | e.g. `server`, `room`, `bot`, `auditor` |
| `message` | TEXT | |
| `room_code` | TEXT NULL | |
| `user_id` | INTEGER NULL | |
| `data` | TEXT NULL | JSON |
| `created_at` | TEXT | |

### `http_requests`

HTTP request log (skip the auth/admin/static-asset paths).

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK AUTO | |
| `method` | TEXT | |
| `path` | TEXT | |
| `ip` | TEXT NULL | |
| `user_agent` | TEXT NULL | |
| `status_code` | INTEGER | |
| `response_time_ms` | INTEGER | |
| `created_at` | TEXT | |

### `admin_sessions`

Admin dashboard sessions.

| Column | Type | Notes |
|---|---|---|
| `token` | TEXT PK | |
| `created_at` | TEXT | |
| `expires_at` | TEXT NOT NULL | |

### `users`

Authenticated users.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK AUTO | |
| `username` | TEXT UNIQUE COLLATE NOCASE | |
| `display_name` | TEXT NOT NULL | shown in-game; can differ from username |
| `password_hash` | TEXT NULL | scrypt-hashed; NULL for Google-only users |
| `email` | TEXT NULL COLLATE NOCASE | |
| `google_id` | TEXT NULL | |
| `created_at` | TEXT | |
| `updated_at` | TEXT | |
| `locked_until` | TEXT NULL | account lockout (5 fails → 15 min) |
| `failed_login_attempts` | INTEGER | |
| `last_login_at` | TEXT NULL | |
| `avatar` | TEXT NULL | path to chosen avatar |
| `display_name_changed_at` | TEXT NULL | for rate-limiting renames |
| `language` | TEXT NULL | `en | el` |

### `user_sessions`

HttpOnly cookie sessions.

| Column | Type | Notes |
|---|---|---|
| `token` | TEXT PK | SHA-256 hashed before storage |
| `user_id` | INTEGER NOT NULL FK → users.id ON DELETE CASCADE | |
| `created_at` | TEXT | |
| `expires_at` | TEXT NOT NULL | 7-day default |
| `ip` | TEXT NULL | |
| `user_agent` | TEXT NULL | |

Max 10 sessions per user; oldest evicted.

### `password_reset_tokens`

Forgot-password flow.

| Column | Type | Notes |
|---|---|---|
| `token_hash` | TEXT PK | SHA-256 hashed |
| `user_id` | INTEGER NOT NULL FK → users.id ON DELETE CASCADE | |
| `created_at` | TEXT | |
| `expires_at` | TEXT NOT NULL | 1-hour TTL |
| `used` | INTEGER | one-shot |

### `ai_reviews` and `review_queue`

Experimental AI-game-review pipeline.

`ai_reviews`: `id, game_id (FK), room_code, status, summary, findings, created_at`.
`review_queue`: `id, game_id, room_code, queued_at, processed`.

### `user_stats`

Per-user aggregate stats. Updated after every finished game.

| Column | Type | Notes |
|---|---|---|
| `user_id` | INTEGER PK FK → users.id | |
| `games_played` | INTEGER | |
| `games_won` | INTEGER | |
| `games_lost` | INTEGER | |
| `first_out_count` | INTEGER | |
| `tichu_calls` | INTEGER | |
| `tichu_successes` | INTEGER | |
| `grand_tichu_calls` | INTEGER | |
| `grand_tichu_successes` | INTEGER | |
| `double_victories` | INTEGER | |
| `total_rounds` | INTEGER | |
| `total_points_scored` | INTEGER | |
| `disconnects` | INTEGER | |
| `rating` | REAL | legacy pre-ELO score |
| `elo` | INTEGER | default 1000 |
| `elo_peak` | INTEGER | |
| `elo_games` | INTEGER | |
| `updated_at` | TEXT | |

### `bot_elo`

Bot ELO ratings, one row per difficulty tier.

| Column | Type | Notes |
|---|---|---|
| `difficulty` | TEXT PK | e.g. `'easy'`, `'medium'`, … |
| `elo` | INTEGER NOT NULL | |
| `elo_peak` | INTEGER NOT NULL | |
| `elo_games` | INTEGER NOT NULL | |
| `games_won` | INTEGER NOT NULL | |
| `updated_at` | TEXT | |

### `friendships`

Friend relationships.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK AUTO | |
| `user_id` | INTEGER FK → users.id | |
| `friend_id` | INTEGER FK → users.id | |
| `status` | TEXT | `'pending' | 'accepted' | 'rejected' | 'blocked'` |
| `created_at` | TEXT | |
| `responded_at` | TEXT NULL | |

(Note: this table is created by a separate migration block; check `Database.ts` lines
~234 onwards.)

### `bot_play_reports`

Player flags for "this bot play looked wrong."

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK AUTO | |
| `game_event_id` | INTEGER NOT NULL FK → game_events.id | |
| `reporter_user_id` | INTEGER NOT NULL FK → users.id | |
| `branch_tag` | TEXT NULL | denormalized from event.data.bot.branchTag for fast grouping |
| `bot_tier` | TEXT NULL | denormalized from event.data.bot.tier |
| `mc_agrees` | INTEGER NULL | reserved for future MC cross-check (0/1/null) |
| `mc_picked` | TEXT NULL | reserved for future MC cross-check (JSON of card ids) |
| `review_status` | TEXT | admin classification: `unreviewed`, `valid_mistake`, `probably_ok`, `unclear`, `needs_replay`, or `duplicate` |
| `review_note` | TEXT NULL | optional admin note explaining the classification |
| `reviewed_at` | TEXT NULL | timestamp when the report was classified |
| `reviewed_by` | TEXT NULL | admin identifier, currently `admin` |
| `created_at` | TEXT | |
| UNIQUE | `(game_event_id, reporter_user_id)` | dedup |

Indexes: `idx_bot_reports_event`, `idx_bot_reports_branch`, `idx_bot_reports_at`,
`idx_bot_reports_review_status`.

### `game_event_snapshots`

Private admin replay snapshots for bot-report testing. These are keyed by event id and
are **not** sent through Socket.IO to players.

| Column | Type | Notes |
|---|---|---|
| `game_event_id` | INTEGER PK FK → game_events.id | event whose pre-action state was captured |
| `snapshot` | TEXT NOT NULL | JSON: phase, scores, trick state, all player hands, tichu calls, pending flags |
| `created_at` | TEXT | |

Only events logged after this table was added have full-hand snapshots. Older bot reports
fall back to the reported bot's hand from `game_events.data.bot.hand`.

## Migrations

Migrations are appended to the `addColumnMigrations` list in `Database.init`:

```ts
const addColumnMigrations = [
  `ALTER TABLE users ADD COLUMN email TEXT COLLATE NOCASE`,
  ...
];
for (const sql of addColumnMigrations) {
  try { this.db.exec(sql); } catch { /* column already exists */ }
}
```

Each is wrapped in try/catch so re-running on an already-migrated DB is a no-op. To add
a new migration:
1. Append the `ALTER TABLE` statement to the list.
2. Update the corresponding `CREATE TABLE` block above so fresh DBs also get it.
3. Update this doc.

## File-on-disk artifacts

Beyond `cyprus.db` itself:

| File | Purpose |
|---|---|
| `cyprus.db-shm`, `cyprus.db-wal` | SQLite WAL sidecars |
| `persisted-rooms.json` | Active rooms snapshot for crash recovery |
| `latest-game-XXXX.json` | Per-room latest snapshot (debug) |
| `game-log-XXXX.jsonl` | Per-room append log (debug) |
| `simulation-results.json`, `simulation-play-results.json`, `training-feedback.json` | Older simulation outputs (legacy) |

## Useful queries

```sql
-- Top reported bot branches
SELECT branch_tag, bot_tier, COUNT(DISTINCT reporter_user_id) AS distinct_reporters,
       COUNT(*) AS total_reports
FROM bot_play_reports
GROUP BY branch_tag, bot_tier
ORDER BY distinct_reporters DESC, total_reports DESC;

-- Bot decisions for a specific game
SELECT id, event_type, player_position, data
FROM game_events
WHERE game_id = ? AND event_type IN ('PLAY','PASS','BOMB')
ORDER BY id ASC;

-- Recent abandoned games
SELECT id, room_code, started_at, rounds_played
FROM games WHERE winner_team = 'Abandoned'
ORDER BY id DESC LIMIT 20;

-- ELO leaderboard
SELECT u.display_name, s.elo, s.elo_games, s.games_won
FROM user_stats s JOIN users u ON u.id = s.user_id
ORDER BY s.elo DESC LIMIT 50;
```

## Querying production

```bash
curl -s -X POST https://aegist.dev/admin/api/query \
  -H "Authorization: Bearer $DATA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT * FROM bot_play_reports ORDER BY created_at DESC LIMIT 20"}'
```

The admin query endpoint blocks INSERT/UPDATE/DELETE/DROP/ALTER/PRAGMA, so it's
read-only.
