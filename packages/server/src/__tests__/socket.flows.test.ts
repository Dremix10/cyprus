/**
 * End-to-end socket flows against a real Socket.IO server, RoomManager,
 * SocketHandler and a throwaway SQLite database: game length (quick game to
 * game over, recorded in the DB), matchmaking that always plays to 500, and
 * the friends-list "invite into a new lobby" flow the clients run.
 */
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { Server } from 'socket.io';
import { io as ioClient, type Socket } from 'socket.io-client';
import {
  GamePhase,
  NormalRank,
  findPlayableFromHand,
  planFriendLobbyInvite,
  runFriendLobbyInvite,
  winningTeam,
} from '@cyprus/shared';
import type { ClientGameState, PlayerPosition, RoomState } from '@cyprus/shared';
import { RoomManager } from '../RoomManager.js';
import { SocketHandler } from '../SocketHandler.js';
import { TrackerDB } from '../Database.js';

// GamePersistence writes next to the server. Put back whatever was there.
const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data');
const PERSIST = join(DATA_DIR, 'persisted-rooms.json');
const persistBackup = existsSync(PERSIST) ? readFileSync(PERSIST) : null;
const filesBefore = new Set(existsSync(DATA_DIR) ? readdirSync(DATA_DIR) : []);

const tmp = mkdtempSync(join(tmpdir(), 'cyprus-socket-flows-'));
// Captured before any test speeds up the server's timers.
const realSetTimeout = globalThis.setTimeout;
let httpServer: HttpServer;
let io: Server;
let db: TrackerDB;
let handler: SocketHandler;
let rooms: RoomManager;
let url: string;
const clients: Socket[] = [];

beforeAll(async () => {
  db = new TrackerDB(join(tmp, 'test.db'));
  httpServer = createServer();
  io = new Server(httpServer, { cors: { origin: '*' } });
  // Stand-in for the cookie/token middleware in index.ts.
  io.use((socket, next) => {
    const auth = socket.handshake.auth as { userId?: number; displayName?: string };
    if (typeof auth.userId === 'number') {
      socket.data.userId = auth.userId;
      socket.data.displayName = auth.displayName;
    }
    next();
  });
  rooms = new RoomManager();
  handler = new SocketHandler(io as never, rooms, db);
  handler.setup();
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', () => resolve()));
  url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
});

afterEach(() => {
  for (const c of clients.splice(0)) c.disconnect();
});

afterAll(async () => {
  handler.destroy();
  io.close();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  db.close();
  rmSync(tmp, { recursive: true, force: true });
  if (persistBackup) writeFileSync(PERSIST, persistBackup);
  else if (existsSync(PERSIST)) unlinkSync(PERSIST);
  if (existsSync(DATA_DIR)) {
    for (const name of readdirSync(DATA_DIR)) if (!filesBefore.has(name)) unlinkSync(join(DATA_DIR, name));
  }
});

async function connect(auth?: { userId: number; displayName: string }): Promise<Socket> {
  const socket = ioClient(url, { transports: ['websocket'], forceNew: true, reconnection: false, auth });
  clients.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
  });
  return socket;
}

function emitAck<T>(socket: Socket, event: string, ...args: unknown[]): Promise<T> {
  return new Promise((resolve) => socket.emit(event, ...args, (res: T) => resolve(res)));
}

function waitFor<T>(socket: Socket, event: string, match: (payload: T) => boolean = () => true, ms = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error(`timeout waiting for ${event}`));
    }, ms);
    const onEvent = (payload: T) => {
      if (!match(payload)) return;
      clearTimeout(timer);
      socket.off(event, onEvent);
      resolve(payload);
    };
    socket.on(event, onEvent);
  });
}

/**
 * Plays legal moves for one seat whenever the server says it may act.
 * Paced like a person (the server allows 20 actions per 5s per socket); after a
 * refusal it asks for a fresh state and tries again.
 */
function autoPlay(socket: Socket, onState: (s: ClientGameState) => void): void {
  let lastKey = '';
  let latest: ClientGameState | null = null;
  let scheduled = false;
  const keyOf = (s: ClientGameState) =>
    [s.phase, s.currentPlayer, s.players.map((p) => p.cardCount).join(','), s.wishPending, s.dogPending,
      s.trickWonPending, s.grandTichuPending, s.players[s.myPosition].hasPassed,
      s.currentTrick.plays.map((p) => p.combination.cards.map((c) => c.id).join('+')).join('/'),
      s.currentTrick.passCount].join('|');
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    realSetTimeout(() => {
      scheduled = false;
      const s = latest;
      if (!s || keyOf(s) === lastKey) return;
      lastKey = keyOf(s);
      act(socket, s);
    }, 280);
  };
  socket.on('game:error', () => {
    lastKey = '';
    realSetTimeout(() => socket.emit('game:resync'), 1200);
  });
  socket.on('game:state', (s: ClientGameState) => {
    onState(s);
    latest = s;
    schedule();
  });
}

function act(socket: Socket, s: ClientGameState): void {
  const me = s.myPosition;
  {
    if (s.phase === GamePhase.GRAND_TICHU && s.grandTichuPending) {
      socket.emit('game:grand_tichu_decision', false);
    } else if (s.phase === GamePhase.PASSING && !s.players[me].hasPassed) {
      const [a, b, c] = s.myHand;
      socket.emit('game:pass_cards', { left: a.id, across: b.id, right: c.id });
    } else if (s.phase === GamePhase.PLAYING && s.wishPending === me) {
      socket.emit('game:wish', NormalRank.TWO);
    } else if (s.phase === GamePhase.DRAGON_GIVE && s.currentTrick.currentWinner === me) {
      socket.emit('game:dragon_give', ((me + 1) % 4) as PlayerPosition);
    } else if (s.phase === GamePhase.PLAYING && s.currentPlayer === me && s.canAct && !s.players[me].isOut) {
      const plays = s.currentTrick.plays;
      const top = plays.length > 0 ? plays[plays.length - 1].combination : null;
      const options = findPlayableFromHand(s.myHand, top, s.wish);
      const wished = s.wish.active
        ? options.find((cards) => cards.some((c) => c.type === 'normal' && c.rank === s.wish.wishedRank))
        : undefined;
      if (top && s.canPass && !s.mustPlayWish) socket.emit('game:pass_turn');
      else if (wished) socket.emit('game:play', wished.map((c) => c.id));
      else if (options.length > 0) socket.emit('game:play', options[0].map((c) => c.id));
      else socket.emit('game:pass_turn');
    }
  }
}

describe('socket flows', () => {
  describe('game length', () => {
    it('keeps a quick game at 0 and clamps other lengths when a room is created', async () => {
      const cases: Array<[unknown, number]> = [
        [0, 0],
        [250, 250],
        [100, 250],
        [99999, 10000],
        ['0', 1000],
        [null, 1000],
      ];
      for (const [sent, expected] of cases) {
        const socket = await connect();
        const res = await emitAck<{ roomCode?: string; error?: string }>(socket, 'room:create', 'Host', sent, 'easy');
        expect(res.error).toBeUndefined();
        expect(rooms.getRoom(res.roomCode!)?.targetScore, `sent ${JSON.stringify(sent)}`).toBe(expected);
        socket.disconnect();
      }
    });

    it('plays a solo quick game to game over in one round, records it, and moves ELO by a third', async () => {
      // Server pacing (bot think time, trick and round pauses) is 0.4–3s per step; shrink it.
      const spy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, ms?: number, ...args: unknown[]) =>
        realSetTimeout(fn, ms !== undefined && ms >= 300 && ms <= 3000 ? 5 : ms, ...args)) as typeof setTimeout);
      try {
        const userId = db.createUser('solo_quick', 'Solo', null);
        const botEloBefore = db.getBotElo('easy').elo;
        const socket = await connect({ userId, displayName: 'Solo' });
        const states: ClientGameState[] = [];
        let errors: string[] = [];
        socket.on('game:error', (m: string) => errors.push(m));
        autoPlay(socket, (s) => states.push(s));
        const scoring = waitFor<ClientGameState>(socket, 'game:state', (s) => s.phase === GamePhase.ROUND_SCORING, 60_000);
        const res = await emitAck<{ roomCode?: string; error?: string }>(socket, 'room:create_solo', 'Solo', 0, 'easy');
        expect(res.error).toBeUndefined();

        const atScoring = await scoring;
        expect(atScoring.targetScore).toBe(0);
        expect(atScoring.roundHistory).toHaveLength(1);
        expect(states.some((s) => s.dogLead && s.phase !== GamePhase.PLAYING)).toBe(false);

        const over = waitFor<ClientGameState>(socket, 'game:state', (s) => s.phase === GamePhase.GAME_OVER);
        socket.emit('game:next_round');
        const final = await over;
        expect(final.roundHistory).toHaveLength(1);
        // Errors from a stale double-send are harmless; anything else is a bug.
        errors = errors.filter((m) => !/not your turn|waiting for|too many requests/i.test(m));
        expect(errors).toEqual([]);

        const reader = new BetterSqlite3(join(tmp, 'test.db'), { readonly: true });
        const rows = reader
          .prepare('SELECT target_score, rounds_played, final_score_02, final_score_13, winner_team, ended_at FROM games WHERE room_code = ?')
          .all(res.roomCode) as Array<Record<string, unknown>>;
        reader.close();
        expect(rows).toHaveLength(1);
        const row = rows[0];
        expect(row.target_score).toBe(0);
        expect(row.rounds_played).toBe(1);
        expect(row.ended_at).not.toBeNull();
        expect([row.final_score_02, row.final_score_13]).toEqual(final.scores);
        const winner = winningTeam(final.scores);
        expect(row.winner_team).toBe(winner === 0 ? 'Team 0-2' : winner === 1 ? 'Team 1-3' : 'Tie');

        // Same formula as applyElo, at a third of the K-factor (new player: K = 40).
        const mine = final.scores[final.myPosition % 2];
        const theirs = final.scores[1 - (final.myPosition % 2)];
        const expected = 1 / (1 + Math.pow(10, (botEloBefore - (1000 + botEloBefore) / 2) / 400));
        const actual = Math.max(0, Math.min(1, 0.5 + (0.5 * (mine - theirs)) / (Math.abs(mine) + Math.abs(theirs))));
        const elo = db.getUserElo(userId);
        if (winner === null) {
          expect(elo).toMatchObject({ elo: 1000, elo_games: 0 });
        } else {
          expect(elo.elo).toBe(Math.max(100, Math.round(1000 + (40 / 3) * (actual - expected))));
          expect(elo.elo_games).toBe(1);
        }
        expect(db.getUserLeaderboardStats(userId)).toMatchObject({ games_played: 1 });
      } finally {
        spy.mockRestore();
      }
    }, 90_000);
  });

  describe('matchmaking', () => {
    it('seats four players who picked the same length in one game of that length', async () => {
      const sockets = await Promise.all([1, 2, 3, 4].map(() => connect()));
      const found = sockets.map((s) => waitFor<{ roomCode: string }>(s, 'matchmaking:found'));
      const firstState = sockets.map((s) => waitFor<ClientGameState>(s, 'game:state'));
      for (const [i, s] of sockets.entries()) {
        expect(await emitAck(s, 'matchmaking:join', `Q${i}`, 500)).toEqual({ success: true });
      }
      const rooms = await Promise.all(found);
      expect(new Set(rooms.map((r) => r.roomCode)).size).toBe(1);
      const states = await Promise.all(firstState);
      expect(states.map((s) => s.targetScore)).toEqual([500, 500, 500, 500]);
      expect(new Set(states.map((s) => s.myPosition)).size).toBe(4);
    });

    it('answers the player who fills the table before sending them the game', async () => {
      const sockets = await Promise.all([1, 2, 3, 4].map(() => connect()));
      for (const [i, s] of sockets.slice(0, 3).entries()) await emitAck(s, 'matchmaking:join', `Order${i}`, 500);
      const last = sockets[3];
      const order: string[] = [];
      const gotState = waitFor(last, 'game:state').then(() => order.push('game:state'));
      await emitAck(last, 'matchmaking:join', 'Order3', 500).then(() => order.push('ack'));
      await gotState;
      // The other way round, the client's ack handler puts the queue screen over the game.
      expect(order).toEqual(['ack', 'game:state']);
    });

    it('plays every online match to 500, whatever length an old app asked for', async () => {
      const sockets = await Promise.all([1, 2, 3, 4].map(() => connect()));
      const found = sockets.map((s) => waitFor<{ roomCode: string }>(s, 'matchmaking:found'));
      const firstState = sockets.map((s) => waitFor<ClientGameState>(s, 'game:state'));
      for (const [i, length] of [0, 250, 1000, 500].entries()) {
        expect(await emitAck(sockets[i], 'matchmaking:join', `Any${i}`, length)).toEqual({ success: true });
      }
      const rooms = await Promise.all(found);
      expect(new Set(rooms.map((r) => r.roomCode)).size).toBe(1);
      const states = await Promise.all(firstState);
      expect(states.map((s) => s.targetScore)).toEqual([500, 500, 500, 500]);
    });
  });

  describe('friend lobby invite', () => {
    let alice: number;
    let bob: number;
    let carol: number;

    beforeAll(() => {
      alice = db.createUser('alice_flow', 'Alice', null);
      bob = db.createUser('bob_flow', 'Bob', null);
      carol = db.createUser('carol_flow', 'Carol', null);
      for (const friend of [bob, carol]) {
        expect(db.sendFriendRequest(alice, friend).success).toBe(true);
        expect(db.acceptFriendRequest(friend, alice)).toBe(true);
      }
    });

    /** Same steps the website and phone run when Invite is tapped. */
    async function inviteFromFriendsList(
      socket: Socket,
      friendId: number,
      room: { code: string | null; started: boolean; players: number },
    ) {
      const plan = planFriendLobbyInvite({
        inRoom: room.code !== null,
        gameStarted: room.started,
        playerCount: room.players,
      });
      let createdCode: string | null = null;
      const result = await runFriendLobbyInvite(plan, {
        createRoom: async () => {
          const res = await emitAck<{ roomCode?: string; error?: string }>(socket, 'room:create', 'Alice', 0, 'medium');
          if (res.error || !res.roomCode) return { ok: false, error: res.error };
          createdCode = res.roomCode;
          return { ok: true };
        },
        sendInvite: async () => {
          const res = await emitAck<{ success?: true; error?: string }>(socket, 'friend:invite:send', friendId);
          return res.success ? { ok: true } : { ok: false, error: res.error };
        },
      });
      return { ...result, createdCode };
    }

    it('opens a new waiting room, invites the friend, and the friend joins it', async () => {
      const a = await connect({ userId: alice, displayName: 'Alice' });
      const b = await connect({ userId: bob, displayName: 'Bob' });
      const received = waitFor<{ inviterName: string; roomCode: string }>(b, 'friend:invite:received');

      const result = await inviteFromFriendsList(a, bob, { code: null, started: false, players: 0 });
      expect(result).toMatchObject({ success: true, createdRoom: true });
      const invite = await received;
      expect(invite).toMatchObject({ inviterName: 'Alice', roomCode: result.createdCode });

      const twoSeated = waitFor<RoomState>(a, 'room:state', (s) => s.players.length === 2);
      const accepted = await emitAck<{ success?: true; roomCode?: string }>(b, 'friend:invite:accept');
      expect(accepted).toMatchObject({ success: true, roomCode: result.createdCode });
      const room = await twoSeated;
      expect(rooms.getRoom(result.createdCode!)?.targetScore).toBe(0);
      expect(room.players.map((p) => p.nickname).sort()).toEqual(['Alice', 'Bob']);
    });

    it('invites into the waiting room you are already in instead of opening another', async () => {
      const a = await connect({ userId: alice, displayName: 'Alice' });
      const c = await connect({ userId: carol, displayName: 'Carol' });
      const created = await emitAck<{ roomCode: string }>(a, 'room:create', 'Alice', 500, 'medium');
      const received = waitFor<{ roomCode: string }>(c, 'friend:invite:received');

      const result = await inviteFromFriendsList(a, carol, { code: created.roomCode, started: false, players: 1 });
      expect(result).toMatchObject({ success: true, createdRoom: false, createdCode: null });
      expect((await received).roomCode).toBe(created.roomCode);
    });

    it('does not invite a friend who is already sitting in the room', async () => {
      const a = await connect({ userId: alice, displayName: 'Alice' });
      const b = await connect({ userId: bob, displayName: 'Bob' });
      const created = await emitAck<{ roomCode: string }>(a, 'room:create', 'Alice', 500, 'medium');
      const received = waitFor(b, 'friend:invite:received');
      expect(await emitAck(a, 'friend:invite:send', bob)).toEqual({ success: true });
      await received;
      expect(await emitAck(b, 'friend:invite:accept')).toMatchObject({ success: true, roomCode: created.roomCode });

      expect(await emitAck(a, 'friend:invite:send', bob)).toEqual({ error: 'Already in your room' });
    });

    it('refuses to invite once the game has started', async () => {
      const a = await connect({ userId: alice, displayName: 'Alice' });
      const b = await connect({ userId: bob, displayName: 'Bob' });
      const created = await emitAck<{ roomCode: string }>(a, 'room:create', 'Alice', 0, 'easy');
      expect(await emitAck(b, 'room:join', created.roomCode, 'Bob')).toMatchObject({ success: true });
      const started = waitFor<ClientGameState>(a, 'game:state');
      a.emit('room:start');
      await started;
      // The client blocks it up front, and the server refuses it too.
      expect(planFriendLobbyInvite({ inRoom: true, gameStarted: true, playerCount: 1 })).toEqual({
        kind: 'blocked',
        error: 'Game already started',
      });
      const carolSocket = await connect({ userId: carol, displayName: 'Carol' });
      expect(await emitAck(a, 'friend:invite:send', carol)).toEqual({ error: 'Game already started' });
      carolSocket.disconnect();
    });

    it('reports a friend who went offline after the room was opened', async () => {
      const a = await connect({ userId: alice, displayName: 'Alice' });
      const result = await inviteFromFriendsList(a, carol, { code: null, started: false, players: 0 });
      expect(result).toMatchObject({ success: false, createdRoom: true, error: 'Friend is offline' });
    });
  });
});
