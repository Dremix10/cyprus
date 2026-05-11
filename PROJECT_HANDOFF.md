# PROJECT_HANDOFF.md

> Handoff document for the Cyprus / Tichu project, written after a Claude Code session
> ending 2026-05-06 in preparation for moving development to Codex.
>
> Live deployment: **https://aegist.dev** (Digital Ocean droplet, auto-deploy from `main`).
> Repo: https://github.com/Dremix10/cyprus.git
> Primary working dir: `/Users/christos/Documents/GitHub/cyprus`

## Companion docs (read alongside this file)

- [`docs/FIRST_30_MINUTES.md`](docs/FIRST_30_MINUTES.md) — concrete onboarding sequence.
- [`docs/BOT_CONFIG.md`](docs/BOT_CONFIG.md) — `DEFAULT_BOT_CONFIG` defaults + flags
  that have been tested-and-rejected (do NOT enable).
- [`docs/BRANCH_TAGS.md`](docs/BRANCH_TAGS.md) — every `lead:` and `follow:` tag in the
  bot AI.
- [`docs/SOCKET_EVENTS.md`](docs/SOCKET_EVENTS.md) — every Socket.IO event with payload
  shape and rate-limit table.
- [`docs/DATABASE_SCHEMA.md`](docs/DATABASE_SCHEMA.md) — column-level documentation of
  every table + the `ALTER TABLE` migration approach.
- [`docs/notes/bot_ai_tuning_results.md`](docs/notes/bot_ai_tuning_results.md) — full
  record of the 10K-game tuning experiments and tier ladder measurements.
- [`docs/notes/bot_never_break_bomb.md`](docs/notes/bot_never_break_bomb.md) — the hard
  rule. No exceptions.
- [`docs/notes/feedback_simulations.md`](docs/notes/feedback_simulations.md) —
  workflow lessons for simulation work.

---

## 1. Project Overview

### What this is

Cyprus is an online multiplayer **Tichu** card game. Tichu is a 4-player partnership
trick-taking game with hidden information, bombs, special cards (Mahjong / Dog / Phoenix /
Dragon), and a "Tichu" bet mechanic. The app supports:

- **Solo** (1 human + 3 bots, no other humans in the room)
- **Multiplayer with friends** via room codes
- **Public matchmaking** queue
- **Spectator mode** for live games
- **Friends + invites** (in-app social loop)
- **Optional accounts** (login / register / Google sign-in / forgot-password) — guests can
  also play

The goal of the project is a polished, playable Tichu experience with strong-enough bots
that solo and short-handed games are fun.

### Type of users

- Casual card-game players who want a working Tichu they can play in a browser.
- A small group of regular players (≤ a dozen at peak based on DB volume).
- The owner ("Christos", GitHub `chriseco427-spec`) and a co-developer ("Dremix10") are
  the main maintainers.

### Features already implemented

- Full Tichu rules engine (deal → grand tichu → passing → playing → scoring → next round)
- Bots with 5 difficulty tiers (`easy`, `medium`, `hard`, `extreme`, `unfair`) — see
  section 6
- Monte Carlo simulation for hard/extreme/unfair bots
- Room creation/join via 4-letter codes
- Solo (3-bot) game mode
- Public matchmaking queue
- Reconnect after disconnect (2-min window before bot replaces you)
- Persistent rooms across server restarts
- Authentication (scrypt passwords, Google OAuth, password reset, sessions)
- Friends system (request / accept / reject / remove / search)
- **Friend-to-game invites** (in-session MVP — recipient gets a top-right popup)
- ELO-style leaderboard (per-user + per-bot-tier)
- Round-by-round score history, last-trick display
- Solo "Hint" button (uses Unfair-tier MC to suggest a play)
- Bot decision logging (full per-play context persisted to DB)
- Player **report-a-bot-play** UI + admin endpoint to surface common complaints
- Live games viewer (spectate ongoing games)
- Tutorial / quick guide
- i18n scaffolding (English + Greek)
- Admin dashboard at `/admin` with read-only SQL query
- Helmet security headers, rate limits, graceful shutdown, drain-deploy

### Features still missing or partial

- **Profile-pic picker UX** — listed as a "known issue" in CLAUDE.md; current grid is
  rough.
- **Forgot-password emails** — code is wired but SMTP env vars are not set on prod, so
  reset emails do not send.
- **Google Sign-In** — code is wired but `GOOGLE_CLIENT_ID` is not set on prod, so the
  button is hidden.
- **MC cross-check** for bot-play reports — schema reserves `mc_agrees` / `mc_picked`
  columns but the cross-check is not implemented.
- **Replay viewer** for finished games — game events are logged in DB but no UI exists.
- **End-of-game "Play again" prompt** — explicitly listed as a high-leverage TODO.
- **Bot personalities** — all tiers use the same algorithm with different MC budgets;
  no archetypes (aggressive / defensive / etc.).
- **Waiting rooms lost on deploy** — only rooms with active games are persisted.

### Important design decisions (recurring themes)

- **Server-authoritative**: the client never runs game logic. The server validates every
  action and broadcasts state. Client just renders.
- **Bots run server-side** in `BotController` with a small action-scheduling delay so plays
  feel paced. MC bots use shared `rolloutBots` (hard tier) for simulation rollouts.
- **One process serves everything**: Express + Socket.IO + static client on port 3001.
  Nginx terminates TLS and proxies WebSockets.
- **Bot improvements via filters, not flags**: recent work has consistently filtered
  bad plays out of the candidate set (Phoenix on low cards, Dragon on low tricks,
  bomb-breaking, Ace-waste in leads). This was chosen over scoring tweaks because
  hard rules are easier to reason about and don't risk regressions in MC rollouts.
- **No exceptions to the "never break a bomb" rule** — explicit user directive saved
  to memory.

### Technical stack

- **Monorepo**: npm workspaces with three packages — `shared`, `server`, `client`.
- **Language**: TypeScript everywhere (ESM).
- **Frontend**: React 18 + Vite + Zustand (state). No router — view switch is a string in
  `roomStore`.
- **Backend**: Node 20 + Express + Socket.IO 4 + better-sqlite3 + helmet.
- **Auth**: scrypt password hashing, Google OAuth (server-validated ID tokens), HttpOnly
  cookie sessions.
- **Tests**: Vitest in `shared` and `server`.
- **Deploy**: GitHub Actions on push to `main` → SSH into droplet → `bash deploy/restart.sh`.

---

## 2. How to Run the Project

### Required tools

- Node.js 20+ (project Dockerfile uses `node:20-slim`)
- npm 10+ (uses workspaces)
- Build toolchain for `better-sqlite3` native module: `python3`, `make`, `g++`
- Optional: Docker if you want to use `docker-compose.yml`

### Install

```bash
git clone https://github.com/Dremix10/cyprus.git
cd cyprus
npm install
```

This installs into all three workspaces. `better-sqlite3` will compile during install.

### Environment variables

There is **no `.env.example`** in the repo. Variables are read directly from process env.
Production deployment uses `/home/dev/cyprus/.env` on the droplet. Local development
generally needs none of these (server runs without auth providers fine):

| Variable | Purpose | Required for |
|---|---|---|
| `PORT` | Server port (default `3001`) | optional |
| `NODE_ENV` | `production` enables CSP / disables CORS-dev-mode | production |
| `CLIENT_URL` | CORS origin in dev (default `http://localhost:5173`) | dev |
| `DATA_API_KEY` | Bearer token for `/admin/api/*` and `/admin/api/shutdown` etc. | production |
| `ADMIN_PASSWORD` / `ADMIN_PASSWORD_HASH` | Admin dashboard password (see `AdminDashboard.ts`) | production admin UI |
| `GOOGLE_CLIENT_ID` | Google OAuth — without this, the button is hidden | optional |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | Forgot-password emails | optional |
| `APP_URL` | Base URL used in password-reset email links (default `https://aegist.dev`) | optional |

The current production `DATA_API_KEY` value is not documented in git. Source of
truth is `/home/dev/cyprus/.env` on the droplet. Collaborators should use the
encrypted repo secret flow in `docs/ACCESS.md`.
See `docs/ACCESS.md` for collaborator setup.

### Develop locally

```bash
npm run dev
# starts:
#   server (tsx watch) on port 3001
#   client (vite)      on port 5173
```

The Vite dev server proxies `/socket.io` to the server. Open http://localhost:5173.

### Build

```bash
npm run build           # builds shared, then server, then client
```

The shared package must build before the server (server imports compiled JS from
`@cyprus/shared/dist`). The default `npm run build --workspaces` order works because npm
sorts workspaces topologically; if you build a single package and get
`Cannot find module '@cyprus/shared'`, run shared first.

### Run production build

```bash
npm start
# = NODE_ENV=production node packages/server/dist/index.js
```

The server serves the client's `dist/` directory as static files on the same port.

### Tests

```bash
npm test                # all workspaces (server + shared)
npm test --workspace=packages/server   # server only
npx vitest run packages/server/src/__tests__/GameEngine.test.ts -t "wish stays active"
```

Current count: **308 tests**, all passing as of `19ee000`.

### Common errors

| Error | Cause / fix |
|---|---|
| `Cannot find module '@cyprus/shared'` after editing shared | Run `npm run build --workspace=packages/shared` first. The server imports compiled JS, not source. |
| `EADDRINUSE :3001` on local restart | Old `tsx watch` instance still alive. Kill with `pkill -f "tsx watch"`. The deploy script (`deploy/killstart.sh`) handles this on the server with a `fuser -k` fallback. |
| TypeScript hint "X is declared but never used" in `BotAI.ts` lines 8/17/247/249/etc. | Pre-existing dead imports left over from refactors. Not breaking. Leave or clean separately. |
| `better-sqlite3` install fails | Missing `python3 / make / g++`. On Mac: `xcode-select --install`. On Debian: `apt-get install python3 make g++`. |
| `concurrently` parent dies, server CPU spikes to 100% | Known issue documented in `TESTING_NOTES.md`: an EPIPE inside the `uncaughtException` handler can re-fire. Production logs to a file via nohup so it's safe. Local repro: `pkill concurrently` while server is a child. |

### Ports

- Client (dev): **5173**
- Server (dev + prod): **3001**
- Nginx in production proxies port 80/443 → localhost:3001

---

## 3. Full File and Folder Explanation

```
cyprus/
├── PROJECT_HANDOFF.md          ← this file
├── CLAUDE.md                   ← project-specific instructions for AI assistants
├── DEPLOY.md                   ← deploy instructions (Docker + nginx variant)
├── TESTING_NOTES.md            ← scratch notes from a past bugfix session
├── Dockerfile                  ← multi-stage Node 20 build
├── docker-compose.yml          ← unused except as reference
├── tsconfig.base.json          ← shared TS config
├── package.json                ← root, workspaces config
├── deploy/
│   ├── killstart.sh            ← kill old server PID, start new one (nohup)
│   ├── nginx-cyprus.conf       ← reference nginx config for the reverse proxy
│   ├── rebuild.sh              ← npm run build only (no restart)
│   ├── restart.sh              ← full deploy: pull + build + killstart
│   └── setup-nginx.sh          ← initial nginx setup helper
├── .github/workflows/          ← Deploy via SSH on push to main
└── packages/
    ├── shared/                 ← types + pure logic (cards, combinations, scoring)
    ├── server/                 ← all backend code
    └── client/                 ← React frontend
```

### `packages/shared/`

Pure logic, no DOM, no Node-specific deps. Imported by server and (compiled) by client.

| File | Purpose |
|---|---|
| `src/index.ts` | Re-exports everything. |
| `src/types/card.ts` | `Card`, `NormalCard`, `SpecialCard`, `Suit`, `NormalRank`, `SpecialCardType`. |
| `src/types/combination.ts` | `Combination`, `CombinationType` (SINGLE / PAIR / TRIPLE / FULL_HOUSE / STRAIGHT / CONSECUTIVE_PAIRS / FOUR_OF_A_KIND_BOMB / STRAIGHT_FLUSH_BOMB). |
| `src/types/game.ts` | `GamePhase` enum, `TrickState`, `WishState`, `ClientGameState` (the wire format clients receive). |
| `src/types/player.ts` | `PlayerPosition` (0–3), `TichuCall` (`'none' \| 'tichu' \| 'grand_tichu'`), `PublicPlayerState`. |
| `src/types/events.ts` | **All Socket.IO event signatures** in `ClientToServerEvents` / `ServerToClientEvents`. Single source of truth for the wire. |
| `src/types/room.ts` | `RoomState`, `RoomPlayer`. |
| `src/types/auth.ts` | `AuthUser`, `RegisterRequest`, `LoginRequest`. |
| `src/types/leaderboard.ts` | Stat shapes for leaderboard endpoints. |
| `src/types/friends.ts` | Friend list / request shapes. |
| `src/cards.ts` | `getCardSortRank`, `sortCards`, `isNormalCard`, `isSpecial`, `getCardPoints`, `getRankLabel`, `getPhoenixSingleRank`. |
| `src/combinations.ts` | `detectCombination`, `canBeat`, `findPlayableFromHand`, `canPlayFromHand`, `findAllCombinations`. **The wish-enforcement house rule lives here** (see line ~543: if any of the wish-satisfying plays is a bomb, force the player to play a bomb; otherwise just force a wish-satisfying combo). |
| `src/scoring.ts` | `calculateRoundScore`, `getTeam`, `getPartner`, `sameTeam`, `sumCardPoints`, `RoundResult`, `RoundScoreBreakdown`. Implements 1-2 double victory, last-player tricks → first finisher's team, last-player hand → opp team rule. |
| `src/constants.ts` | `FULL_DECK` (56 cards = 52 normals + 4 specials), `WINNING_SCORE` (1000), `TICHU_POINTS` (100), `GRAND_TICHU_POINTS` (200), `TOTAL_CARD_POINTS` (100). |
| `src/__tests__/cards.test.ts` | 19 tests. |
| `src/__tests__/combinations.test.ts` | 54 tests. |
| `src/__tests__/scoring.test.ts` | 12 tests. |

Status: **complete and stable**. Modify carefully — these are also the contract the
client relies on. After editing, rebuild shared before the server.

### `packages/server/src/`

| File | Purpose / status |
|---|---|
| `index.ts` | Express + Socket.IO bootstrap. Helmet CSP, request logging, auth middleware on socket handshake, mounts `/auth`, `/api/friends`, `/admin`. Implements `/health`, `/api/live-games`, `/api/leaderboard*`. Drain-deploy endpoints (`/admin/api/drain*`). Graceful shutdown on SIGTERM/SIGINT. **Complete.** |
| `GameEngine.ts` | **The Tichu rules engine.** Deals, manages phases, validates moves, scores rounds. ~1090 lines. Public API: `startRound`, `grandTichuDecision`, `passCards`, `undoPassCards`, `callTichu`, `playCards`, `setWish`, `passTurn`, `resolveDog`, `dragonGive`, `nextRound`, `completeTrickWon`, `completeRoundEnd`, `serialize`/`clone`/`getClientState`/`getSpectatorState`. **Stable.** Recently fixed: trick-resolution skip when winner-goes-out, wish auto-cancel ignoring bombs (`fff30a7`/`4301fd8`). |
| `Deck.ts` | `dealCards()` — Fisher-Yates shuffle, returns `{ initial: 8 cards/player, remaining: 6 cards/player }`. |
| `RoomManager.ts` | Room lifecycle, sessions, reconnect, bot replacement. ~690 lines. Includes `serializeRooms` / `restoreRooms` for crash recovery and `replacePlayerWithBot` for the 2-min disconnect timeout. **Stable.** |
| `SocketHandler.ts` | All Socket.IO event registration. ~1240 lines. Holds module-level `onlineUsers: Map<userId, Set<socketId>>` and `pendingInvites: Map<targetUserId, PendingInvite>`. Subdivided into `registerRoomEvents`, `registerMatchmakingEvents`, `registerGameEvents`, `registerSessionEvents`, `registerSpectate`, `registerFriendEvents`, `registerBotReportEvents`, `registerDisconnect`. Includes the **hint-request handler** and **bot-report handler**. |
| `BotController.ts` | Schedules bot actions with a delay. Builds the MC evaluator closure. **Enriches every bot PLAY/PASS/BOMB event with full decision context** (`event.data.bot.{tier,branchTag,hand,trickTop,trickPoints,oppCardCounts,tichuCalls,currentTrickPlays,currentWinner,passCount,wish,finishOrder,scores}`) before broadcasting. Post-out-human delay = 1500ms. |
| `BotAI.ts` | **The bot brain.** ~1700 lines. `BotDifficulty` = 5 tiers; `effectiveDifficulty` collapses easy→medium logic, medium→hard, hard/extreme/unfair→hard+MC. Holds `BotConfig` defaults, every heuristic branch (each one tagged via `this.tag(branchName)`), and the candidate filters (bomb-preserve, Ace-waste-in-leads, Phoenix-waste, Dragon-waste). Public methods: `decideGrandTichu`, `decideTichu`, `choosePassCards`, `choosePlay`, `chooseWish`, `chooseDragonGiveTarget`. **Active development area.** |
| `MonteCarloSim.ts` | Information-Set Monte Carlo. Pre-filters candidates via `scoreCandidateHeuristic` to top 5, runs determinized rollouts using shared `rolloutBots[hard]`, evaluates by `roundScore + first-out bonus + 1-2 victory bonus + cards-left penalty + ALL FOUR PLAYERS' Tichu bonuses` (the 4-player Tichu fix is critical — old code only scored own Tichu). |
| `Database.ts` | `TrackerDB` over better-sqlite3, ~1280 lines. Tables: `connections`, `players`, `games`, `game_players`, `game_events`, `server_logs`, `http_requests`, `admin_sessions`, `users`, `user_sessions`, `password_reset_tokens`, `ai_reviews`, `review_queue`, `user_stats`, `bot_elo`, `friendships`, `bot_play_reports`. Migrations are run by trying `ALTER TABLE … ADD COLUMN` in a try/catch. |
| `AuthService.ts` | scrypt(N=16384,r=8,p=1) password hashing, lockout, sessions. Google OAuth ID-token verification. |
| `AuthRoutes.ts` | `/auth/register` `/login` `/logout` `/change-password` `/delete-account` `/google` `/forgot-password` `/reset-password` + `/me` `/google-client-id`. |
| `FriendRoutes.ts` | `/api/friends/*` REST endpoints. |
| `EmailService.ts` | Nodemailer wrapper for password-reset email. Inactive in prod (no SMTP env). |
| `AdminDashboard.ts` | `/admin/login`, `/admin` dashboard HTML, and `/admin/api/*` JSON endpoints (`stats`, `connections`, `players`, `games`, `events`, `requests`, `traffic`, `top-ips`, `audit`, `tables`, `query`, **`bot-reports`**). HTML files live in `src/admin/{login,dashboard}.html` and are copied to dist by the server build script. |
| `MatchmakingManager.ts` | Public queue. Polls every 3s, fills 4 → creates a room and ports everyone in. Queue timeout 60s. |
| `TimerManager.ts` | Per-room timers: turn (60s), disconnect→bot replacement (30s), Dog visual delay, trick-won visual delay, round-end visual delay. |
| `GamePersistence.ts` | Debounced (5s) serialization of active rooms to `data/persisted-rooms.json` so the server can restore in-progress games on restart. |
| `GameMonitor.ts` | Telemetry helper used by other modules; logs server lifecycle and game events into `server_logs`. |
| `ServerAuditor.ts` | Periodic auditing — checks for stuck games, orphaned rooms, etc. |
| `AiReviewer.ts` | Optional AI-based game review pipeline (see `ai_reviews` / `review_queue` tables). Hooked into the auditor. **Marked experimental.** |
| `instrument-sim.ts` | CLI: runs N games with `BotDecisionRecorder` attached, prints branch-tag fire-rate table. Use to find hot paths in BotAI. `npx tsx packages/server/src/instrument-sim.ts 1000 medium`. |
| `versus-tier-sim.ts` | CLI: 10K games of tier-X vs tier-Y or feature-flag A/B with position swap at halfway. |
| `versus-sim.ts` | Older variant of the same. Mostly superseded. |
| `bias-test.ts` | Sanity check that an identical-bot self-play sim is ~50/50 — run before any sim experiment. |
| `budget-sim.ts` | Tests MC budget (sim count / time budget) trade-offs. **Has a known double-swap bug documented in memory; not used currently.** |
| `hard-vs-unfair-sim.ts` | Tier ladder check at top tier. |
| `quick-sim.ts` | Fast smoke sim. |
| `simulate-play.ts` / `simulate.ts` | Older sim scripts. |
| `__tests__/GameEngine.test.ts` | 106 tests covering deal, phases, trick resolution, scoring, Dragon/Mahjong/Phoenix specials, regression tests for trick-skip and wish-bomb bugs. |
| `__tests__/RoomManager.test.ts` | 64 tests. |
| `__tests__/AuthService.test.ts` | 53 tests. |

### `packages/client/src/`

| File | Purpose / status |
|---|---|
| `App.tsx` | Top-level view switch. Reads `view` from `roomStore` and renders Lobby / WaitingRoom / GameBoard / MatchmakingQueue. Mounts `FriendInvitePopup` globally. |
| `main.tsx` | React root. |
| `socket.ts` | Single Socket.IO client instance with `autoConnect: false` and reconnection enabled. |
| `i18n.ts` | English + Greek strings. `useT()` hook returns the lookup function. |
| `sounds.ts` | Audio loading + per-event play helpers. Mute persisted in localStorage. |
| `App.css` | All styles. ~3000+ lines. **Vibe-coded in places.** |
| `stores/roomStore.ts` | View state + room/session lifecycle: createRoom, joinRoom, soloCreate, matchmaking, sit, startGame, reset. Saves session to localStorage with 4hr TTL. |
| `stores/gameStore.ts` | Game state + actions: setGameState, handleEvent (plays sounds + tracks reportable bot plays), playCards, passTurn, callTichu, dragonGive, wish, **requestHint**, **reportBotPlay**. |
| `stores/authStore.ts` | login / register / logout / Google / forgot / reset / change password / delete account. |
| `stores/friendStore.ts` | Friends + invites. `incomingInvite` state, `sendInvite` / `acceptInvite` / `declineInvite`. |
| `hooks/useSocketEvents.ts` | Single useEffect that wires every `ServerToClientEvents` event to its store action. Includes the friend-invite + game-event listeners. |
| `components/Lobby.tsx` | Landing screen — solo, friends, matchmaking, leaderboard, profile, live games, tutorial. |
| `components/WaitingRoom.tsx` | Pre-game seat picker, copy-room-code, "Invite friend" button. |
| `components/GameBoard.tsx` | Main playing UI. ~600 lines. Includes the Hint button, Report-bot-play button, Pass button highlight when `mustPass`, Tichu / Pass / Play actions, leave / score history / quick guide / sound toggle. |
| `components/PhaseViews.tsx` | `GrandTichuView`, `PassingView`, `ScoringView`, `GameOverView`, `TichuCallBadges`, `PointCards`, `ScoreBreakdown`. |
| `components/PlayerHand.tsx` | Hand display + selection. |
| `components/OpponentHand.tsx` | Opponent's card-back display. |
| `components/CardComponent.tsx` | Single card render (rank + suit, special icons). |
| `components/PlayerAvatar.tsx` | Avatar wrapper. |
| `components/AuthForms.tsx` | Login / Register / Forgot / Reset / Google sign-in. |
| `components/Profile.tsx` | Per-user stats + display name + avatar picker. |
| `components/Friends.tsx` | Friends panel (online + offline lists, search). |
| `components/Leaderboard.tsx` | ELO-style leaderboard. |
| `components/Tutorial.tsx` | Inline rules tutorial. |
| `components/QuickGuide.tsx` | Quick reference button + popup. |
| `components/ScoreHistory.tsx` | Round-by-round breakdown. |
| `components/MatchmakingQueue.tsx` | Queue waiting screen. |
| `components/LiveGames.tsx` | Spectate-able games list. |
| `components/ConnectionStatus.tsx` | Online/offline banner. |
| `components/WishSelector.tsx` | Mahjong wish dialog. |
| `components/FriendInvitePopup.tsx` | Top-right slide-in popup for incoming invites. |
| `components/InviteFriendPicker.tsx` | Modal listing online friends with per-row "Invite" button. |
| `components/HintButton.tsx` | Yellow 💡 button — solo only, my turn, PLAYING phase. |
| `components/ReportBotPlayPanel.tsx` | "Report bot play" button + modal listing recent bot plays with confirm step. |

---

## 4. Current Architecture

### High-level data flow

```
                    ┌─────────────┐
                    │   Browser   │  React + Zustand
                    └──────┬──────┘
                           │  WebSocket (Socket.IO)
                           ▼
              ┌─────────────────────────┐
              │    SocketHandler        │  Auth middleware reads cookie session.
              │  registers all events   │  Per-socket rate limit on every action.
              └─────┬──────────┬────────┘
                    │          │
                    ▼          ▼
       ┌────────────────┐  ┌─────────────────┐
       │  RoomManager   │  │  BotController  │  schedules bot moves with delay
       │  socketToRoom  │  │  attaches bot   │  enriches PLAY/PASS events with
       │  sessionToRoom │  │  decision data  │  bot.hand / bot.branchTag etc.
       └─────┬──────────┘  └────────┬────────┘
             │                      │
             ▼                      ▼
       ┌──────────────────────────────┐       ┌──────────────────┐
       │   GameEngine (per room)      │ ◄──── │  MonteCarloSim   │
       │   state machine              │       │  determinization │
       │   emits GameEvent[]          │       │  rollouts        │
       └────────────┬─────────────────┘       └──────────────────┘
                    │
                    ├─► event broadcast to all sockets in room
                    │
                    ▼
              ┌──────────────────┐
              │  TrackerDB       │  better-sqlite3 (cyprus.db)
              │  game_events,    │  Each PLAY/PASS log gets back an inserted id
              │  users, friends, │  which is attached to the broadcast event.
              │  bot_play_reports│
              └──────────────────┘
```

### Frontend structure

- React 18 + Vite. No router; the `view` field in `roomStore` (`'lobby' | 'queue' | 'waiting' | 'game'`) controls which top-level component renders.
- Zustand stores (`roomStore`, `gameStore`, `authStore`, `friendStore`) hold all client state.
- Socket events are handled in **one** `useSocketEvents` hook that maps each event to the appropriate store action. There is no separate event bus.
- `socket.ts` exports a single `socket` instance imported wherever needed.
- Sessions persist to localStorage with a 4-hour TTL. On boot, `App.tsx` calls `trySessionReconnect()` which emits `session:reconnect`.

### Backend structure

- Single Express + Socket.IO process.
- `index.ts` is the bootstrap: middleware → routes → start listening.
- All real work is delegated to `SocketHandler`, which composes `RoomManager`, `MatchmakingManager`, `TimerManager`, `GamePersistence`, `BotController`.
- Bots are server-side. Their decisions go through `BotAI.choosePlay` which dispatches by `effectiveDifficulty` to `chooseLeadHard` / `chooseFollowHard` etc. or to MC.
- Bot decisions are enriched with full state context and persisted into `game_events.data.bot`. This is what the report-a-bot-play feature inspects.

### Game logic

- `GameEngine` is a single class that owns `state: GameEngineState`. All mutations go through public methods that:
  1. Validate (throw on illegal moves)
  2. Mutate state
  3. Emit a `GameEvent[]` (collected via `this.emit`)
  4. Return that array to the caller for broadcasting
- Phases: `WAITING → GRAND_TICHU → DEALING → PASSING → PLAYING ↔ DRAGON_GIVE → ROUND_SCORING → GAME_OVER`.
- Visual delays (Dog resolve, trick-won, round-end) are NOT timers inside the engine. The engine sets `dogPending` / `trickWonPending` / `roundEndPending` flags and `TimerManager` calls `engine.resolveDog()` / `engine.completeTrickWon()` / `engine.completeRoundEnd()` after the delay.
- Each round produces a `RoundScoreBreakdown` for the UI.

### State management

- Game state: server holds the truth; clients receive `ClientGameState` snapshots after every action plus delta `game:event` events between snapshots.
- The server **also** computes action-flag fields on the snapshot (`canAct`, `canPass`, `canCallTichu`, `mustPass`, `mustPlayWish`, `isSolo`, `botDifficulty`). The client doesn't compute legality.

### Rooms / lobbies

- Rooms identified by 4-letter code (`ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'`, no I/O).
- A `Room` holds: `code`, `players: Map<position, RoomPlayer>`, `engine: GameEngine | null`, `targetScore`, `botPositions: Set<position>`, `botDifficulty`, timestamps.
- `socketToRoom` and `sessionToRoom` maps allow O(1) reverse lookup.
- Rooms are deleted when empty for >30min, or when the game ends and players leave.
- Reconnect: a player who disconnects has 2 minutes to come back via `session:reconnect`. After 2 minutes a bot replaces them. The original `RoomPlayer` info is stored on the bot's `replacedPlayer` so game-end credit goes to the right user.

### Players / bots

- `RoomPlayer` has `nickname`, `socketId`, `connected`, `userId?` (auth), `sessionId`, `avatar`. Bot players have `userId === undefined`.
- Bot positions are tracked in `room.botPositions: Set<PlayerPosition>`. The same nickname pool (`Bot Zeus`, `Bot Athena`, `Bot Apollo`) is reused; for solo, three bots fill positions 1/2/3.

### Turns / moves / phases

- `engine.state.currentPlayer` is the position-to-act.
- Engine validates: phase, current player, card legality (`findPlayableFromHand`), wish enforcement, dragon-give selection.
- After a move, the engine sets `currentPlayer` to the next active player (`getNextActivePlayer`) and emits the right events.

### Client–server communication

- Socket.IO with typed events (see `shared/types/events.ts`).
- Room snapshots: `room:state`. Game snapshots: `game:state`. Game deltas: `game:event`.
- All client→server actions are callback-style for room/match/auth events; fire-and-forget for in-game actions (the server responds with `game:state` / `game:error`).

### Storage

- SQLite file at `packages/server/data/cyprus.db` (and WAL files alongside).
- Persisted rooms (in-progress games) at `packages/server/data/persisted-rooms.json`.
- Optional debug game logs: `data/game-log-XXXX.jsonl` and `data/latest-game-XXXX.json`.

---

## 5. Game Rules and Logic

### Card representation

Defined in `shared/src/types/card.ts`:
- 52 normal cards: 4 suits (`JADE`, `PAGODA`, `STAR`, `SWORD`) × 13 ranks (2…14).
- 4 special cards: `MAHJONG` (rank 1), `DOG` (rank 0, gives lead to partner), `PHOENIX` (-25 pts, half-rank wildcard), `DRAGON` (rank 15, +25 pts but trick goes to opp).
- Each card has a stable `id` like `JADE_7` or `PHOENIX`. IDs are referenced everywhere — clients send card IDs, not full Card objects.

### Deck / shuffling / dealing

`Deck.ts:dealCards()` does a Fisher-Yates shuffle of `FULL_DECK` and returns 8 + 6 cards per player. Engine calls this on `startRound`. The 8 are revealed before Grand Tichu, the 6 after.

### Turn order

Always **clockwise** in code: `nextPlayer = (current + 1) % 4`. `getNextActivePlayer(from)` skips players who are out.

### Legal move validation

Lives in `shared/src/combinations.ts`:
- `detectCombination(cards)` returns the canonical combination type and rank.
- `canBeat(current, played)` enforces type-matching, length-matching, rank ordering, and bomb-vs-bomb rules.
- `findPlayableFromHand(hand, currentTop, wish)` returns all legal plays. **If the wish is active and any plays contain the wished rank, only those are returned. Bombs containing the wished rank take priority over non-bomb wish plays.**

### Passing logic

`engine.passTurn(position)`:
- Cannot pass when leading (no plays in trick).
- Cannot pass when the wish is active and the player can satisfy it.
- Increments `passCount`, adds to `passedPlayers`.
- Trick resolution: trick is won when **passCount >= activePlayers - (winnerActive ? 1 : 0)**. The "winner is out, so all remaining players still need to pass" branch is the recently-fixed regression at `4301fd8`.

### Round / trick resolution

- `playCards` validates and pushes onto `currentTrick.plays`, sets `currentWinner`.
- Dog: clears the trick, gives the lead to the partner. Visual delay applied via `dogPending`.
- When all-but-winner pass, `resolveTrick` runs: emits `TRICK_WON`, sets `trickWonPending`. After the delay, `completeTrickWon` collects the cards onto `winner.wonTricks` and starts a new trick.
- If the Dragon was the winning card, the engine enters `DRAGON_GIVE` phase and waits for the winner to pick which opponent gets the trick (per Tichu rules).

### Scoring logic

`shared/src/scoring.ts`. Per round:
- **1-2 double victory**: same team finishes 1st and 2nd → that team gets 200 (see `breakdown.doubleVictory`).
- Otherwise:
  - Each player's won-trick card points go to their own team — except the **last** (4th-place) player's won tricks transfer to the **first finisher's team**.
  - The 4th-place player's **remaining hand** transfers to the opposing team.
- **Tichu / Grand Tichu** bonuses: ±100 / ±200 depending on whether the caller went out first.
- Game ends when a team reaches `targetScore` (default 1000).

### Team logic

Teams are by parity: positions 0+2 vs 1+3. `getTeam`, `sameTeam`, `getPartner` helpers.

### Special cards

- **Mahjong (rank 1)**: holder leads round 1; whoever plays it can call a wish (rank 2–14). Wish persists until satisfied (now — used to auto-cancel on a higher play, fixed at `4301fd8`).
- **Dog (rank 0)**: only legal as a lead. Passes the lead to partner.
- **Phoenix (-25 pts)**: as a single, beats current top by +0.5 (so on a K it becomes 13.5). As a pair / trip / full-house / straight component, fills any rank.
- **Dragon (rank 15, +25 pts)**: beats any non-bomb single. **Whoever wins a trick containing the Dragon must give the entire trick to one opposing-team player.**

### Edge cases handled

- Wish persists across plays in a trick (no auto-cancel on higher card).
- Trick resolution counts winner's out-status correctly.
- Dog played mid-trick is illegal (engine rejects).
- Phoenix half-rank labeled correctly in UI.
- Last player's tricks transfer to first finisher (per Tichu rules) — older bug `c7f2f36`.
- "Force bomb when wish matches a bomb in hand" — `1ede450`.

### Edge cases possibly NOT handled / uncertain

- **Phoenix in straights when Mahjong is also in the straight**: code in `extractStraights` handles this but is dense; worth re-testing.
- **Bomb vs higher bomb resolution**: `canBeat` favors `STRAIGHT_FLUSH_BOMB` over `FOUR_OF_A_KIND_BOMB` regardless of rank; same-type bombs need higher rank. Check the test in `combinations.test.ts` for confirmation.
- **Grand Tichu phase has no timer in multiplayer** — `TESTING_NOTES.md` flags this. If a player just doesn't decide, the room stalls.
- **Spectator mode does not show the wish-pending state** clearly.
- **A player who reconnects exactly at the moment a trick is being scored** has not been heavily tested.

When something here looks wrong, run the existing GameEngine test suite first; many corners are already covered.

---

## 6. Bot System

### Tiers

Defined in `BotAI.ts`. `BotDifficulty = 'easy' | 'medium' | 'hard' | 'extreme' | 'unfair'`.

**Internal collapsing** (`effectiveDifficulty`):
- `easy` → easy logic (random / very simple)
- `medium` → **hard** heuristic, no MC
- `hard` / `extreme` / `unfair` → hard heuristic + MC (different sim budgets)

So in code there are really three tiers: easy, hard-heuristic, hard-heuristic-with-MC. The 5 user-facing tiers map onto MC budget.

### MC budgets (`BotController.getMcConfig`)

| Tier | useMonteCarlo | mcSims | mcTimeMs |
|---|---|---|---|
| easy | false | — | — |
| medium | false | — | — |
| hard | true | 200 (default) | 150 (default) |
| extreme | true | 400 | 300 |
| unfair | true | 600 | 400 |

### Heuristics (selected hot paths)

**Lead branches** in `chooseLeadHard`, all tagged via `this.tag('lead:...')`:
- `lead:endgame-dump` (≤3 cards left, just play biggest)
- `lead:dog`, `lead:mahjong`
- `lead:partner-tichu-low` (partner called Tichu/GT and isn't out → lead lowest non-special single, regardless of card-count comparison — fixed at `2443ae8`)
- `lead:vs-tichu-multi` / `lead:vs-tichu-ace` / `lead:vs-tichu-high` (anti-Tichu — strong multi-card combo first; **dragon-lead is OFF by default** because of the Dragon-give rule)
- `lead:long-5plus`, `lead:isolated-multi`, `lead:multi`, `lead:singleton`, `lead:low-single`, `lead:safe-high-single`, `lead:fallback`

**Follow branches** in `chooseFollowHard`:
- `follow:endgame-urgency` (≤3 cards & not partner-winning OR self-Tichu)
- `follow:bomb-opp-tichu-thin`, `follow:bomb-block-opp-out`, `follow:pass-partner-winning`
- `follow:bomb-opp-1-card` / `-2-card` / `-3-tichu`, `follow:bomb-high-points`, `follow:bomb-10pts-urgent`, `follow:bomb-endgame-clear`
- `follow:pass-leadback-ace-cost`, `follow:bomb-no-regular`, `follow:pass-no-regular`
- `follow:smart-select` (~46% of all follow decisions — main scoring formula)
- `follow:dragon-play`, `follow:pass-dragon-save`, `follow:pass-phoenix-save`
- `follow:pass-ace-pointless`, `follow:play-opp-about-out`, `follow:play-lowest-beat`

### Filters applied at `choosePlay` BEFORE branching to MC or heuristic

These were the bulk of recent work and are critical:

1. **Bomb preservation** (`filterBombPreserving`) — hard rule: any play that uses 1–3 cards of a 4-of-a-kind in hand is removed. Only the bomb (all 4) is allowed to touch those cards.
2. **Ace-waste in leads** (`filterAceWasteInLeads`) — when leading, plays with ≥2 Aces in a multi-card combo are removed (no AAA-99 full houses, no AA pairs as leads); a single Ace at the top of a length-5+ straight is fine.
3. **Phoenix waste** (in `choosePlay` MC pre-filter) — if `cardInfo` shows any opponent card can still beat Phoenix-on-current-top (Dragon or any normal > top+0.5), strip Phoenix-single from candidates unless in endgame or opp about to go out.
4. **Dragon waste** (in `choosePlay` MC pre-filter) — strip Dragon-single from candidates if hand > 3, opp not about to go out, and trick points < 15.

### Smart card tracking

`smartCardTracking` (default `true`) drives `cardInfo` from the played-cards list. Used by `findBestFollowCard` to:
- Penalize playing high cards into a trick where lower would have won.
- Detect "safe top" plays (no higher cards remaining).
- Power the Phoenix / Dragon / Ace-on-K filters.

### Monte Carlo

`MonteCarloSim.ts`. Information-Set MC:
1. **Pre-filter** candidates via `scoreCandidateHeuristic` (length × 10, +20 if length ≥ 5, −rank × 2, +15 Dog, +25 Mahjong, −10 Dragon-single-lead, etc.) → top 5.
2. **Determinize** the unknown pool (cards not visible to the bot are randomly shuffled to other hands).
3. **Rollout** to round-end, with each player using a shared `rolloutBots[hard]` instance (`inRollout = true` to prevent recursive MC).
4. **Evaluate** with `evaluateOutcome`:
   - team round-score diff
   - +40 / +30 / -30 first-out bonus
   - +100 / -100 1-2 double victory
   - −cardsLeft × 3 for the bot
   - **±100/±200 Tichu bonuses for ALL FOUR players** (fixed previously — old code only scored own Tichu, blinding MC to partner-Tichu and opp-Tichu situations)

### Bot strengths (current)

- The MC layer (hard / extreme / unfair) handles partner Tichu and opp Tichu correctly *now* (see `MonteCarloSim.evaluateOutcome` and the partner-Tichu lead bypass in `choosePlay`).
- The filter set (bomb, Ace-waste, Phoenix, Dragon) eliminates the worst categories of "stupid play" complaints.
- `medium` (hard heuristic without MC) is intentionally close to hard in win rate — most play quality lives in the heuristic, MC just adds a small tier ladder above.

### Bot weaknesses (current)

- **No opponent modeling**: the bot doesn't track which specific player likely holds which cards. Determinization is uniform random over the unknown pool.
- **Pre-filter is biased toward length**: `scoreCandidateHeuristic` rewards `length × 10`, which is why for a long time bots picked AAA-99 over preserving a bomb. Filters now compensate at choosePlay level.
- **Card passing strategy is simple**: `passCardsHard` uses heuristics like "give an Ace to partner" but doesn't simulate the resulting hands.
- **Easy tier is essentially "play random legal"** — there's not much subtlety.

### Tier ladder (measured)

From `bot_ai_tuning_results.md` memory (50 games each, position-swapped):

| Matchup | Lower wins | Higher wins |
|---|---|---|
| medium vs hard | 8% | **92%** |
| hard vs extreme | 36% | **64%** |
| extreme vs unfair | 38% | **62%** |

The biggest jump is medium → hard (engaging MC at all). hard → extreme → unfair adds budget and yields steadily increasing wins.

### Why MC was added

After Batch 1 / Batch 2 of pure-heuristic experiments produced almost no signal in 10K-game sims, MC budget escalation was tested and *did* produce signal (62–76% win rate at higher budget). MC is therefore the primary lever for "stronger bot."

### Why extreme may not be much better than hard

It is — the measurements show ~64% extreme-vs-hard. But the user-perceptible improvement is small because the MC rollouts are still limited by the rollout-bot quality (hard heuristic). Improving the heuristic helps both the live bot and the rollout fidelity.

### Future plans (per memory and chat)

- **MC cross-check on bot-play reports**: replay the recorded state, run MC, compare to actual play, store agree/disagree. Schema is reserved (`mc_agrees`, `mc_picked` columns in `bot_play_reports`); the implementation is deferred (~1.5–2 hours).
- **Self-play training corpus**: with the new bot decision logging, every prod game now produces a stream of (state, branch, action) tuples. Could be used for offline training in the future.
- **Replay viewer**: same engine state reconstruction as MC cross-check, but renders to UI instead.

### Scalability concerns

- Each MC eval = ~150–400ms on one core. With many concurrent unfair-tier games, the single Node process becomes a CPU bottleneck. Memory says "max ~3 concurrent unfair games" before noticeable lag.
- Rollouts allocate Card objects per simulation. No object pooling.
- Persisted-rooms write happens debounced (5s) and is small JSON, not a problem.

---

## 7. Simulations

### Where they live

`packages/server/src/`:
- `MonteCarloSim.ts` — production MC used at runtime.
- `instrument-sim.ts` — branch-tag fire-rate analysis. **The most useful tool for bot debugging.**
- `versus-tier-sim.ts` — 10K-game tier or feature-flag A/B with position swap.
- `versus-sim.ts` — older, mostly redundant.
- `bias-test.ts` — sanity check (run before A/B experiments).
- `budget-sim.ts` — MC budget tradeoffs. **Has a known double-swap bug; do not use without re-validating.**
- `hard-vs-unfair-sim.ts`, `quick-sim.ts`, `simulate.ts`, `simulate-play.ts` — older variants.

### What they're used for

- **Production MC**: live bot decisions for hard/extreme/unfair tiers.
- **Offline tuning**: experimenting with heuristic flags (`scoreAwareTichu`, `opponentCardCountBombing`, `smartCardTracking`, etc.) and measuring win-rate impact.
- **Branch fire-rate measurement**: identifying which heuristic branches are hot paths worth optimizing.

### How simulations are started

```bash
# 1000-game branch fire-rate report (medium tier)
npx tsx packages/server/src/instrument-sim.ts 1000 medium

# 10K medium-vs-medium A/B with `smartCardTracking` enabled on side B
npx tsx packages/server/src/versus-tier-sim.ts 10000 medium medium none smartCardTracking

# Sanity check: identical bots should be ~50/50
npx tsx packages/server/src/bias-test.ts
```

### Hidden information / random unknown cards

Determinization in `MonteCarloSim.determinize`:
1. Compute `knownIds` = bot's hand + all visible cards (won tricks + current trick plays).
2. `unknownPool = FULL_DECK − knownIds`.
3. Per simulation, shuffle the unknown pool and assign to other players matching their `hand.length`.

Each simulation uses a fresh shuffle, so the assignment is genuinely random across runs.

### Assumptions

- Other players' card distribution is uniform over the unknown pool — there is **no** opponent modeling.
- Rollout-bots make decisions identical to a `hard` BotAI. They don't peek, they don't cheat.
- The same RNG is used by `Math.random()` everywhere — sims are not seeded; results vary run-to-run.

### How sim results affect decisions

`monteCarloEvaluate`:
- Round-robins through pre-filtered candidates, running one rollout per candidate per pass.
- Each candidate accumulates `totalScore` and `simCount`.
- Picks the candidate with the highest average score.
- Returns the cardIds (or null for pass) of the winner.

### Performance

- Pre-filter is O(playable.length) — usually < 30 candidates, picks top 5.
- Each rollout walks one round to completion, capped by `safety < 500` iterations.
- Time-budget enforcement: rollouts check `performance.now() > deadline` every 20 iterations.
- Total MC cost: 200–600 sims × (one round of rollout) × 4 candidates ≈ 100–400ms per decision.

### Bugs / limitations

- Determinization treats all unknown cards as equally likely in any opponent's hand, which is wrong (passing reveals one card to each direction).
- The pre-filter `scoreCandidateHeuristic` doesn't know about bombs-in-hand or Ace-waste — that's why those filters are layered on top in `choosePlay`.
- `budget-sim.ts` has a documented double-swap bug.

---

## 8. Rooms, Multiplayer, and Lobby System

### Creating a room

Two paths:
1. **Multiplayer**: `room:create(nickname, targetScore, difficulty)` → 4-letter code. Creator goes to position 0. Others join via `room:join(code, nickname)`.
2. **Solo**: `room:create_solo(nickname, targetScore, difficulty)` → 4-letter code, 3 bots auto-fill positions 1/2/3.

### Joining

`room:join(code, nickname)` validates the room exists, isn't full, nickname isn't a duplicate. Returns a sessionId stored in the player's localStorage.

### How room IDs work

`generateCode()` in `RoomManager` picks a random 4-letter code from `ABCDEFGHJKLMNPQRSTUVWXYZ`, retries if collision. Codes are case-insensitive (uppercase normalized server-side).

### Game state per room

`Room.engine: GameEngine | null`. `null` until `room:start` is fired (or the game ends). Each room has its own engine; engines never share state.

### Multiple rooms

- `rooms: Map<code, Room>` in RoomManager.
- `socketToRoom: Map<socketId, {code, position}>` for O(1) reverse lookup.
- `sessionToRoom: Map<sessionId, {code, position, userId?}>` for reconnects.
- Each Socket.IO room is named after its code, so `io.to(code).emit(...)` reaches just that room.

### Player leaves

- **Mid-game**: `disconnect` event marks the player disconnected, starts a 30s "bot replacement" countdown if it's their turn. After the countdown, `replacePlayerWithBot` swaps in a bot keeping the same nickname.
- **Pre-game (waiting room)**: position is freed, others can sit.

### Game starts

`room:start` → `engine = new GameEngine(...)` → `engine.startRound()` → `room:state` and `game:state` broadcast. Bots are scheduled via `BotController.scheduleBotAction`.

### Spectators

Yes. `room:spectate(code)` joins the Socket.IO room and emits `getSpectatorState()` (which exposes all hands). Spectators can't perform game actions.

### Reconnect

`session:reconnect(sessionId)`:
- `RoomManager.reconnectBySession(sessionId, socketId)` finds the player's slot and re-binds their socketId.
- TimerManager cancels the disconnect-replacement timer.
- Both `room:state` and `game:state` are emitted to the reconnected socket.

### Persistence

`GamePersistence` debounced-writes `data/persisted-rooms.json` every 5s. On startup, `loadPersistedRooms` rehydrates rooms and their `engine.state` from JSON. Only rooms with `engine !== null` are persisted (waiting rooms are NOT — known limitation).

### Bugs / unfinished

- Waiting rooms lost on deploy.
- Grand Tichu phase has no timer in multiplayer (player can stall the room).
- If a player has more than one open browser tab and joins a room from each, behavior is undefined (the second `socketToRoom.set` overwrites the first).

### Scaling

- The whole thing is single-process. `io.engine.clientsCount` is shown on `/health`.
- A few dozen concurrent rooms is fine. A few hundred would start to bottleneck on the MC tier (CPU).
- Sticky sessions are not strictly needed (no Socket.IO adapter), but redis-based scaling would be the path if needed.

---

## 9. UI / User Experience

### Main screens

- **Lobby**: nickname, target score, "Solo vs bots", "Create room", "Join room", "Find match", "Tutorial", "Leaderboard", "Live games", profile/avatar widget.
- **Waiting Room**: 4 seats grid, room code with copy button, start button (host only), "Invite friend" button.
- **Game**: full table, hands, opponent cards backs, trick area, action buttons, score history, sound toggle, leave, hint (solo), report-bot-play.
- **Matchmaking Queue**: queue size, elapsed time, cancel.

### Game table layout

Bottom = me, top = partner, left/right = opponents. Each player has avatar + nickname + card count (or hand for me). Trick plays stack in the middle area. Score and target are at the top.

### Move selection

Click a card to toggle selection (debounced 100ms to prevent touch double-fire). Click Play to submit. The selected set is highlighted; Play is disabled if the set is illegal.

### Bot difficulty selection

A dropdown on the room creation screens. Solo also chooses difficulty.

### Animations

- Cards animate when played (CSS transition).
- "Player out" badge appears for 2s when someone goes out.
- "Trick won" toast appears briefly.
- "Friend invite" popup slides in from the right (`@keyframes friend-invite-slide`).
- Hint button has a pulse animation when loading.

### Mobile responsiveness

Largely tested on iPad based on screenshots. Mobile phone layout is uncertain — landscape probably fine, portrait is cramped. **Profile-pic picker is explicitly listed as needing rework.**

### Known UI bugs

- The trick area only shows the latest play; earlier plays in the same trick scroll out of view on small screens.
- The Greek (`el`) translation is partial — many strings fall back to English.
- Long nicknames overflow some seat boxes.

### Specific UX choices made

- **Auto-pass in solo**: removed (commit `19ee000`). Now the Pass button is highlighted via `btn-pass-recommended` instead. Multiplayer always used the highlight; solo now matches.
- **Post-out bot delay**: bots play at 1500ms each after the human is out (was 50ms). Skip-round button is the escape hatch.
- **Hint button**: only shows in solo, on my turn, in PLAYING phase. Auto-selects the recommended cards in the hand.
- **Bot-play report**: a confirmation step ("Report bot Athena's A♥ as a bad play? Yes / No") before actually submitting, to filter misclicks.
- **Friend invite popup**: top-right slide-in. Recipient sees it anywhere in the app.

---

## 10. Current Progress

### Completed

- Full Tichu rules engine with all special cards, scoring, 1-2 victory, last-player tricks transfer.
- Dealing, passing phase, grand tichu / tichu calls, dragon give, mahjong wish (with bomb-fulfillment).
- 5 bot tiers with measured tier ladder.
- MC bot with information-set determinization, partner-Tichu-aware evaluation, four-player Tichu scoring.
- Solo, multiplayer (room codes), public matchmaking.
- Reconnect (2-min window) + bot replacement.
- Persistent in-progress rooms across server restart.
- Authentication: register, login, logout, change password, delete account, Google OAuth, forgot/reset password.
- Friends: request, accept, reject, remove, search, online status.
- **Friend-to-game invite (in-session MVP)**.
- Leaderboard (per-user + per-bot-tier ELO).
- Round-by-round score history.
- Spectator mode + live games viewer.
- Tutorial + quick guide.
- Solo "Hint" button using Unfair-tier MC.
- **Bot decision logging** with full per-play context.
- **Player report-a-bot-play** + admin grouping endpoint.
- Tests: 308 passing (engine, room, auth, scoring, cards, combinations).
- Helmet CSP, rate limits, drain-deploy.
- Auto-deploy from `main` via GitHub Actions.

### Partially completed

- **Bot AI**: most "stupid play" complaints are filtered; the bot still has gaps in opponent modeling.
- **Forgot-password**: code is wired, SMTP env vars not set on prod.
- **Google sign-in**: code is wired, `GOOGLE_CLIENT_ID` not set on prod.
- **AI-reviewer pipeline**: tables exist but the live pipeline is experimental.
- **i18n**: English complete, Greek partial.
- **Profile pic picker**: works but UX is rough.

### Not started

- **MC cross-check on bot-play reports** — schema reserved, not implemented.
- **Replay viewer for finished games** — events logged, no UI.
- **End-of-game "Play again" prompt** — explicitly listed as the highest-leverage retention TODO.
- **Bot personalities** (aggressive / defensive / etc.) — single algorithm with budget knob.
- **Per-action delay tuning** (bombs / Tichu calls slower than passes for drama) — proposed, not built.
- **Real Sentry / error reporting**.

### Broken / buggy

- **Grand Tichu phase has no timer** in multiplayer (rooms can stall — `TESTING_NOTES.md`).
- **Waiting rooms lost on deploy** (only active games persist).
- `budget-sim.ts` has a known double-swap bug — do not trust its output without a fresh bias test first.
- `BotAI.ts` has a handful of unused-import TS hints — not breaking, just dead code.
- Long nicknames overflow some seat boxes on small screens.
- Two open browser tabs joining the same room can confuse `socketToRoom`.

---

## 11. Important Past Decisions

### Built

- **Bot decision logging** (commit `3d0c236`): persist `event.data.bot.{tier,branchTag,hand,trickTop,...,wish,finishOrder,scores}` for every bot PLAY/PASS/BOMB. Now every prod game produces a queryable decision trace.
- **Player bot-play report system** (commit `a972c00`): minimal pipeline — flag plays by event id, dedup on (event, reporter), daily quota, group-by-branch in admin. Designed to convert single-player debugging into multi-player signal.
- **Solo hint button** (commit `d99f816`): MC-powered hint, gated to solo + my turn + PLAYING. Avoids info leak in multiplayer. One hint per turn.
- **Friend-invite MVP** (commit `8e6b9c9`): in-session only, no DB persistence, dedup with override-on-different-inviter rule.

### Not built (and why)

- **MC cross-check on reports**: deferred. Engine-state reconstruction from recorded data is ~150 lines, easy to get subtly wrong, and we wanted to validate raw signal first.
- **Real-time AI commentary** (suggested): big effort, niche payoff.
- **Native mobile app**: 10x effort multiplier; web-on-iPad already works.
- **Tournaments / seasons**: not until a stable regular-player base exists.

### Code rewrites

- **`shouldUseBombHard`**: tightened from "trick points ≥ 10" to ≥ 15 (matching `bombPointThreshold`). Old aggressive threshold caused the rollout bots in MC to also waste bombs, hiding the value of saving (commit `4233542`).
- **`evaluateOutcome` in MC**: rewrote to score all four players' Tichu calls, not just the bot's own. This was a 400-pt blind spot in the rollout value function (commit `4233542`).
- **`partner-tichu-low` lead branch**: removed the `partnerCards < hand.length` guard which was strictly wrong (commit `2443ae8`).
- **Phoenix-save guard**: extended to use `cardInfo.remainingCards` so it catches Phoenix-on-K when Aces are still out (commit `fff30a7`).
- **Bomb-preserve & Ace-waste filters**: added at `choosePlay` level so MC pre-filter never sees bomb-breaking or Ace-pair lead candidates (commits `7b99eff`).
- **Solo auto-pass**: built (with 900ms then 5s delay), then removed entirely in favor of the multiplayer-style highlight (commit `19ee000`). User explicitly disliked the auto-pass behavior.
- **Post-out bot delay**: 50ms → 1500ms (commit `19ee000`). Original was rapid-fire fast-forward, user wanted to watch.

### Tradeoffs accepted

- **Filters over flags**: every "fix bot mistake" change in this session was implemented as a hard filter rather than a heuristic-score nudge. Reasoning: filters are easy to reason about, can't regress in MC rollouts (because rollout-bots also see the filter), and have clean unit-test surfaces.
- **MVP first, then enrich**: friend invite, hint, bot-play report all shipped as MVPs with explicit deferred work for v2.
- **One process for everything**: simpler ops, but caps scaling. Acceptable for current player count.

---

## 12. Known Bugs and Problems

### Real bugs

| # | Description | Probable location | Repro | Suggested fix |
|---|---|---|---|---|
| 1 | Grand Tichu phase has no timer; if a player doesn't decide, the room stalls forever. | `TimerManager.ts` (no timer registered) + `GameEngine.grandTichuDecision` | Multiplayer game, one player closes tab during the GT decision before timing in. | Add a 30s grand-tichu timer in `TimerManager`; on expiry, server calls `grandTichuDecision(pos, false)` for that player. |
| 2 | `budget-sim.ts` has a documented double-swap bug. | `budget-sim.ts:runTest` swaps args AND `runGame` swaps internally. | Run it. | Remove the arg swap; let only `runGame` swap. (See `bot_ai_tuning_results.md` memory for context.) |
| 3 | Waiting rooms lost on server restart. | `GamePersistence` only persists rooms with `engine !== null`. | Create a room, restart server, code is gone. | Persist waiting rooms too (smaller serializer; everyone has the room code in localStorage so reconnect works). |
| 4 | Two browser tabs joining the same room with same nickname: `socketToRoom.set` overwrites the first tab's mapping. | `RoomManager.joinRoom` line ~179 | Open same game in two tabs and try to act. | Reject duplicate connected nicknames more thoroughly, or scope by sessionId. |
| 5 | `BotAI.ts` has 7 unused-import TS hints (lines 8, 17, 247, 249, 830, 942, 1636). Not breaking, but they accumulate. | top-of-file imports | `npm run build` shows them | Run a tsc-noUnusedLocals pass with auto-fix and remove. |
| 6 | EPIPE in `uncaughtException` handler can re-fire if stdout pipe breaks (dev only). | `index.ts:326` | `pkill concurrently` while running `npm run dev`. | Wrap the `console.error` in try/catch or use `process._rawDebug`. |

### UX issues

| # | Description | Where |
|---|---|---|
| 7 | Profile pic picker is rough (per CLAUDE.md known issue). | `Profile.tsx`, avatar grid section |
| 8 | Long nicknames overflow seat boxes on small screens. | `WaitingRoom.tsx` + CSS in `App.css` |
| 9 | Greek translation is partial — many keys missing. | `i18n.ts` |
| 10 | Trick-area UI shows only the latest play on small screens (older plays scroll out). | `GameBoard.tsx` trick area + CSS |

### Known potential issues (not confirmed bugs)

- Phoenix-in-straights when Mahjong is also in the straight (`extractStraights` is dense; re-test before relying).
- Spectator mode does not surface wish-pending state cleanly.
- A player who reconnects exactly during round scoring has not been heavily tested.

### Things that ARE working but might surprise

- The hint button's recommendation may differ from what `chooseLeadHard` would pick, because the hint always uses Unfair tier (MC-on) regardless of the bots in the room.
- Auto-pass was deliberately removed in solo. The Pass button is now highlighted instead. This is the new intended behavior (commit `19ee000`).

---

## 13. Performance and Scalability

### Expensive functions

- `monteCarloEvaluate` — single-threaded, 150–400ms per call.
- `findAllCombinations` and `findPlayableFromHand` — exponential on hand size in pathological cases. Hands top out at 14 cards so it's bounded, but the constant factor is real.
- `engine.clone()` — used by MC; deep-clones the entire game state per simulation.

### Bot simulation cost

- Per Unfair decision: ~400ms.
- Per game: a few dozen Unfair decisions per game (only on the bot's turns and only for hard+ tiers).
- Concurrent budget: about 3 simultaneous Unfair-tier games before noticeable lag on a single Node process.

### Server load

- Each socket: ~kB/s in steady state (mostly empty pings).
- Per game: a hundred or so DB writes (game_events).
- DB is SQLite on local disk — fast for this volume.

### Behavior with many users

- Many idle waiting rooms: fine (rooms get cleaned at 30min idle).
- Many active games: CPU bound on MC for hard+ tiers.
- Many active games on medium / easy tiers: easily 100+ concurrent.

### Optimization opportunities

- **Object pool for Card arrays** in MC rollouts (less GC pressure).
- **Stop re-computing `cardInfo`** inside `findBestFollowCard` when it didn't change (memoize per turn).
- **Parallelize MC** across worker threads (Node 20 supports this, but the engine state needs to be cloneable across workers — `engine.serialize` is JSON, so feasible).
- **Persist-rooms write is debounced** at 5s — fine.

### Quick wins

- Bump from `target: ES2022` to `ES2023` (uses native `Array.prototype.findLast`) — small code-size win.
- Run `npm prune --production` in Docker — image size win.

### Long-term scalability

- If concurrent games > 50ish: move MC to worker threads.
- If concurrent connections > 1000: introduce Socket.IO Redis adapter and run multiple Node processes behind a load balancer with sticky sessions.
- If DB volume > GB: SQLite is still fine; move to Postgres only if multi-process write contention shows up.

---

## 14. Testing and Debugging

### Existing tests

- `packages/shared/src/__tests__/cards.test.ts` (19)
- `packages/shared/src/__tests__/combinations.test.ts` (54)
- `packages/shared/src/__tests__/scoring.test.ts` (12)
- `packages/server/src/__tests__/GameEngine.test.ts` (106 — covers phases, plays, special cards, regression cases)
- `packages/server/src/__tests__/RoomManager.test.ts` (64)
- `packages/server/src/__tests__/AuthService.test.ts` (53)

Total: **308 tests passing as of `19ee000`.**

### Manual testing scenarios

| What | How |
|---|---|
| Solo game end-to-end | Lobby → "Play vs bots" → finish a round, verify scoring; finish a game, verify ELO updates. |
| Bot doesn't break a bomb | Hand a bot 4 of one rank + AAA; observe bot leads pair-of-9 or similar instead of AAA-99 or AAA-XX. |
| Bot doesn't burn Phoenix on K when Aces out | Engineer a follow situation where Phoenix is the only beat for a K and Aces are still out. |
| Hint suggests something sane in solo | Click 💡 on your turn in solo. |
| Report bot play | Open the modal, flag a play, then check `/admin/api/bot-reports`. |
| Friend invite | Two browsers, one logged in as A and one as B (mutual friends). A creates a waiting room. A clicks "Invite friend" → picks B. B sees popup. B accepts → joins room. |
| Reconnect | Mid-game, refresh the tab. Should rejoin within 2 minutes. |
| Drain deploy | `curl -X POST /admin/api/drain` with the API key; new rooms blocked, current games finish. |
| Bot-replacement on disconnect | Two clients, close one mid-game. After 30s a bot takes over. |

### Bot testing

- **Self-play 50/50 sanity**: `npx tsx packages/server/src/bias-test.ts` — should be near 50/50; if not, the framework is broken before you measure anything else.
- **A/B feature flag**: `npx tsx packages/server/src/versus-tier-sim.ts 10000 medium medium none flagName`.
- **Branch fire rates**: `npx tsx packages/server/src/instrument-sim.ts 1000 medium`.
- **Tier ladder check**: `npx tsx packages/server/src/versus-tier-sim.ts 50 hard extreme`.

### Multiplayer testing

Two browsers, two accounts (or guest + auth), one creates room, the other joins. Test reconnect by closing one mid-game.

### Recommended tests to add

- **BotAI unit tests**: every recently-fixed bot mistake should have a 10-line test. None exist yet — all bot fixes have been sim-validated only. This is the single highest-leverage test gap.
- **MonteCarloSim test**: at minimum a "candidate filter" test that confirms bombs/Phoenix/Ace-waste are stripped from the candidate list.
- **Wish-bomb-fulfillment test** at the engine level (the regression test exists for the auto-cancel bug, not for the bomb-fulfills-wish path).
- **TimerManager test**: there are none, and timers are easy to break.

### Debugging tips

- `GameMonitor` is a thin wrapper around DB writes; logs land in `server_logs`. Add a `monitor.log(...)` call where you need a breadcrumb.
- The admin `/admin` UI has a SQL query box — read-only SELECT, very useful for poking at game_events / bot_play_reports.
- Each bot decision has its full context in `event.data.bot.*`. To inspect a real game, query `game_events` for the relevant `game_id` and parse the JSON.
- `monitor.botActionError` is fired when a bot move throws. Search server_logs for `bot_action_error`.

---

## 15. Coding Style and Conventions

### Naming

- Files: kebab/camel-case mixed; classes use `PascalCase.ts` (`GameEngine.ts`), modules with multiple exports use lowercase (`combinations.ts`, `cards.ts`).
- Types: `PascalCase`. Type-only imports use `import type`.
- Functions: `camelCase`.
- Enum members: `UPPER_CASE` for game phases, `PascalCase` for combinations.

### File organization

- Server: each file is one class or one module (e.g., `BotAI.ts` exports the class + helpers). Tests live in `__tests__/`.
- Client: each component is its own file. Stores live in `stores/`. Hooks in `hooks/`.
- Shared: split by concern (types, cards, combinations, scoring, constants).

### Component style

- React function components with hooks. No class components.
- Zustand selectors used per-state-slice (e.g., `useGameStore(s => s.gameState)`).
- No CSS-in-JS; all styles in `App.css`.

### State management

- One Zustand store per concern.
- Server is the source of truth for game state; client mirrors it.
- Server-computed action flags (`canAct`, `canPass`, `mustPass`, etc.) are on `ClientGameState` — client should NOT recompute legality.

### Comments

- Sparse. Most code is self-documenting.
- Long blocks (especially in BotAI, MonteCarloSim, scoring) have leading docstrings explaining the rule or invariant.
- Recent commits added explanatory comments on the filter functions; follow that pattern when adding more.

### Patterns to follow

- Bot heuristics: each branch should call `this.tag('group:branch-name')` so it shows up in `instrument-sim`.
- New bot rules: prefer hard filters at `choosePlay` over scoring tweaks.
- New socket events: define in `shared/types/events.ts` first, then implement on both sides.
- Validation: server validates everything; client never trusts itself.
- DB migrations: append to the `addColumnMigrations` list in `Database.ts:initSchema` (try/catch ALTER TABLE).

### Patterns to avoid

- **Computing legality on the client.** Done a few times historically and led to drift; new code should rely on server flags.
- **Mutating game state outside the engine.** All mutations go through `GameEngine` methods.
- **Calling the BotAI directly from the client.** Bots are a server-only construct.
- **Adding global state to the engine.** Each room has its own engine; engines are independent.

### Vibe-coded sections

- `App.css` is large and has had organic growth — feel free to tidy.
- `BotAI.ts`'s heuristic body is dense; the **filters** are clean but the per-branch logic has many small ifs that have accumulated over time.
- Some of the older sim scripts (`simulate.ts`, `simulate-play.ts`) are vestigial and could be deleted.

---

## 16. Security and Safety

### What's safe

- **Server-authoritative game state**: clients can't manipulate it directly. Every action goes through `GameEngine` which validates and throws on illegal moves.
- **Per-socket rate limiting**: 20 actions / 5s default; tighter limits on create/join/spectate/auth/report.
- **Helmet CSP**: tight default-src, explicit allowlists for Google OAuth.
- **Auth**: scrypt with N=16384, 32-byte salt, timing-safe comparison; 5 failed logins → 15-min lockout; sessions stored hashed.
- **HttpOnly + SameSite cookies** for auth.
- **Trust-proxy enabled** for nginx X-Forwarded-For.
- **Admin `/admin/api/query`** blocks INSERT/UPDATE/DELETE/DROP/ALTER/PRAGMA + pragma_ functions.
- **Admin password**: SHA-256 hash with timing-safe compare.
- **Bot decisions persisted server-side**: clients can't fake bot reports for plays they weren't in (validated via `userWasInGameForEvent`).

### Things to be aware of

- **Room codes are 4 letters from a 22-letter alphabet** = 22^4 ≈ 234K combinations. Not cryptographic; relies on obscurity. Anyone who guesses or shares a code can join (or spectate). Acceptable for the threat model.
- **Bots cannot cheat** — they only see public info via their `BotAI.choosePlay(hand, currentTrick, wish, ...)` arguments, and `cardInfo` is built from the played-cards list.
- **Spectator mode shows all hands** (intentional). Make sure `room:spectate` isn't accidentally accessible to in-game players.
- **`game:event` broadcasts can carry bot decision data** (the `event.data.bot.hand` field). Currently only emitted for *bot* events. **Do NOT extend this enrichment to human events** — that would leak the human's hand to other players.

### Authentication

- Optional. Guests play fine. Auth gates: friends, friend-invites, leaderboard, hint button (for now), bot reports.
- Sessions max 10 per user; cleanup on interval.

### Exposed env vars

- `DATA_API_KEY` is not documented in plaintext git. The current rotated value lives at `/home/dev/cyprus/.env` and may be committed only as encrypted `secrets/cyprus.production.env.age`. It's a bearer token for admin API. **Treat as secret.**
- Google client ID is public-by-design in client builds; the secret lives only on the server.

### Pre-public-deploy checklist

- Set `SMTP_*` so password resets work (currently not set on prod).
- Set `GOOGLE_CLIENT_ID` if Google sign-in is wanted (currently not set on prod).
- Rotate `DATA_API_KEY` and `ADMIN_PASSWORD_HASH` if the team has changed.
- Run a `bias-test` and a 1K-game `instrument-sim` to verify no regressions before pushing.

---

## 17. Deployment Status

### Current platform

- **Digital Ocean droplet** at `165.245.175.45`, hostname `aegist.dev`.
- User `dev` (no sudo). Services managed via `nohup` + the deploy scripts.
- Nginx reverse proxy on 80/443 → `localhost:3001`.
- Auto-deploy on push to `main` via GitHub Actions.

### Build status

- Builds clean as of `19ee000`. All 308 tests pass.

### Required env vars on prod

- `DATA_API_KEY` (set)
- `ADMIN_PASSWORD_HASH` (set)
- `NODE_ENV=production` (set)
- `PORT=3001` (set)
- `GOOGLE_CLIENT_ID` (NOT set; Google sign-in inactive)
- `SMTP_*` (NOT set; password reset emails inactive)

### Deploy scripts

- `deploy/restart.sh`: full pull + build + killstart.
- `deploy/killstart.sh`: kill old PID (with `fuser -k` fallback) + nohup new process.
- `deploy/rebuild.sh`: build only.

### Manual deploy

```bash
# from your local machine
git push origin main             # auto-deploys via GitHub Actions

# or on the server
ssh root@165.245.175.45
sudo bash /home/dev/cyprus/deploy/restart.sh
```

### Drain deploy (graceful)

```bash
curl -X POST https://aegist.dev/admin/api/drain \
  -H "Authorization: Bearer $DATA_API_KEY"
# wait for activeGames=0, then:
curl -X POST https://aegist.dev/admin/api/shutdown \
  -H "Authorization: Bearer $DATA_API_KEY"
```

### Health check

```bash
curl https://aegist.dev/health
# {"status":"ok","commit":"…","commitMessage":"…","commitDate":"…","activeConnections":N}
```

### Blockers before public release

- Profile-pic picker UX rework.
- SMTP and Google Client ID env vars set.
- Tighter MP tests (especially Grand Tichu timer).

---

## 18. Recommended Next Steps

### Immediate next steps

1. **Add a Grand Tichu timer** in multiplayer (`TimerManager`). Without this a single AFK player can stall a room indefinitely.
2. **Persist waiting rooms** (not just active games). One small change in `GamePersistence.serializeRooms`.
3. **Fix `budget-sim.ts` double-swap bug** OR delete the file (it's misleading right now).
4. **Add the first BotAI unit tests** for the recent bot fixes (bomb-preserve, Ace-waste, Phoenix-on-K, partner-Tichu-low). Each fix has a simple "given this hand and trick state, the bot should pick X" assertion.
5. **End-of-game "Play again"** — small UX win, leverages existing room infrastructure.

### Short-term improvements

- **MC cross-check on bot-play reports**: build the engine-state reconstruction, run MC, store agreement column. ~1.5–2h.
- **Replay viewer**: same machinery as MC cross-check, surfaces in UI.
- **In-game stats page** (per-user): the data is already in `user_stats`, just needs a UI.
- **Dragon-on-low-trick filter** in heuristic path (currently the existing `dragonFollowMinPoints` guard works only via MC pre-filter).
- **Profile pic picker** rework — open question but it's a known UX gap.
- **i18n cleanup**: complete the Greek translation or remove the language switcher.

### Long-term improvements

- **Worker-thread MC**: move `monteCarloEvaluate` to a worker pool so concurrent unfair-tier games don't bottleneck.
- **Opponent modeling in MC**: weight determinization by the cards passed to/from each player and the cards each player has played.
- **Bot personalities**: aggressive / defensive / bluffer knobs.
- **Self-play training corpus**: with the decision-context logging now in place, a million-game corpus could feed offline policy training.
- **Admin dashboard for bot reports** (HTML page, not just JSON endpoint).

### Bot/AI roadmap

1. Lock in current fixes with unit tests.
2. Build MC cross-check; let signal accumulate for a few weeks.
3. Inspect top-of-disagreement-rate branches; prioritize fixes there (data-driven instead of intuition-driven).
4. Once bot quality plateaus on filters: try a stronger rollout policy (currently `hard` heuristic).
5. Long-term: opponent modeling + worker-thread MC.

### Multiplayer/Rooms roadmap

1. Grand Tichu timer.
2. Persist waiting rooms.
3. Tighter dup-tab handling in `RoomManager.joinRoom`.
4. Friend invites: persist offline invites so a friend can come online and see the invite later.
5. End-of-game "Play again" prompt with same lobby.
6. (Eventually) tournaments / scheduled events.

---

## 19. Instructions for the Next AI Assistant

### Read first

1. **This file** end to end.
2. **`CLAUDE.md`** — has project conventions, command shortcuts, auto-deploy info, and `DATA_API_KEY` handling instructions.
3. `packages/shared/src/types/game.ts` and `packages/shared/src/types/events.ts` — the contract between server and client.
4. `packages/server/src/GameEngine.ts` — the rules engine.
5. `packages/server/src/BotAI.ts` (top of file: `BotConfig`, `DEFAULT_BOT_CONFIG`, the choosePlay flow).
6. `packages/server/src/SocketHandler.ts` (the event registration pattern, especially the rate-limit + auth checks).

### Most important files

- `BotAI.ts` — the hot spot for AI improvements.
- `GameEngine.ts` — the hot spot for rules fixes.
- `SocketHandler.ts` — the hot spot for new client/server interactions.
- `Database.ts` — the schema. Migrations are ALTER TABLE in a try/catch list.
- `gameStore.ts` (client) — most user-visible state changes route through here.

### What NOT to break

- **The wire contract in `events.ts`**: client and server are tightly coupled to it. Changes need to be additive (new events / new optional fields) unless you control both ends of a deploy.
- **`event.data.bot.*` enrichment**: only emit it for bot events. NEVER attach human hand data to an event broadcast.
- **The 308 existing tests**: run them on every server change.
- **The shared package build order**: shared must be built before server.

### What's fragile

- **MC determinization** — if the engine state isn't valid (e.g. orphaned cards in player hands), MC will throw inside rollouts.
- **Persisted-rooms restore** — `GamePersistence` is brittle; if you change `Room` shape, write a migration.
- **Socket.IO reconnection** — relies on cookies for auth and sessionId for room. Don't change cookie name (`SESSION_COOKIE`) or break the `session:reconnect` flow lightly.
- **Bot rollout-bot reuse**: `MonteCarloSim` shares `rolloutBots[hard]` instances across all sims. If you mutate per-instance state on `BotAI`, this will leak across calls. Currently safe because `inRollout` is set once and `lastBranch` is overwritten harmlessly.

### Assumptions to preserve

- Server is authoritative.
- Bots run only server-side.
- All game IDs / event IDs are SQLite autoincrement.
- Card IDs are stable strings (`JADE_7`, `PHOENIX`).
- Position 0 is the room creator (initial nickname). Solo bots are at 1/2/3.
- Teams are `[0,2]` vs `[1,3]`.

### Areas needing refactoring

- `App.css` — split into per-component files.
- Older sim scripts (`simulate.ts`, `simulate-play.ts`, `versus-sim.ts`, parts of `budget-sim.ts`) — most are dead. Audit and delete.
- `BotAI.ts` per-branch logic in `chooseLeadHard` / `chooseFollowHard` — long, dense. Could split into per-branch functions.

### How to continue smoothly

1. Make small, surgical commits. Commit messages in this repo are descriptive (read recent commits for style).
2. For bot changes: run `npm test`, run `bias-test`, run `versus-tier-sim` 10K games before / after.
3. For UI changes: build the client and click through Lobby → Solo game → first round.
4. For server changes: build, restart, hit `/health`.
5. Push only to `dev` first if you're nervous; merge to `main` to deploy.
6. **Read [`docs/notes/`](docs/notes/) before starting on bot work** — those three
   files (copied from prior assistant memory) encode every tuning experiment, the
   hard "never break a bomb" rule, and the simulation workflow lessons.

---

## 20. Final Summary

**What this is right now:** a working, deployed, full-featured Tichu game. Solo and multiplayer both work end-to-end. Authentication, friends, leaderboard, spectate, and friend-invites are all live. The bots are decent — measurable tier ladder from medium → hard → extreme → unfair, and recent work has eliminated the most egregious "stupid play" categories (bomb-breaking, Ace-waste, Phoenix-on-K when overtakeable, Dragon-lead against Tichu).

**Stability:** stable. 308 tests pass. The deploy pipeline is automated. There are no known data-loss bugs. The known issues are UX paper-cuts (profile pic picker, Greek translation) and one stall risk in multiplayer (Grand Tichu phase has no timer).

**Main technical risks:**
1. Single Node process — concurrent Unfair-tier games CPU-bottleneck around ~3.
2. Multiplayer Grand Tichu can stall a room.
3. SQLite migrations are append-only `ALTER TABLE` in a try/catch list — easy to forget to add to.
4. The `evaluateOutcome` and pre-filter logic in MC are tuning-sensitive; large changes risk regression.

**Best next step:** add the Grand Tichu timer (1-hour fix, removes the only known room-stall vector) and the first BotAI unit tests (locks in the work this session against future regressions). Then tackle the MC cross-check on bot-play reports — once that's in, you have a real signal-driven loop for further bot improvements.

The codebase is in good shape for handoff. The hard parts (rules engine, MC, room lifecycle, auth) are stable. The interesting growth surface is in bot AI and UX polish.
