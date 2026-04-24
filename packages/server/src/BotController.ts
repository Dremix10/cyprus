import type {
  PlayerPosition,
  GameEvent,
  TichuCall,
  Card,
} from '@cyprus/shared';
import { GamePhase, findPlayableFromHand, getCardPoints } from '@cyprus/shared';
import type { Room, RoomManager } from './RoomManager.js';
import type { GameEngine } from './GameEngine.js';
import { BotAI } from './BotAI.js';
import type { BotDifficulty, GameContext } from './BotAI.js';
import { monteCarloEvaluate } from './MonteCarloSim.js';
import type { TrackerDB } from './Database.js';
import type { GameMonitor } from './GameMonitor.js';

type EmitFn = (roomCode: string, event: string, ...args: unknown[]) => void;
type BroadcastFn = (roomCode: string) => void;

export class BotController {
  constructor(
    private rooms: RoomManager,
    private emit: EmitFn,
    private broadcastGameState: BroadcastFn,
    private db: TrackerDB | undefined,
    private getGameId: (roomCode: string) => number | null,
    private monitor?: GameMonitor,
  ) {}

  private getMcConfig(difficulty: BotDifficulty): Partial<import('./BotAI.js').BotConfig> {
    switch (difficulty) {
      case 'unfair': return { useMonteCarlo: true, mcSims: 600, mcTimeMs: 400 };
      case 'extreme': return { useMonteCarlo: true, mcSims: 400, mcTimeMs: 300 };
      case 'hard': return { useMonteCarlo: true };
      default: return {};
    }
  }

  scheduleBotAction(roomCode: string): void {
    const room = this.rooms.getRoom(roomCode);
    if (!room || !room.engine || room.botPositions.size === 0) return;

    const botAI = new BotAI(room.botDifficulty, this.getMcConfig(room.botDifficulty));

    // Pre-check: is there a bot action available right now?
    const preCheck = this.findBotAction(room, room.engine, botAI);
    if (!preCheck) return;

    const humanPositions = ([0, 1, 2, 3] as PlayerPosition[]).filter(
      (p) => !room.botPositions.has(p)
    );
    const humanIsOut = humanPositions.every((p) => room.engine!.state.players[p].isOut);
    const isSolo = room.botPositions.size === 3;
    const delay = (isSolo && humanIsOut) ? 50 : botAI.getDelay(humanIsOut);

    setTimeout(() => {
      // Re-fetch room and re-compute action — phase may have changed during the delay
      const currentRoom = this.rooms.getRoom(roomCode);
      if (!currentRoom || !currentRoom.engine) return;

      const currentBotAI = new BotAI(currentRoom.botDifficulty, this.getMcConfig(currentRoom.botDifficulty));
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
        this.monitor?.botActionError(roomCode, (err as Error).message);
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

  private buildBotDecisionEnrichment(
    tier: BotDifficulty,
    hand: Card[],
    engine: GameEngine,
    branchTag: string | null,
  ): Record<string, unknown> {
    const trick = engine.state.currentTrick;
    const top = trick.plays.length > 0 ? trick.plays[trick.plays.length - 1].combination : null;
    let trickPoints = 0;
    for (const play of trick.plays) {
      for (const card of play.combination.cards) trickPoints += getCardPoints(card);
    }
    const oppCardCounts: Record<number, number> = {};
    const tichuCalls: Record<number, TichuCall> = { 0: 'none', 1: 'none', 2: 'none', 3: 'none' };
    for (const p of engine.state.players) {
      oppCardCounts[p.position] = p.hand.length;
      tichuCalls[p.position] = p.tichuCall;
    }
    return {
      bot: {
        tier,
        branchTag,
        hand: hand.map((c) => c.id),
        trickTop: top ? { type: top.type, rank: top.rank, length: top.length } : null,
        trickPoints,
        oppCardCounts,
        tichuCalls,
      },
    };
  }

  private attachBotDecision(events: GameEvent[], enrichment: Record<string, unknown>): void {
    for (const ev of events) {
      if (ev.type !== 'PLAY' && ev.type !== 'BOMB' && ev.type !== 'PASS') continue;
      ev.data = { ...(ev.data ?? {}), ...enrichment };
    }
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
      phase === GamePhase.WAITING ||
      engine.state.roundEndPending
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
      if (engine.state.wishPending !== null) {
        const wishPos = engine.state.wishPending;
        const wishPlayer = room.players.get(wishPos);
        // Auto-resolve wish if player is a bot OR disconnected (prevents game freeze)
        if (room.botPositions.has(wishPos) || !wishPlayer?.connected) {
          const hand = engine.state.players[wishPos].hand;
          const gameContext = this.buildGameContext(engine);
          const rank = botAI.chooseWish(hand, gameContext);
          return () => engine.setWish(wishPos, rank);
        }
        return null; // Connected human — wait for their wish
      }

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
        ? (candidates: (Card[] | null)[]) => monteCarloEvaluate(engine, currentPlayer, candidates, botAI.config.mcSims, botAI.config.mcTimeMs, this.monitor, room.code)
        : undefined;

      botAI.lastBranch = null;
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

      const enrichment = this.buildBotDecisionEnrichment(room.botDifficulty, hand, engine, botAI.lastBranch);

      if (cardIds) {
        const ids = cardIds;
        return () => {
          const events = engine.playCards(currentPlayer, ids);
          this.attachBotDecision(events, enrichment);
          return events;
        };
      } else {
        return () => {
          const events = engine.passTurn(currentPlayer);
          this.attachBotDecision(events, enrichment);
          return events;
        };
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
