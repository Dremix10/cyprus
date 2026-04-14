import type {
  PlayerPosition,
  GameEvent,
  TichuCall,
  Card,
} from '@cyprus/shared';
import { GamePhase, findPlayableFromHand } from '@cyprus/shared';
import type { Room, RoomManager } from './RoomManager.js';
import type { GameEngine } from './GameEngine.js';
import { BotAI } from './BotAI.js';
import type { BotDifficulty, GameContext } from './BotAI.js';
import { monteCarloEvaluate } from './MonteCarloSim.js';
import type { TrackerDB } from './Database.js';

type EmitFn = (roomCode: string, event: string, ...args: unknown[]) => void;
type BroadcastFn = (roomCode: string) => void;

export class BotController {
  constructor(
    private rooms: RoomManager,
    private emit: EmitFn,
    private broadcastGameState: BroadcastFn,
    private db: TrackerDB | undefined,
    private getGameId: (roomCode: string) => number | null,
  ) {}

  scheduleBotAction(roomCode: string): void {
    const room = this.rooms.getRoom(roomCode);
    if (!room || !room.engine || room.botPositions.size === 0) return;

    const botAI = new BotAI(room.botDifficulty, room.botDifficulty === 'hard' ? { useMonteCarlo: true } : {});

    // Pre-check: is there a bot action available right now?
    const preCheck = this.findBotAction(room, room.engine, botAI);
    if (!preCheck) return;

    const humanPositions = ([0, 1, 2, 3] as PlayerPosition[]).filter(
      (p) => !room.botPositions.has(p)
    );
    const humanIsOut = humanPositions.every((p) => room.engine!.state.players[p].isOut);
    const delay = botAI.getDelay(humanIsOut);

    setTimeout(() => {
      // Re-fetch room and re-compute action — phase may have changed during the delay
      const currentRoom = this.rooms.getRoom(roomCode);
      if (!currentRoom || !currentRoom.engine) return;

      const currentBotAI = new BotAI(currentRoom.botDifficulty, currentRoom.botDifficulty === 'hard' ? { useMonteCarlo: true } : {});
      const action = this.findBotAction(currentRoom, currentRoom.engine, currentBotAI);
      if (!action) return;

      try {
        const events = action();
        const gameId = this.getGameId(roomCode);
        for (const event of events) {
          this.db?.logGameEvent(gameId, roomCode, event.type, event.playerPosition ?? null, event.data);
          this.emit(roomCode, 'game:event', event);
        }
        this.broadcastGameState(roomCode);
      } catch (err) {
        console.error(`Bot action error in room ${roomCode}:`, err);
      }
    }, delay);
  }

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
      return null;
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
      if (engine.state.wishPending !== null && room.botPositions.has(engine.state.wishPending)) {
        const wishPos = engine.state.wishPending;
        const hand = engine.state.players[wishPos].hand;
        const gameContext = this.buildGameContext(engine);
        const rank = botAI.chooseWish(hand, gameContext);
        return () => engine.setWish(wishPos, rank);
      }

      if (engine.state.wishPending !== null) return null;

      const currentPlayer = engine.state.currentPlayer;
      if (!room.botPositions.has(currentPlayer)) return null;

      const player = engine.state.players[currentPlayer];

      if (player.tichuCall === 'none' && !player.hasPlayedCards) {
        if (botAI.decideTichu(player.hand)) {
          return () => engine.callTichu(currentPlayer);
        }
      }

      const hand = player.hand;
      const gameContext = this.buildGameContext(engine);

      // Build MC evaluator for hard mode bots
      const mcEval = botAI.config.useMonteCarlo
        ? (candidates: (Card[] | null)[]) => monteCarloEvaluate(engine, currentPlayer, candidates)
        : undefined;

      let cardIds = botAI.choosePlay(
        hand,
        engine.state.currentTrick,
        engine.state.wish,
        currentPlayer,
        gameContext,
        mcEval
      );

      if (!cardIds && engine.state.wish.active && engine.state.wish.wishedRank !== null) {
        const currentTop = engine.state.currentTrick.plays.length > 0
          ? engine.state.currentTrick.plays[engine.state.currentTrick.plays.length - 1].combination
          : null;
        const playable = findPlayableFromHand(hand, currentTop, engine.state.wish);
        const wishedPlay = playable.find((cards) =>
          cards.some((c) => c.type === 'normal' && c.rank === engine.state.wish.wishedRank)
        );
        if (wishedPlay) {
          cardIds = wishedPlay.map((c) => c.id);
        }
      }

      if (cardIds) {
        return () => engine.playCards(currentPlayer, cardIds!);
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
