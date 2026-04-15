# Cyprus — Tichu Card Game

Online multiplayer Tichu card game with bot opponents.

## Stack

- **Monorepo** with npm workspaces: `packages/client`, `packages/server`, `packages/shared`
- **Client**: React + Vite + Zustand (TypeScript)
- **Server**: Express + Socket.IO + better-sqlite3 (TypeScript, ESM)
- **Shared**: TypeScript types for socket events, game state, room state

## Commands

```bash
npm run dev          # Dev mode (server + client concurrently)
npm run build        # Build all workspaces (shared, client, server)
npm start            # Production: node packages/server/dist/index.js
npm run lint         # ESLint across all packages
npm run test         # Vitest (if tests present)
npm run clean        # Remove all dist/ folders
```

## Git Workflow

- **`main`** — production branch. Pushes auto-deploy to the live server. Only merge here when ready to ship.
- **`dev`** — development branch. Push freely, no deploy triggered. All feature work and bug fixes go here first.
- **Workflow**: branch from `dev` or commit to `dev` → test → merge `dev` into `main` when ready to deploy.
- **Claude Code**: Always work on `dev` branch unless explicitly told to deploy to production. Check current branch with `git branch` before making changes. If on `main`, switch to `dev` first.
- **NEVER push directly to `main`** during active game sessions — deploys restart the server and disconnect all players.

## Deployment

- **Auto-deploy**: pushes to `main` trigger GitHub Actions → SSH → pull + build + restart
- **Server**: Digital Ocean droplet at `165.245.175.45`
- **User**: `dev` (no sudo — need root for process management)
- **Nginx** proxies port 80 -> localhost:3001
- **Deploy**: `sudo bash deploy/killstart.sh` (kills old server, starts new one)
- **Full deploy** (pull + build + restart): `sudo bash deploy/restart.sh`
- **Rebuild only**: `bash deploy/rebuild.sh`
- **Logs**: `tail -f server.log`
- **Health**: `curl localhost:3001/health` — returns commit hash, message, date, uptime, and active connections. Use to verify deploys without SSH
- **Admin dashboard**: https://aegist.dev/admin (password-protected)

## Architecture

### Server (`packages/server/src/`)
- `index.ts` — Express app, Socket.IO setup, helmet security headers, HTTP request logging, auth/admin routes, graceful shutdown
- `SocketHandler.ts` — Socket event orchestrator: room/game/matchmaking events, reconnect, broadcasting (555 lines after extraction)
- `TimerManager.ts` — Turn timers (60s), disconnect→bot replacement (2min), dog/trick delays, room timer cleanup
- `GamePersistence.ts` — Game state snapshots to disk, room persistence for crash recovery (debounced 5s)
- `BotController.ts` — Bot action scheduling, AI decision routing, Monte Carlo integration for hard bots
- `RoomManager.ts` — Room CRUD, player join/reconnect, session-based auth (UUID v4), seat management, room serialization/restore
- `GameEngine.ts` — Tichu game logic, all phases (Grand Tichu → Passing → Playing → Scoring), card combinations, wish enforcement
- `BotAI.ts` — Bot AI (easy/medium/hard), Greek-themed bot profiles with avatars
- `MonteCarloSim.ts` — Monte Carlo simulation for hard bot decisions: determinization, rollout, candidate evaluation
- `Database.ts` — SQLite tracker (better-sqlite3): connections, players, games, events, HTTP requests, users, sessions, friends, leaderboard
- `AuthService.ts` — Scrypt password hashing, login/register, Google OAuth, forgot/reset password, session management
- `AuthRoutes.ts` — REST auth endpoints with HttpOnly cookie sessions, rate limiting
- `FriendRoutes.ts` — Friend request send/accept/reject API
- `EmailService.ts` — Nodemailer for password reset emails (requires SMTP config)
- `AdminDashboard.ts` — `/admin` routes with password auth, SQL query interface, loads HTML from `src/admin/`

### Client (`packages/client/src/`)
- `stores/roomStore.ts` — Zustand store for room/connection state, session reconnect (localStorage with 4hr TTL)
- `stores/gameStore.ts` — Zustand store for game state
- `stores/authStore.ts` — Zustand store for auth (login/register/Google/forgot password)
- `stores/friendStore.ts` — Zustand store for friend requests
- `components/GameBoard.tsx` — Main game UI, playing layout, trick display (494 lines after extraction)
- `components/PhaseViews.tsx` — Extracted phase components: GrandTichuView, PassingView, ScoringView, GameOverView
- `components/AuthForms.tsx` — Login/register/forgot/reset password forms, Google Sign-In button
- `components/Leaderboard.tsx` — Player rankings and stats
- `components/Friends.tsx` — Friend list and requests
- `hooks/useSocketEvents.ts` — Socket.IO event listeners

### Shared (`packages/shared/src/`)
- `types/events.ts` — Socket event type definitions (ClientToServerEvents, ServerToClientEvents)
- `types/game.ts` — Game state types, card types, combination types
- `types/player.ts` — Player position, player state types
- `types/auth.ts` — AuthUser, RegisterRequest, LoginRequest types
- `types/leaderboard.ts` — Leaderboard stat types
- `types/friends.ts` — Friend request types
- `combinations.ts` — Card combination detection, canBeat logic (Phoenix handled natively), findPlayableFromHand

## Session & Reconnect Flow

Players get a `sessionId` (UUID v4) on create/join, stored in localStorage. On page refresh or server restart, the client emits `session:reconnect` with the stored sessionId. The server maps sessionId → room/position and restores the player. If a player disconnects for >2 minutes during a game, they are replaced by a bot and the session is invalidated.

## Authentication

- **AuthService** (`AuthService.ts`): scrypt password hashing (N=16384, r=8, p=1), account lockout, session management
- **AuthRoutes** (`AuthRoutes.ts`): REST endpoints at `/auth/*` with HttpOnly cookie sessions
- **Endpoints**: POST `/auth/register`, `/auth/login`, `/auth/logout`, `/auth/change-password`, `/auth/delete-account`, `/auth/google`, `/auth/forgot-password`, `/auth/reset-password`; GET `/auth/me`, `/auth/google-client-id`
- **Google Sign-In**: server verifies ID token via `google-auth-library`, auto-creates/links accounts by email
- **Forgot password**: generates hashed reset token (SHA-256), sends email via nodemailer, token valid 1 hour
- **Client**: `authStore.ts` (Zustand), `AuthForms.tsx` (login/register/forgot/reset/Google), `UserBadge` component
- **Guest play**: preserved — auth is optional, guests play without accounts
- **Socket auth**: middleware reads auth cookie from handshake, attaches `socket.data.userId`/`socket.data.displayName`
- **DB tables**: `users` (id, username, display_name, password_hash, email, google_id, lockout fields), `user_sessions`, `password_reset_tokens`
- **Env vars for auth features**:
  - `GOOGLE_CLIENT_ID` — Google OAuth client ID (from Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID for Web)
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` — SMTP credentials for password reset emails
  - `SMTP_FROM` — sender email address (defaults to SMTP_USER)
  - `APP_URL` — base URL for reset links (defaults to `https://aegist.dev`)

## Security

- **Helmet** security headers (CSP, etc.) on all HTTP responses
- **Rate limiting**: per-socket (20 actions/5s), per-IP connections (20/min), room create/join (5/30s), session reconnect (5/30s), auth (5/min per IP), password reset (3/15min per IP)
- **Input validation**: dragon give position (0-3), wish rank (2-14), target score (250-10000), nickname (1-20 chars)
- **Password hashing**: scrypt (N=16384, r=8, p=1) with 32-byte random salt, timing-safe comparison
- **Session tokens**: SHA-256 hashed before DB storage, bound to userId for authenticated users
- **Account lockout**: 5 failed logins → 15 min cooldown
- **Session security**: HttpOnly + SameSite cookies, 7-day expiry, max 10 per user, cleanup on interval
- **SQL query protection**: admin query endpoint blocks INSERT/UPDATE/DELETE/DROP/ALTER/PRAGMA and pragma_ functions
- **Admin auth**: SHA-256 password hash with timing-safe comparison
- **Trust proxy**: enabled for nginx X-Forwarded-For headers
- **Graceful shutdown**: cleans up timers, persists rooms, closes DB
- **Room persistence**: active games survive server restarts (serialized to disk with userId, sessionId, bot state)

## Data Access (Production Database)

The server tracks connections, players, games, events, and HTTP requests in SQLite. You can query this data remotely via the admin API.

**API key**: `b295880c4d8b6118079c13457cc96ac0972396923894262b`

**Query any data** (read-only SELECT queries only):
```bash
curl -s -X POST https://aegist.dev/admin/api/query \
  -H "Authorization: Bearer b295880c4d8b6118079c13457cc96ac0972396923894262b" \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT * FROM players ORDER BY games_won DESC", "limit": 100}'
```

**List tables and row counts**:
```bash
curl -s https://aegist.dev/admin/api/tables \
  -H "Authorization: Bearer b295880c4d8b6118079c13457cc96ac0972396923894262b"
```

**Available tables**: `connections`, `players`, `games`, `game_players`, `game_events`, `http_requests`, `admin_sessions`

**Other endpoints** (all require same Bearer token):
- `GET /admin/api/stats` — summary stats
- `GET /admin/api/connections?limit=50` — recent connections
- `GET /admin/api/players?limit=100` — player leaderboard
- `GET /admin/api/games?limit=50` — recent games
- `GET /admin/api/events?limit=100` — game events
- `GET /admin/api/requests?limit=100` — HTTP request log
- `GET /admin/api/traffic?hours=24` — hourly traffic
- `GET /admin/api/top-ips?limit=20` — top IPs

## Collaborators

- **Dremix10** (GitHub) — co-developer, pushes game features (bot AI, UI, tutorials)

## Known Issues / Backlog

- **Forgot password email not active** — SMTP not configured (needs SMTP_HOST/USER/PASS env vars)
- **Google Sign-In not active** — needs GOOGLE_CLIENT_ID env var (Google Cloud Console setup)
- **Waiting rooms lost on deploy** — only rooms with active games are persisted; waiting rooms are lost on server restart
- Solo game fast-forward: speed up bot actions when human player is out
- Admin password retrieval / reset tool needed
