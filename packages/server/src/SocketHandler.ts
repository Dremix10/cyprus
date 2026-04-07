import type { Server, Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  PlayerPosition,
  NormalRank,
  GameEvent,
  TichuCall,
  Card,
} from '@cyprus/shared';
import { GamePhase, SpecialCardType, isSpecial } from '@cyprus/shared';
import { RoomManager } from './RoomManager.js';
import type { Room } from './RoomManager.js';
import type { GameEngine } from './GameEngine.js';
import { BotAI } from './BotAI.js';
import type { BotDifficulty, GameContext } from './BotAI.js';
import { writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');

type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;
type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

const TURN_TIMEOUT_MS = 60_000;

export class SocketHandler {
  private turnTimers = new Map<string, NodeJS.Timeout>(); // roomCode -> timer
  private turnDeadlines = new Map<string, number>(); // roomCode -> deadline timestamp

  constructor(
    private io: TypedServer,
    private rooms: RoomManager
  ) {}

  setup(): void {
    this.io.on('connection', (socket) => {
      console.log(`Client connected: ${socket.id}`);

      socket.on('room:create', (nickname, targetScore, callback) => {
        const result = this.rooms.createRoom(socket.id, nickname, targetScore);
        if ('error' in result) {
          callback({ error: result.error });
          return;
        }
        socket.join(result.roomCode);
        callback({ roomCode: result.roomCode });
        this.broadcastRoomState(result.roomCode);
      });

      socket.on('room:create_solo', (nickname, targetScore, difficulty, callback) => {
        const validDifficulties: BotDifficulty[] = ['easy', 'medium', 'hard'];
        const diff: BotDifficulty = validDifficulties.includes(difficulty as BotDifficulty)
          ? (difficulty as BotDifficulty)
          : 'medium';

        const result = this.rooms.createSoloRoom(socket.id, nickname, targetScore, diff);
        if ('error' in result) {
          callback({ error: result.error });
          return;
        }
        socket.join(result.roomCode);
        callback({ roomCode: result.roomCode });

        // Start the game immediately
        const startResult = this.rooms.startGame(socket.id);
        if (startResult.error) {
          socket.emit('game:error', startResult.error);
          return;
        }

        this.broadcastGameState(result.roomCode);
      });

      socket.on('room:join', (roomCode, nickname, callback) => {
        const result = this.rooms.joinRoom(socket.id, roomCode, nickname);
        if ('error' in result) {
          callback({ error: result.error });
          return;
        }
        socket.join(roomCode.toUpperCase());
        callback({ success: true });

        // If game is in progress (reconnect), send game state
        const info = this.rooms.getRoomForSocket(socket.id);
        if (info && info.room.engine) {
          const state = info.room.engine.getClientState(
            info.position,
            info.room.code,
            info.room.botPositions
          );
          socket.emit('game:state', state);
          // Notify others of reconnection
          socket.to(info.room.code).emit('room:player_reconnected', nickname);
        } else {
          this.broadcastRoomState(roomCode.toUpperCase());
        }
      });

      socket.on('room:sit', (position) => {
        const success = this.rooms.sitAt(socket.id, position);
        if (success) {
          const info = this.rooms.getRoomForSocket(socket.id);
          if (info) this.broadcastRoomState(info.room.code);
        }
      });

      socket.on('room:start', () => {
        const result = this.rooms.startGame(socket.id);
        if (result.error) {
          socket.emit('game:error', result.error);
          return;
        }
        const info = this.rooms.getRoomForSocket(socket.id);
        if (info) this.broadcastGameState(info.room.code);
      });

      socket.on('game:grand_tichu_decision', (call) => {
        this.handleGameAction(socket, (engine, position) =>
          engine.grandTichuDecision(position, call)
        );
      });

      socket.on('game:pass_cards', (cards) => {
        this.handleGameAction(socket, (engine, position) =>
          engine.passCards(position, cards)
        );
      });

      socket.on('game:play', (cardIds) => {
        this.handleGameAction(socket, (engine, position) =>
          engine.playCards(position, cardIds)
        );
      });

      socket.on('game:pass_turn', () => {
        this.handleGameAction(socket, (engine, position) =>
          engine.passTurn(position)
        );
      });

      socket.on('game:call_tichu', () => {
        this.handleGameAction(socket, (engine, position) =>
          engine.callTichu(position)
        );
      });

      socket.on('game:dragon_give', (opponentPosition) => {
        this.handleGameAction(socket, (engine, position) =>
          engine.dragonGive(position, opponentPosition)
        );
      });

      socket.on('game:wish', (rank) => {
        this.handleGameAction(socket, (engine, position) =>
          engine.setWish(position, rank)
        );
      });

      socket.on('game:next_round', () => {
        this.handleGameAction(socket, (engine) => engine.nextRound());
      });

      socket.on('disconnect', () => {
        const result = this.rooms.handleDisconnect(socket.id);
        if (result) {
          this.io
            .to(result.roomCode)
            .emit('room:player_disconnected', result.nickname);
          this.broadcastRoomState(result.roomCode);
        }
      });
    });
  }

  private handleGameAction(
    socket: TypedSocket,
    action: (
      engine: GameEngine,
      position: PlayerPosition
    ) => GameEvent[]
  ): void {
    const info = this.rooms.getRoomForSocket(socket.id);
    if (!info || !info.room.engine) {
      socket.emit('game:error', 'No active game');
      return;
    }

    try {
      const events = action(info.room.engine, info.position);

      // Broadcast events to the room
      for (const event of events) {
        this.io.to(info.room.code).emit('game:event', event);
      }

      // Broadcast updated game state to each player
      this.broadcastGameState(info.room.code);
    } catch (err) {
      socket.emit('game:error', (err as Error).message);
    }
  }

  private broadcastRoomState(roomCode: string): void {
    const state = this.rooms.getRoomState(roomCode);
    if (state) {
      this.io.to(roomCode).emit('room:state', state);
    }
  }

  private broadcastGameState(roomCode: string): void {
    const room = this.rooms.getRoom(roomCode);
    if (!room || !room.engine) return;

    // Build avatar map from room players
    const avatars = new Map<PlayerPosition, string>();
    for (const [pos, player] of room.players) {
      if (player.avatar) avatars.set(pos, player.avatar);
    }

    // Schedule turn timer for human players
    this.scheduleTurnTimer(roomCode);

    const deadline = this.turnDeadlines.get(roomCode) ?? null;

    const sockets = this.rooms.getSocketIdsForRoom(roomCode);
    for (const [position, socketId] of sockets) {
      const state = room.engine.getClientState(position, roomCode, room.botPositions, avatars);
      state.turnDeadline = deadline;
      this.io.to(socketId).emit('game:state', state);
    }

    // Save latest game state for debugging
    this.saveGameState(roomCode, room);

    // If Dog is pending, schedule delayed resolution
    if (room.engine.state.dogPending) {
      this.scheduleDogResolve(roomCode);
      return; // Don't schedule bot actions while Dog is pending
    }

    // Schedule bot actions if this is a solo room
    this.scheduleBotAction(roomCode);
  }

  /** Persist the latest game state to disk for debugging. */
  private saveGameState(roomCode: string, room: Room): void {
    try {
      const engine = room.engine;
      if (!engine) return;

      const snapshot = {
        roomCode,
        timestamp: new Date().toISOString(),
        phase: engine.state.phase,
        currentPlayer: engine.state.currentPlayer,
        scores: engine.state.scores,
        roundScores: engine.state.roundScores,
        finishOrder: engine.state.finishOrder,
        currentTrick: engine.state.currentTrick,
        wish: engine.state.wish,
        dragonWinner: engine.state.dragonWinner,
        players: engine.state.players.map((p) => ({
          position: p.position,
          nickname: p.nickname,
          hand: p.hand.map((c) => c.id),
          cardCount: p.hand.length,
          tichuCall: p.tichuCall,
          isOut: p.isOut,
          finishOrder: p.finishOrder,
          hasPlayedCards: p.hasPlayedCards,
          wonTricksCount: p.wonTricks.length,
          collectedCards: p.wonTricks.reduce((sum, t) => sum + t.length, 0),
        })),
        isSolo: room.botPositions.size > 0,
        botDifficulty: room.botDifficulty,
      };

      // Save latest snapshot (overwrite)
      writeFileSync(
        join(DATA_DIR, `latest-game-${roomCode}.json`),
        JSON.stringify(snapshot, null, 2)
      );

      // Append to move log (one JSON line per state change)
      const logLine = {
        t: snapshot.timestamp,
        phase: snapshot.phase,
        currentPlayer: snapshot.currentPlayer,
        trick: snapshot.currentTrick.plays.map((p) => ({
          pos: p.playerPosition,
          cards: p.combination.cards.map((c) => c.id),
          type: p.combination.type,
        })),
        trickWinner: snapshot.currentTrick.currentWinner,
        finishOrder: snapshot.finishOrder,
        scores: snapshot.scores,
        roundScores: snapshot.roundScores,
        players: snapshot.players.map((p) => ({
          pos: p.position,
          name: p.nickname,
          cards: p.cardCount,
          hand: p.hand,
          tichu: p.tichuCall,
          out: p.isOut,
          finishPos: p.finishOrder,
        })),
      };

      appendFileSync(
        join(DATA_DIR, `game-log-${roomCode}.jsonl`),
        JSON.stringify(logLine) + '\n'
      );
    } catch {
      // Don't crash the game if saving fails
    }
  }

  // ─── Dog Delay ─────────────────────────────────────────────────────────

  private scheduleDogResolve(roomCode: string): void {
    setTimeout(() => {
      const room = this.rooms.getRoom(roomCode);
      if (!room || !room.engine || !room.engine.state.dogPending) return;

      try {
        const events = room.engine.resolveDog();
        for (const event of events) {
          this.io.to(roomCode).emit('game:event', event);
        }
        this.broadcastGameState(roomCode);
      } catch (err) {
        console.error(`Dog resolve error in room ${roomCode}:`, err);
      }
    }, 1500);
  }

  // ─── Turn Timer ────────────────────────────────────────────────────────

  private clearTurnTimer(roomCode: string): void {
    const existing = this.turnTimers.get(roomCode);
    if (existing) clearTimeout(existing);
    this.turnTimers.delete(roomCode);
    this.turnDeadlines.delete(roomCode);
  }

  private scheduleTurnTimer(roomCode: string): void {
    // Always clear previous timer first
    this.clearTurnTimer(roomCode);

    const room = this.rooms.getRoom(roomCode);
    if (!room || !room.engine) return;

    // No timer in solo games (3 bots)
    if (room.botPositions.size >= 3) return;

    const engine = room.engine;
    // Only run timer during PLAYING phase for human players
    if (engine.state.phase !== GamePhase.PLAYING) return;
    // Don't start timer while wish is pending
    if (engine.state.wishPending !== null) return;

    const currentPlayer = engine.state.currentPlayer;
    // Don't time bots
    if (room.botPositions.has(currentPlayer)) return;

    const deadline = Date.now() + TURN_TIMEOUT_MS;
    this.turnDeadlines.set(roomCode, deadline);

    const timer = setTimeout(() => {
      this.turnTimers.delete(roomCode);
      this.turnDeadlines.delete(roomCode);

      const currentRoom = this.rooms.getRoom(roomCode);
      if (!currentRoom || !currentRoom.engine) return;

      const eng = currentRoom.engine;
      // Verify it's still this player's turn in PLAYING phase
      if (eng.state.phase !== GamePhase.PLAYING) return;
      if (eng.state.currentPlayer !== currentPlayer) return;

      try {
        let events;
        const hasTrickOnTable = eng.state.currentTrick.plays.length > 0;
        if (hasTrickOnTable) {
          // Auto-pass
          events = eng.passTurn(currentPlayer);
        } else {
          // Must lead — play the lowest single card
          const player = eng.state.players[currentPlayer];
          const lowestCard = player.hand[0]; // hand is sorted, first is lowest
          events = eng.playCards(currentPlayer, [lowestCard.id]);
        }

        for (const event of events) {
          this.io.to(roomCode).emit('game:event', event);
        }
        this.broadcastGameState(roomCode);
      } catch (err) {
        console.error(`Turn timer auto-action error in room ${roomCode}:`, err);
      }
    }, TURN_TIMEOUT_MS);

    this.turnTimers.set(roomCode, timer);
  }

  // ─── Bot Turn Processing ──────────────────────────────────────────────

  private scheduleBotAction(roomCode: string): void {
    const room = this.rooms.getRoom(roomCode);
    if (!room || !room.engine || room.botPositions.size === 0) return;

    const engine = room.engine;
    const botAI = new BotAI(room.botDifficulty);

    const action = this.findBotAction(room, engine, botAI);
    if (!action) return;

    // Check if the human player is out (finished)
    const humanPositions = ([0, 1, 2, 3] as PlayerPosition[]).filter(
      (p) => !room.botPositions.has(p)
    );
    const humanIsOut = humanPositions.every((p) => engine.state.players[p].isOut);
    const delay = botAI.getDelay(humanIsOut);
    setTimeout(() => {
      // Re-check room still exists
      const currentRoom = this.rooms.getRoom(roomCode);
      if (!currentRoom || !currentRoom.engine) return;

      try {
        const events = action();
        for (const event of events) {
          this.io.to(roomCode).emit('game:event', event);
        }
        this.broadcastGameState(roomCode);
      } catch (err) {
        console.error(`Bot action error in room ${roomCode}:`, err);
      }
    }, delay);
  }

  /** Compute all cards that have been played this round (won tricks + current trick). */
  private getPlayedCards(engine: GameEngine): Card[] {
    const played: Card[] = [];
    for (const p of engine.state.players) {
      for (const trick of p.wonTricks) {
        played.push(...trick);
      }
    }
    for (const play of engine.state.currentTrick.plays) {
      played.push(...play.combination.cards);
    }
    return played;
  }

  /** Build the full game context for hard mode bot decisions. */
  private buildGameContext(engine: GameEngine): GameContext {
    return {
      playerCardCounts: new Map<PlayerPosition, number>(
        engine.state.players.map((p) => [p.position, p.hand.length])
      ),
      tichuCalls: {
        0: engine.state.players[0].tichuCall,
        1: engine.state.players[1].tichuCall,
        2: engine.state.players[2].tichuCall,
        3: engine.state.players[3].tichuCall,
      } as Record<PlayerPosition, TichuCall>,
      finishOrder: engine.state.finishOrder as PlayerPosition[],
      playedCards: this.getPlayedCards(engine),
      scores: [...engine.state.scores] as [number, number],
    };
  }

  private findBotAction(
    room: Room,
    engine: GameEngine,
    botAI: BotAI
  ): (() => GameEvent[]) | null {
    const phase = engine.state.phase;

    if (
      phase === GamePhase.ROUND_SCORING ||
      phase === GamePhase.GAME_OVER ||
      phase === GamePhase.WAITING
    ) {
      return null; // Human must act
    }

    if (phase === GamePhase.GRAND_TICHU) {
      for (const pos of room.botPositions) {
        if (!engine.state.players[pos].grandTichuDecided) {
          const call = botAI.decideGrandTichu(engine.state.players[pos].hand);
          return () => engine.grandTichuDecision(pos, call);
        }
      }
      return null;
    }

    if (phase === GamePhase.PASSING) {
      for (const pos of room.botPositions) {
        if (!engine.state.players[pos].passedCards) {
          const tichuCalls = {
            0: engine.state.players[0].tichuCall,
            1: engine.state.players[1].tichuCall,
            2: engine.state.players[2].tichuCall,
            3: engine.state.players[3].tichuCall,
          } as Record<PlayerPosition, TichuCall>;
          const cards = botAI.choosePassCards(engine.state.players[pos].hand, pos, tichuCalls);
          return () => engine.passCards(pos, cards);
        }
      }
      return null;
    }

    if (phase === GamePhase.PLAYING) {
      // First: check for pending Mahjong wish from a bot
      if (engine.state.wishPending !== null && room.botPositions.has(engine.state.wishPending)) {
        const wishPos = engine.state.wishPending;
        const hand = engine.state.players[wishPos].hand;
        const gameContext = this.buildGameContext(engine);
        const rank = botAI.chooseWish(hand, gameContext);
        return () => engine.setWish(wishPos, rank);
      }

      // Block bot play while wish is pending (human hasn't chosen yet)
      if (engine.state.wishPending !== null) return null;

      // Regular play
      const currentPlayer = engine.state.currentPlayer;
      if (!room.botPositions.has(currentPlayer)) return null;

      const player = engine.state.players[currentPlayer];

      // Bot Tichu calling: call before first play if hand is strong enough
      if (player.tichuCall === 'none' && !player.hasPlayedCards) {
        if (botAI.decideTichu(player.hand)) {
          return () => engine.callTichu(currentPlayer);
        }
      }

      const hand = player.hand;
      const gameContext = this.buildGameContext(engine);

      const cardIds = botAI.choosePlay(
        hand,
        engine.state.currentTrick,
        engine.state.wish,
        currentPlayer,
        gameContext
      );

      if (cardIds) {
        return () => engine.playCards(currentPlayer, cardIds);
      } else {
        return () => engine.passTurn(currentPlayer);
      }
    }

    if (phase === GamePhase.DRAGON_GIVE) {
      const winner = engine.state.dragonWinner;
      if (winner === null || !room.botPositions.has(winner)) return null;

      const opponents = ([0, 1, 2, 3] as PlayerPosition[]).filter(
        (p) => p % 2 !== winner % 2
      );
      const cardCounts = new Map<PlayerPosition, number>();
      for (const p of engine.state.players) {
        cardCounts.set(p.position, p.hand.length);
      }
      const gameContext = this.buildGameContext(engine);
      const target = botAI.chooseDragonGiveTarget(opponents, cardCounts, gameContext);
      return () => engine.dragonGive(winner, target);
    }

    return null;
  }
}
