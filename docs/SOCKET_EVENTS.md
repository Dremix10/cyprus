# Socket.IO Events Catalog

Source of truth: [`packages/shared/src/types/events.ts`](../packages/shared/src/types/events.ts).
Both `ClientToServerEvents` and `ServerToClientEvents` are typed and used by both ends.

## GameEvent (delta inside `game:event`)

```ts
type GameEvent = {
  id?: number;            // populated server-side after persist; lets clients reference it
  type: GameEventType;
  playerPosition?: PlayerPosition;
  data?: Record<string, unknown>;
};
```

`GameEventType` ∈ `PLAY | PASS | BOMB | TICHU_CALL | GRAND_TICHU_CALL | TRICK_WON |
DRAGON_GIVEN | WISH_MADE | WISH_FULFILLED | PLAYER_OUT | ROUND_END | GAME_OVER`.

For bot PLAY/PASS/BOMB events, `data.bot` is enriched with full decision context (see
[`BRANCH_TAGS.md`](BRANCH_TAGS.md) for which fields).

## Client → Server events

| Event | Payload | Callback response | Notes |
|---|---|---|---|
| `room:create` | `(nickname, targetScore, difficulty)` | `{ roomCode, sessionId }` or `{ error }` | Multiplayer room. Creator gets position 0. |
| `room:create_solo` | `(nickname, targetScore, difficulty)` | `{ roomCode, sessionId }` or `{ error }` | 3 bots auto-fill positions 1/2/3. |
| `room:join` | `(roomCode, nickname)` | `{ success: true, sessionId }` or `{ error }` | Joins existing room (or reconnects by nickname). |
| `room:sit` | `(position)` | (no callback) | Pre-game seat change. |
| `room:start` | `()` | (no callback) | Host starts the game. |
| `room:spectate` | `(roomCode)` | `{ success: true, roomCode }` or `{ error }` | Joins as spectator (sees all hands). |
| `session:reconnect` | `(sessionId)` | `{ success: true, roomCode, nickname, hasGame }` or `{ error }` | Reconnect after disconnect / page refresh. |
| `matchmaking:join` | `(nickname, targetScore)` | `{ success: true }` or `{ error }` | Join public queue. |
| `matchmaking:leave` | `()` | `{ success: true }` or `{ error }` | Leave queue. |
| `game:grand_tichu_decision` | `(call: boolean)` | (no callback) | Decide on Grand Tichu after seeing first 8 cards. |
| `game:pass_cards` | `({left, across, right})` | (no callback) | Submit your 3-card pass. |
| `game:undo_pass` | `()` | (no callback) | Take back a not-yet-finalized pass. |
| `game:play` | `(cardIds: string[])` | (no callback) | Play these cards. Server validates. |
| `game:pass_turn` | `()` | (no callback) | Pass on the current trick (cannot pass when leading or when wish forces a play). |
| `game:call_tichu` | `()` | (no callback) | Call Tichu (must not have played any cards yet this round). |
| `game:dragon_give` | `(opponentPosition)` | (no callback) | After winning a Dragon trick, give it to one opp. |
| `game:wish` | `(rank: NormalRank)` | (no callback) | After playing Mahjong, wish for a rank 2–14. |
| `game:next_round` | `()` | (no callback) | Continue to the next round after scoring. |
| `game:skip_round` | `()` | (no callback) | Skip ahead through the rest of a round (used after going out). |
| `game:resync` | `()` | (no callback) | Request fresh `game:state`. Auto-fired every 15s by client + on `game:error`. |
| `friend:invite:send` | `(friendUserId)` | `{ success: true }` or `{ error }` | Invite a friend to your waiting room. Auth required. |
| `friend:invite:accept` | `()` | `{ success: true, roomCode, sessionId }` or `{ error }` | Accept the current pending invite. |
| `friend:invite:decline` | `()` | `{ success: true }` or `{ error }` | Decline the pending invite. |
| `bot:report-play` | `(gameEventId)` | `{ success: true }` or `{ error }` | Flag a bot play. Auth required. |
| `game:hint` | `()` | `{ play: cardIds }`, `{ pass: true }`, or `{ error }` | Request a Monte-Carlo hint. **Solo only**, must be your turn, must be PLAYING phase. |

## Server → Client events

| Event | Payload | When it fires |
|---|---|---|
| `room:state` | `(state: RoomState)` | After any room change. Includes `isStartable` and player list. |
| `game:state` | `(state: ClientGameState)` | After any game change. Includes server-computed action flags (`canAct`, `canPass`, `mustPass`, `mustPlayWish`, etc.). |
| `game:event` | `(event: GameEvent)` | Per individual play/pass/bomb/etc. delta during a round. Bot events have `data.bot.*` enrichment. |
| `game:error` | `(message: string)` | Validation or rate-limit error. Client triggers a resync if it has a game. |
| `room:player_disconnected` | `(nickname)` | Toast in the room. |
| `room:player_reconnected` | `(nickname)` | Toast in the room. |
| `matchmaking:update` | `({ playersInQueue, elapsed })` | Every 5s while in queue. |
| `matchmaking:found` | `({ roomCode, sessionId })` | When 4 players are matched. |
| `matchmaking:cancelled` | `()` | If the queue times out. |
| `server:maintenance` | `({ message })` | Drain-deploy banner trigger. |
| `friend:invite:received` | `({ inviterId, inviterName, roomCode })` | Pop a slide-in invite popup. |
| `friend:invite:cleared` | `()` | Dismiss the popup (declined / expired / sister-tab accepted). |

## Conventions

- Adding a new event: declare in `events.ts` first, then implement on both ends.
- Keep changes additive (new events / new optional fields). Breaking changes require
  coordinating client + server deploy.
- Never broadcast information that should only go to one player. Specifically: `data.bot`
  enrichment is bot-only — never extend it to human plays (would leak hands).

## Rate limits (server-side)

Set in `SocketHandler.checkRate`. Per-socket buckets:

| Action | Limit | Window |
|---|---|---|
| Default game action | 20 | 5s |
| `room:create*` | 5 | 30s |
| `room:join` | 10 | 30s |
| `room:spectate` | 5 | 30s |
| `session:reconnect` | 10 | 30s |
| `friend-invite` (send) | 5 | 60s |
| `friend-invite-accept` | 10 | 60s |
| `bot-report` | 10 | 60s (+ daily quota of 20/24h DB-backed) |
| `hint` | 30 | 60s |
