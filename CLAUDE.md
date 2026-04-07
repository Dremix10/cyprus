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

## Deployment

- **Server**: Digital Ocean droplet at `165.245.175.45`
- **User**: `dev` (no sudo — need root for process management)
- **Nginx** proxies port 80 -> localhost:3001
- **Deploy**: `sudo bash deploy/killstart.sh` (kills old server, starts new one)
- **Full deploy** (pull + build + restart): `sudo bash deploy/restart.sh`
- **Rebuild only**: `bash deploy/rebuild.sh`
- **Logs**: `tail -f server.log`
- **Health**: `curl localhost:3001/health`
- **Admin dashboard**: http://165.245.175.45/admin (password-protected)

## Architecture

### Server (`packages/server/src/`)
- `index.ts` — Express app, Socket.IO setup, helmet security headers, HTTP request logging, admin routes, graceful shutdown (SIGTERM/SIGINT), uncaught error handlers
- `SocketHandler.ts` — All socket event handlers, rate limiting (per-socket + per-IP), DB event logging, bot action scheduling, turn timers (60s), disconnect→bot replacement (2min), session reconnect, room persistence (debounced to disk every 5s)
- `RoomManager.ts` — Room CRUD, player join/reconnect, session-based auth (UUID v4), nickname validation, seat management, room serialization/restore for crash recovery
- `GameEngine.ts` — Tichu game logic, all phases (Grand Tichu → Passing → Playing → Scoring), card combinations, wish enforcement, serialize/restore for persistence
- `BotAI.ts` — Bot AI (easy/medium/hard), Greek-themed bot profiles with avatars
- `Database.ts` — SQLite tracker (better-sqlite3): connections, players, games, events, HTTP requests
- `AdminDashboard.ts` — `/admin` routes with password auth (SHA-256, timing-safe compare)

### Client (`packages/client/src/`)
- `stores/roomStore.ts` — Zustand store for room/connection state, session-based auto-reconnect (localStorage)
- `stores/gameStore.ts` — Zustand store for game state
- `components/GameBoard.tsx` — Main game UI, trick display, player areas
- `components/PlayerHand.tsx` — Card hand display with received-card indicators
- `hooks/useSocketEvents.ts` — Socket.IO event listeners

### Shared (`packages/shared/src/types/`)
- `events.ts` — Socket event type definitions (ClientToServerEvents, ServerToClientEvents)
- `game.ts` — Game state types, card types, combination types
- `player.ts` — Player position, player state types

## Session & Reconnect Flow

Players get a `sessionId` (UUID v4) on create/join, stored in localStorage. On page refresh or server restart, the client emits `session:reconnect` with the stored sessionId. The server maps sessionId → room/position and restores the player. If a player disconnects for >2 minutes during a game, they are replaced by a bot and the session is invalidated.

## Security

- **Helmet** security headers (CSP, etc.) on all HTTP responses
- **Rate limiting**: per-socket (20 actions/5s), per-IP connections (20/min), room create/join (5/30s), session reconnect (5/30s)
- **Nickname validation**: 1-20 chars, alphanumeric + spaces/dashes/accented chars only
- **Admin auth**: SHA-256 password hash with timing-safe comparison
- **Trust proxy**: enabled for nginx X-Forwarded-For headers
- **Graceful shutdown**: cleans up timers, persists rooms, closes DB

## Collaborators

- **Dremix10** (GitHub) — co-developer, pushes game features (bot AI, UI, tutorials)

## Known Issues

- Bot phase race condition: bots occasionally try Grand Tichu decision after phase moved to PASSING (non-blocking error in logs)
