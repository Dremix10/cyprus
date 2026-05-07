# First 30 Minutes — Codex Onboarding

A concrete sequence for a fresh AI assistant (or new human contributor) to go from zero
to "I can confidently make a small change."

## Goal of this doc

By the end of these steps you should:
- Have the project cloned, installed, building.
- Have run all 308 tests successfully.
- Have run a 1000-game bot simulation locally.
- Have viewed a solo game in the browser end-to-end.
- Know where the most-changed files are.

## Step 0: Read first

Three files, in order, ~10 min:

1. [`PROJECT_HANDOFF.md`](../PROJECT_HANDOFF.md) — the master handoff. Skim sections
   1–4 (overview, run, files, architecture). Read section 11 (past decisions) and
   section 19 (instructions for the next assistant) carefully.
2. [`CLAUDE.md`](../CLAUDE.md) — project conventions, deployment, the live
   `DATA_API_KEY`.
3. [`docs/notes/bot_never_break_bomb.md`](notes/bot_never_break_bomb.md) — one of the
   few absolute rules. Internalize it before touching any bot code.

## Step 1: Get it building (≈ 5 min)

```bash
cd /path/to/cyprus
npm install        # installs all 3 workspaces; better-sqlite3 will compile
npm run build      # builds shared, server, client in order
```

Common gotchas:
- If `better-sqlite3` install fails, you're missing `python3 / make / g++`.
- If a server import fails with `Cannot find module '@cyprus/shared'`, you skipped
  `npm run build --workspace=packages/shared`.

## Step 2: Run tests (≈ 1 min)

```bash
npm test
```

Expect **308 tests passing** (106 GameEngine + 64 RoomManager + 53 AuthService +
85 in shared). If any fail, you have a broken environment, not a broken project.

## Step 3: Run a bot simulation (≈ 1 min)

```bash
npx tsx packages/server/src/bias-test.ts
```

Should report ~50/50 over 200 games in <30 seconds. This validates that the simulation
framework itself isn't biased. **Always run this before doing any bot A/B testing.**

Then:
```bash
npx tsx packages/server/src/instrument-sim.ts 1000 medium
```

You'll see a table of branch-tag fire rates. Compare with
[`BRANCH_TAGS.md`](BRANCH_TAGS.md) — they should match.

## Step 4: Spin up the dev server (≈ 2 min)

```bash
npm run dev
```

Two concurrent processes start:
- Server on `http://localhost:3001`
- Client on `http://localhost:5173`

Open `http://localhost:5173`. You should see the lobby.

## Step 5: Play a solo game (≈ 5 min)

1. Lobby → enter nickname → "Play vs bots" → choose `medium` difficulty → start.
2. Click cards in your hand to select, click Play. Pass when you can't beat the trick.
3. Try the **Hint** button (yellow 💡 in the header) — it should auto-select the cards
   it recommends.
4. Try the **Report bot play** button — flag a play, then check it landed:
   ```bash
   sqlite3 packages/server/data/cyprus.db "SELECT * FROM bot_play_reports;"
   ```

## Step 6: Tour the most-changed files (≈ 8 min)

In order of how often they're modified:

1. [`packages/server/src/BotAI.ts`](../packages/server/src/BotAI.ts) — open it, search
   for `choosePlay` (top of method ≈ line 720). Read down through the candidate filter
   block (`filterBombPreserving`, `filterAceWasteInLeads`). This is where bot
   improvements happen.

2. [`packages/server/src/MonteCarloSim.ts`](../packages/server/src/MonteCarloSim.ts) —
   ~380 lines. Search for `evaluateOutcome` — that's the rollout value function. It
   correctly scores all 4 players' Tichu calls; do not regress that.

3. [`packages/server/src/GameEngine.ts`](../packages/server/src/GameEngine.ts) — open
   it, search for `playCards` and `passTurn`. These are the two most-touched methods.
   Most rules bugs surface here.

4. [`packages/server/src/SocketHandler.ts`](../packages/server/src/SocketHandler.ts) —
   search for `socket.on(` to see all registered events. Most new client/server
   features start here.

5. [`packages/client/src/components/GameBoard.tsx`](../packages/client/src/components/GameBoard.tsx) —
   the playing UI. ~600 lines.

## Step 7: Inspect a real game from production (≈ 3 min)

```bash
# Find a recent game
curl -s -X POST https://aegist.dev/admin/api/query \
  -H "Authorization: Bearer $DATA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT id, room_code, started_at FROM games ORDER BY id DESC LIMIT 5"}'

# Pull its events
curl -s -X POST https://aegist.dev/admin/api/query \
  -H "Authorization: Bearer $DATA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT event_type, player_position, data FROM game_events WHERE game_id = <ID> ORDER BY id ASC LIMIT 50"}'
```

Look at the `data` column for a bot PLAY/PASS — it has the full decision context
(`bot.branchTag`, `bot.hand`, `bot.trickTop`, etc.). This is what bot debugging looks
like in production.

## Step 8: Make a tiny change (≈ 5 min)

Pick something trivial to confirm your edit-build-test loop works:

1. Open [`packages/server/src/BotAI.ts`](../packages/server/src/BotAI.ts).
2. Find a comment to fix or a TODO.
3. Save. The dev server auto-reloads (server has `tsx watch`).
4. Run `npm test --workspace=packages/server` — should still be 106 passing.
5. Don't commit; you're done.

## You're ready

If all of that worked, you can confidently:
- Pick a bug from the [`PROJECT_HANDOFF.md`](../PROJECT_HANDOFF.md) Known Bugs section.
- Open the relevant file using the references above.
- Make the change with tests + simulation if appropriate.

## When in doubt

- **Bot logic changes**: read [`BOT_CONFIG.md`](BOT_CONFIG.md) and
  [`docs/notes/bot_ai_tuning_results.md`](notes/bot_ai_tuning_results.md) before
  proposing anything new — many ideas have already been tested and rejected.
- **Adding a socket event**: declare in `events.ts` first, then implement on both
  ends. See [`SOCKET_EVENTS.md`](SOCKET_EVENTS.md) for conventions.
- **Schema changes**: append an `ALTER TABLE` to the migration list in `Database.ts`.
  See [`DATABASE_SCHEMA.md`](DATABASE_SCHEMA.md).
- **Anything risky**: there are 308 tests; run them. There's no CI gate, so it's on you.
