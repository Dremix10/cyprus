import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RoomManager } from '../RoomManager.js';
import { GamePhase } from '@cyprus/shared';

describe('RoomManager', () => {
  let rm: RoomManager;

  beforeEach(() => {
    rm = new RoomManager();
  });

  afterEach(() => {
    rm.destroy();
  });

  // ─── createRoom ──────────────────────────────────────────────────────

  describe('createRoom', () => {
    it('returns roomCode and sessionId', () => {
      const result = rm.createRoom('socket1', 'Alice');
      expect(result).toHaveProperty('roomCode');
      expect(result).toHaveProperty('sessionId');
      const { roomCode, sessionId } = result as { roomCode: string; sessionId: string };
      expect(roomCode).toMatch(/^[A-Z]{4}$/);
      expect(sessionId).toBeTruthy();
    });

    it('creates a room retrievable by code', () => {
      const result = rm.createRoom('socket1', 'Alice') as { roomCode: string };
      const room = rm.getRoom(result.roomCode);
      expect(room).toBeDefined();
      expect(room!.players.size).toBe(1);
      expect(room!.players.get(0)!.nickname).toBe('Alice');
    });

    it('rejects empty nickname', () => {
      const result = rm.createRoom('socket1', '');
      expect(result).toHaveProperty('error');
    });

    it('rejects nickname longer than 20 characters', () => {
      const result = rm.createRoom('socket1', 'A'.repeat(21));
      expect(result).toHaveProperty('error');
    });

    it('rejects nickname with invalid characters', () => {
      const result = rm.createRoom('socket1', 'Alice<script>');
      expect(result).toHaveProperty('error');
    });

    it('caps target score below 250 to 250', () => {
      const result = rm.createRoom('socket1', 'Alice', 100) as { roomCode: string };
      const room = rm.getRoom(result.roomCode);
      expect(room!.targetScore).toBe(250);
    });

    it('caps target score above 10000 to 10000', () => {
      const result = rm.createRoom('socket1', 'Alice', 99999) as { roomCode: string };
      const room = rm.getRoom(result.roomCode);
      expect(room!.targetScore).toBe(10000);
    });

    it('uses default target score of 1000', () => {
      const result = rm.createRoom('socket1', 'Alice') as { roomCode: string };
      const room = rm.getRoom(result.roomCode);
      expect(room!.targetScore).toBe(1000);
    });

    it('accepts a custom valid target score', () => {
      const result = rm.createRoom('socket1', 'Alice', 500) as { roomCode: string };
      const room = rm.getRoom(result.roomCode);
      expect(room!.targetScore).toBe(500);
    });

    it('stores userId when provided', () => {
      const result = rm.createRoom('socket1', 'Alice', 1000, 42) as { roomCode: string };
      const room = rm.getRoom(result.roomCode);
      expect(room!.players.get(0)!.userId).toBe(42);
    });

    it('generates unique room codes', () => {
      const codes = new Set<string>();
      for (let i = 0; i < 20; i++) {
        const result = rm.createRoom(`sock-${i}`, `P${i}`) as { roomCode: string };
        codes.add(result.roomCode);
      }
      expect(codes.size).toBe(20);
    });
  });

  // ─── createSoloRoom ──────────────────────────────────────────────────

  describe('createSoloRoom', () => {
    it('creates a room with 3 bots at positions 1, 2, 3', () => {
      const result = rm.createSoloRoom('socket1', 'Alice') as { roomCode: string; sessionId: string };
      expect(result).toHaveProperty('roomCode');
      expect(result).toHaveProperty('sessionId');
      const room = rm.getRoom(result.roomCode);
      expect(room!.players.size).toBe(4);
      expect(room!.botPositions.size).toBe(3);
      expect(room!.botPositions.has(1)).toBe(true);
      expect(room!.botPositions.has(2)).toBe(true);
      expect(room!.botPositions.has(3)).toBe(true);
      expect(room!.botPositions.has(0)).toBe(false);
    });

    it('assigns human player to position 0', () => {
      const result = rm.createSoloRoom('socket1', 'Alice') as { roomCode: string };
      const room = rm.getRoom(result.roomCode);
      const human = room!.players.get(0)!;
      expect(human.nickname).toBe('Alice');
      expect(human.connected).toBe(true);
    });

    it('bots have Greek-themed names', () => {
      const result = rm.createSoloRoom('socket1', 'Alice') as { roomCode: string };
      const room = rm.getRoom(result.roomCode);
      const botNames = [1, 2, 3].map(p => room!.players.get(p as 0|1|2|3)!.nickname);
      for (const name of botNames) {
        expect(name).toMatch(/^Bot (Zeus|Athena|Apollo)$/);
      }
    });

    it('rejects invalid nickname', () => {
      const result = rm.createSoloRoom('socket1', '');
      expect(result).toHaveProperty('error');
    });

    it('caps target score', () => {
      const result = rm.createSoloRoom('socket1', 'Alice', 50) as { roomCode: string };
      const room = rm.getRoom(result.roomCode);
      expect(room!.targetScore).toBe(250);
    });

    it('stores bot difficulty', () => {
      const result = rm.createSoloRoom('socket1', 'Alice', 1000, 'hard') as { roomCode: string };
      const room = rm.getRoom(result.roomCode);
      expect(room!.botDifficulty).toBe('hard');
    });
  });

  // ─── joinRoom ────────────────────────────────────────────────────────

  describe('joinRoom', () => {
    it('joins an existing room', () => {
      const created = rm.createRoom('socket1', 'Alice') as { roomCode: string };
      const joined = rm.joinRoom('socket2', created.roomCode, 'Bob');
      expect(joined).toHaveProperty('success', true);
      expect(joined).toHaveProperty('sessionId');
      const room = rm.getRoom(created.roomCode);
      expect(room!.players.size).toBe(2);
    });

    it('assigns the next open position', () => {
      const created = rm.createRoom('socket1', 'Alice') as { roomCode: string };
      const joined = rm.joinRoom('socket2', created.roomCode, 'Bob') as { success: true; position: number };
      // Alice is at 0, Bob should be at 1
      expect(joined.position).toBe(1);
    });

    it('rejects joining a nonexistent room', () => {
      const result = rm.joinRoom('socket2', 'ZZZZ', 'Bob');
      expect(result).toHaveProperty('error', 'Room not found');
    });

    it('rejects duplicate nickname in the same room', () => {
      const created = rm.createRoom('socket1', 'Alice') as { roomCode: string };
      const result = rm.joinRoom('socket2', created.roomCode, 'Alice');
      expect(result).toHaveProperty('error', 'Nickname already taken');
    });

    it('rejects joining a full room', () => {
      const created = rm.createRoom('socket1', 'Alice') as { roomCode: string };
      rm.joinRoom('socket2', created.roomCode, 'Bob');
      rm.joinRoom('socket3', created.roomCode, 'Carol');
      rm.joinRoom('socket4', created.roomCode, 'Dave');
      const result = rm.joinRoom('socket5', created.roomCode, 'Eve');
      expect(result).toHaveProperty('error', 'Room is full');
    });

    it('is case-insensitive for room codes', () => {
      const created = rm.createRoom('socket1', 'Alice') as { roomCode: string };
      const joined = rm.joinRoom('socket2', created.roomCode.toLowerCase(), 'Bob');
      expect(joined).toHaveProperty('success', true);
    });

    it('reconnects a disconnected player by nickname', () => {
      const created = rm.createRoom('socket1', 'Alice') as { roomCode: string };
      rm.joinRoom('socket2', created.roomCode, 'Bob');
      // Start game so disconnect doesn't remove the player
      rm.joinRoom('socket3', created.roomCode, 'Carol');
      rm.joinRoom('socket4', created.roomCode, 'Dave');
      rm.startGame('socket1');

      // Disconnect Bob
      rm.handleDisconnect('socket2');

      // Rejoin with same nickname
      const rejoined = rm.joinRoom('socket5', created.roomCode, 'Bob');
      expect(rejoined).toHaveProperty('success', true);
    });

    it('rejects invalid nickname on join', () => {
      const created = rm.createRoom('socket1', 'Alice') as { roomCode: string };
      const result = rm.joinRoom('socket2', created.roomCode, '!!!');
      expect(result).toHaveProperty('error');
    });
  });

  // ─── handleDisconnect ────────────────────────────────────────────────

  describe('handleDisconnect', () => {
    it('marks player as disconnected', () => {
      const created = rm.createRoom('socket1', 'Alice') as { roomCode: string };
      rm.joinRoom('socket2', created.roomCode, 'Bob');
      rm.joinRoom('socket3', created.roomCode, 'Carol');
      rm.joinRoom('socket4', created.roomCode, 'Dave');
      rm.startGame('socket1');

      const result = rm.handleDisconnect('socket2');
      expect(result).not.toBeNull();
      expect(result!.nickname).toBe('Bob');

      const room = rm.getRoom(created.roomCode);
      const bob = room!.players.get(1);
      expect(bob!.connected).toBe(false);
      expect(bob!.disconnectedAt).toBeDefined();
    });

    it('removes player and cleans session for waiting rooms (no game)', () => {
      const created = rm.createRoom('socket1', 'Alice') as { roomCode: string };
      rm.joinRoom('socket2', created.roomCode, 'Bob');

      rm.handleDisconnect('socket2');

      const room = rm.getRoom(created.roomCode);
      // Bob should be removed since no game is in progress
      expect(room!.players.size).toBe(1);
      expect(room!.players.has(1)).toBe(false);
    });

    it('returns null for unknown socket', () => {
      const result = rm.handleDisconnect('unknown-socket');
      expect(result).toBeNull();
    });

    it('returns roomCode and nickname', () => {
      const created = rm.createRoom('socket1', 'Alice') as { roomCode: string };
      const result = rm.handleDisconnect('socket1');
      expect(result).toEqual({ roomCode: created.roomCode, nickname: 'Alice' });
    });
  });

  // ─── reconnectBySession ──────────────────────────────────────────────

  describe('reconnectBySession', () => {
    it('restores a disconnected player', () => {
      const created = rm.createRoom('socket1', 'Alice') as { roomCode: string; sessionId: string };
      rm.joinRoom('socket2', created.roomCode, 'Bob');
      rm.joinRoom('socket3', created.roomCode, 'Carol');
      rm.joinRoom('socket4', created.roomCode, 'Dave');
      rm.startGame('socket1');

      rm.handleDisconnect('socket1');

      const result = rm.reconnectBySession('socket-new', created.sessionId);
      expect(result).toHaveProperty('success', true);
      const success = result as { success: true; roomCode: string; position: number; nickname: string };
      expect(success.roomCode).toBe(created.roomCode);
      expect(success.position).toBe(0);
      expect(success.nickname).toBe('Alice');

      // Player should be connected again
      const room = rm.getRoom(created.roomCode);
      const alice = room!.players.get(0);
      expect(alice!.connected).toBe(true);
      expect(alice!.socketId).toBe('socket-new');
    });

    it('rejects invalid session', () => {
      const result = rm.reconnectBySession('socket-new', 'invalid-session-id');
      expect(result).toHaveProperty('error', 'Session expired');
    });

    it('rejects mismatched userId', () => {
      const created = rm.createRoom('socket1', 'Alice', 1000, 42) as { roomCode: string; sessionId: string };
      rm.joinRoom('socket2', created.roomCode, 'Bob');
      rm.joinRoom('socket3', created.roomCode, 'Carol');
      rm.joinRoom('socket4', created.roomCode, 'Dave');
      rm.startGame('socket1');

      rm.handleDisconnect('socket1');

      // Try reconnecting with a different userId
      const result = rm.reconnectBySession('socket-new', created.sessionId, 99);
      expect(result).toHaveProperty('error', 'Session invalid');
    });

    it('succeeds when userId matches', () => {
      const created = rm.createRoom('socket1', 'Alice', 1000, 42) as { roomCode: string; sessionId: string };
      rm.joinRoom('socket2', created.roomCode, 'Bob');
      rm.joinRoom('socket3', created.roomCode, 'Carol');
      rm.joinRoom('socket4', created.roomCode, 'Dave');
      rm.startGame('socket1');

      rm.handleDisconnect('socket1');

      const result = rm.reconnectBySession('socket-new', created.sessionId, 42);
      expect(result).toHaveProperty('success', true);
    });

    it('cleans up old socket mapping on reconnect', () => {
      const created = rm.createRoom('socket1', 'Alice') as { roomCode: string; sessionId: string };
      rm.joinRoom('socket2', created.roomCode, 'Bob');
      rm.joinRoom('socket3', created.roomCode, 'Carol');
      rm.joinRoom('socket4', created.roomCode, 'Dave');
      rm.startGame('socket1');

      rm.handleDisconnect('socket1');
      rm.reconnectBySession('socket-new', created.sessionId);

      // Old socket should not map to anything
      const oldMapping = rm.getRoomForSocket('socket1');
      expect(oldMapping).toBeNull();

      // New socket should map correctly
      const newMapping = rm.getRoomForSocket('socket-new');
      expect(newMapping).not.toBeNull();
      expect(newMapping!.position).toBe(0);
    });
  });

  // ─── replacePlayerWithBot ────────────────────────────────────────────

  describe('replacePlayerWithBot', () => {
    it('replaces a disconnected player with a bot', () => {
      const created = rm.createRoom('socket1', 'Alice') as { roomCode: string; sessionId: string };
      rm.joinRoom('socket2', created.roomCode, 'Bob');
      rm.joinRoom('socket3', created.roomCode, 'Carol');
      rm.joinRoom('socket4', created.roomCode, 'Dave');
      rm.startGame('socket1');

      rm.handleDisconnect('socket2');

      const replaced = rm.replacePlayerWithBot(created.roomCode, 1);
      expect(replaced).toBe(true);

      const room = rm.getRoom(created.roomCode);
      expect(room!.botPositions.has(1)).toBe(true);
      const bot = room!.players.get(1)!;
      expect(bot.nickname).toMatch(/^Bot /);
      expect(bot.connected).toBe(true);
    });

    it('preserves session for reclaim after replacement', () => {
      const created = rm.createRoom('socket1', 'Alice') as { roomCode: string; sessionId: string };
      const bobJoined = rm.joinRoom('socket2', created.roomCode, 'Bob') as { success: true; sessionId: string };
      rm.joinRoom('socket3', created.roomCode, 'Carol');
      rm.joinRoom('socket4', created.roomCode, 'Dave');
      rm.startGame('socket1');

      rm.handleDisconnect('socket2');
      rm.replacePlayerWithBot(created.roomCode, 1);

      const room = rm.getRoom(created.roomCode);
      const botAtPos1 = room!.players.get(1)!;
      expect(botAtPos1.replacedPlayer).toBeDefined();
      expect(botAtPos1.replacedPlayer!.nickname).toBe('Bob');
      expect(botAtPos1.replacedPlayer!.sessionId).toBe(bobJoined.sessionId);
    });

    it('returns false if no game engine exists', () => {
      const created = rm.createRoom('socket1', 'Alice') as { roomCode: string };
      expect(rm.replacePlayerWithBot(created.roomCode, 0)).toBe(false);
    });

    it('returns false for a connected player', () => {
      const created = rm.createRoom('socket1', 'Alice') as { roomCode: string };
      rm.joinRoom('socket2', created.roomCode, 'Bob');
      rm.joinRoom('socket3', created.roomCode, 'Carol');
      rm.joinRoom('socket4', created.roomCode, 'Dave');
      rm.startGame('socket1');

      // Alice is still connected
      expect(rm.replacePlayerWithBot(created.roomCode, 0)).toBe(false);
    });

    it('returns false for a position already occupied by a bot', () => {
      const created = rm.createSoloRoom('socket1', 'Alice') as { roomCode: string };
      rm.startGame('socket1');

      // Position 1 is already a bot
      expect(rm.replacePlayerWithBot(created.roomCode, 1)).toBe(false);
    });

    it('updates engine nickname when replacing a player', () => {
      const created = rm.createRoom('socket1', 'Alice') as { roomCode: string };
      rm.joinRoom('socket2', created.roomCode, 'Bob');
      rm.joinRoom('socket3', created.roomCode, 'Carol');
      rm.joinRoom('socket4', created.roomCode, 'Dave');
      rm.startGame('socket1');

      rm.handleDisconnect('socket2');
      rm.replacePlayerWithBot(created.roomCode, 1);

      const room = rm.getRoom(created.roomCode);
      expect(room!.engine!.state.players[1].nickname).toMatch(/^Bot /);
    });

    it('session reconnect after bot replacement returns error (bot does not carry original sessionId)', () => {
      const created = rm.createRoom('socket1', 'Alice') as { roomCode: string; sessionId: string };
      const bobJoined = rm.joinRoom('socket2', created.roomCode, 'Bob') as { success: true; sessionId: string };
      rm.joinRoom('socket3', created.roomCode, 'Carol');
      rm.joinRoom('socket4', created.roomCode, 'Dave');
      rm.startGame('socket1');

      rm.handleDisconnect('socket2');
      rm.replacePlayerWithBot(created.roomCode, 1);

      // Bot replacement clears the sessionId on the player object at that position.
      // reconnectBySession checks player.sessionId !== sessionId first, which fails
      // because the bot player doesn't carry the original session. The replacedPlayer
      // info preserves the session for potential future reclaim, but the current
      // reconnect flow cannot reach it.
      const reclaimed = rm.reconnectBySession('socket-bob-new', bobJoined.sessionId);
      expect(reclaimed).toHaveProperty('error', 'Session invalid');
    });
  });

  // ─── getActiveGames ──────────────────────────────────────────────────

  describe('getActiveGames', () => {
    it('returns only rooms with active engines', () => {
      // Room without game
      rm.createRoom('socket1', 'Alice');

      // Room with game
      const created = rm.createSoloRoom('socket5', 'Bob') as { roomCode: string };
      rm.startGame('socket5');

      const activeGames = rm.getActiveGames();
      expect(activeGames.length).toBe(1);
      expect(activeGames[0].roomCode).toBe(created.roomCode);
    });

    it('returns empty when no games are running', () => {
      rm.createRoom('socket1', 'Alice');
      const activeGames = rm.getActiveGames();
      expect(activeGames.length).toBe(0);
    });

    it('includes correct player info and scores', () => {
      const created = rm.createSoloRoom('socket1', 'Alice') as { roomCode: string };
      rm.startGame('socket1');

      const games = rm.getActiveGames();
      expect(games.length).toBe(1);
      expect(games[0].players.length).toBe(4);
      expect(games[0].scores).toEqual([0, 0]);
      expect(games[0].targetScore).toBe(1000);
    });

    it('filters out GAME_OVER rooms', () => {
      const created = rm.createSoloRoom('socket1', 'Alice') as { roomCode: string };
      rm.startGame('socket1');

      // Force game over phase
      const room = rm.getRoom(created.roomCode)!;
      room.engine!.state.phase = GamePhase.GAME_OVER;

      const games = rm.getActiveGames();
      expect(games.length).toBe(0);
    });

    it('filters out WAITING rooms', () => {
      const created = rm.createSoloRoom('socket1', 'Alice') as { roomCode: string };
      rm.startGame('socket1');

      const room = rm.getRoom(created.roomCode)!;
      room.engine!.state.phase = GamePhase.WAITING;

      const games = rm.getActiveGames();
      expect(games.length).toBe(0);
    });
  });

  // ─── checkNicknameWarning ────────────────────────────────────────────

  describe('checkNicknameWarning', () => {
    it('returns null for clean names', () => {
      expect(rm.checkNicknameWarning('Alice')).toBeNull();
      expect(rm.checkNicknameWarning('Player123')).toBeNull();
      expect(rm.checkNicknameWarning('John Doe')).toBeNull();
    });

    it('returns warning for offensive names', () => {
      const warning = rm.checkNicknameWarning('SomeOffensiveNiggerName');
      expect(warning).not.toBeNull();
      expect(warning).toContain('offensive');
    });

    it('is case-insensitive', () => {
      // Uses one of the patterns in the list, capitalized
      expect(rm.checkNicknameWarning('RETARD')).not.toBeNull();
    });

    it('detects patterns embedded in other text', () => {
      expect(rm.checkNicknameWarning('xretardx')).not.toBeNull();
    });
  });

  // ─── startGame ───────────────────────────────────────────────────────

  describe('startGame', () => {
    it('starts a game with 4 players', () => {
      const created = rm.createRoom('socket1', 'Alice') as { roomCode: string };
      rm.joinRoom('socket2', created.roomCode, 'Bob');
      rm.joinRoom('socket3', created.roomCode, 'Carol');
      rm.joinRoom('socket4', created.roomCode, 'Dave');

      const result = rm.startGame('socket1');
      expect(result.error).toBeUndefined();

      const room = rm.getRoom(created.roomCode);
      expect(room!.engine).not.toBeNull();
    });

    it('fills empty seats with bots when only 2 players', () => {
      const created = rm.createRoom('socket1', 'Alice') as { roomCode: string };
      rm.joinRoom('socket2', created.roomCode, 'Bob');

      rm.startGame('socket1');

      const room = rm.getRoom(created.roomCode);
      expect(room!.players.size).toBe(4);
      expect(room!.botPositions.size).toBe(2);
    });

    it('rejects when not enough players', () => {
      rm.createRoom('socket1', 'Alice');
      const result = rm.startGame('socket1');
      expect(result.error).toBe('Need at least 2 players');
    });

    it('rejects when game already started', () => {
      const created = rm.createSoloRoom('socket1', 'Alice') as { roomCode: string };
      rm.startGame('socket1');
      const result = rm.startGame('socket1');
      expect(result.error).toBe('Game already started');
    });

    it('rejects for unknown socket', () => {
      const result = rm.startGame('unknown-socket');
      expect(result.error).toBe('Not in a room');
    });
  });

  // ─── getRoomState ────────────────────────────────────────────────────

  describe('getRoomState', () => {
    it('returns correct room state', () => {
      const created = rm.createRoom('socket1', 'Alice') as { roomCode: string };
      rm.joinRoom('socket2', created.roomCode, 'Bob');

      const state = rm.getRoomState(created.roomCode);
      expect(state).not.toBeNull();
      expect(state!.roomCode).toBe(created.roomCode);
      expect(state!.players.length).toBe(2);
      expect(state!.isStartable).toBe(true);
    });

    it('returns null for nonexistent room', () => {
      expect(rm.getRoomState('ZZZZ')).toBeNull();
    });

    it('isStartable is false with only 1 player', () => {
      const created = rm.createRoom('socket1', 'Alice') as { roomCode: string };
      const state = rm.getRoomState(created.roomCode);
      expect(state!.isStartable).toBe(false);
    });

    it('isStartable is false when game is running', () => {
      const created = rm.createSoloRoom('socket1', 'Alice') as { roomCode: string };
      rm.startGame('socket1');
      const state = rm.getRoomState(created.roomCode);
      expect(state!.isStartable).toBe(false);
    });
  });

  // ─── sitAt ───────────────────────────────────────────────────────────

  describe('sitAt', () => {
    it('allows moving to an open seat', () => {
      const created = rm.createRoom('socket1', 'Alice') as { roomCode: string };
      const moved = rm.sitAt('socket1', 2);
      expect(moved).toBe(true);

      const room = rm.getRoom(created.roomCode);
      expect(room!.players.has(0)).toBe(false);
      expect(room!.players.has(2)).toBe(true);
      expect(room!.players.get(2)!.nickname).toBe('Alice');
    });

    it('rejects moving to an occupied seat', () => {
      const created = rm.createRoom('socket1', 'Alice') as { roomCode: string };
      rm.joinRoom('socket2', created.roomCode, 'Bob');
      const moved = rm.sitAt('socket1', 1);
      expect(moved).toBe(false);
    });

    it('rejects moving during a game', () => {
      const created = rm.createSoloRoom('socket1', 'Alice') as { roomCode: string };
      rm.startGame('socket1');
      const moved = rm.sitAt('socket1', 2);
      expect(moved).toBe(false);
    });
  });

  // ─── serializeRooms / restoreRooms ───────────────────────────────────

  describe('serializeRooms / restoreRooms', () => {
    it('serializes and restores active game rooms', () => {
      const created = rm.createSoloRoom('socket1', 'Alice') as { roomCode: string; sessionId: string };
      rm.startGame('socket1');

      const data = rm.serializeRooms();
      expect(data.length).toBe(1);
      expect(data[0].code).toBe(created.roomCode);

      // Restore into a new manager
      const rm2 = new RoomManager();
      try {
        const restored = rm2.restoreRooms(data);
        expect(restored).toBe(1);

        const room = rm2.getRoom(created.roomCode);
        expect(room).toBeDefined();
        expect(room!.engine).not.toBeNull();
        expect(room!.players.size).toBe(4);
      } finally {
        rm2.destroy();
      }
    });

    it('does not serialize waiting rooms without engine', () => {
      rm.createRoom('socket1', 'Alice');
      const data = rm.serializeRooms();
      expect(data.length).toBe(0);
    });
  });
});
