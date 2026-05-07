import type { GameEngine } from './GameEngine.js';

export type ReplaySnapshot = {
  phase: string;
  currentPlayer: number;
  players: Array<{
    position: number;
    nickname: string;
    hand: string[];
    cardCount: number;
    isOut: boolean;
    finishOrder: number | null;
    tichuCall: string;
    grandTichuDecided: boolean;
    hasPlayedCards: boolean;
  }>;
  currentTrick: {
    plays: Array<{
      playerPosition: number;
      cards: string[];
      comboType: string;
      rank: number;
      length: number;
    }>;
    currentWinner: number | null;
    passCount: number;
    passedPlayers: number[];
  };
  wish: {
    active: boolean;
    wishedRank: number | null;
    wishedBy: number | null;
  };
  finishOrder: number[];
  scores: [number, number];
  roundScores: [number, number];
  targetScore: number;
  pending: {
    wish: number | null;
    dog: boolean;
    trickWon: boolean;
    roundEnd: boolean;
  };
};

export function buildReplaySnapshot(engine: GameEngine): ReplaySnapshot {
  const state = engine.state;
  return {
    phase: state.phase,
    currentPlayer: state.currentPlayer,
    players: state.players.map((p) => ({
      position: p.position,
      nickname: p.nickname,
      hand: p.hand.map((c) => c.id),
      cardCount: p.hand.length,
      isOut: p.isOut,
      finishOrder: p.finishOrder ?? null,
      tichuCall: p.tichuCall,
      grandTichuDecided: p.grandTichuDecided,
      hasPlayedCards: p.hasPlayedCards,
    })),
    currentTrick: {
      plays: state.currentTrick.plays.map((p) => ({
        playerPosition: p.playerPosition,
        cards: p.combination.cards.map((c) => c.id),
        comboType: p.combination.type,
        rank: p.combination.rank,
        length: p.combination.length,
      })),
      currentWinner: state.currentTrick.currentWinner,
      passCount: state.currentTrick.passCount,
      passedPlayers: [...state.currentTrick.passedPlayers],
    },
    wish: { ...state.wish },
    finishOrder: [...state.finishOrder],
    scores: [...state.scores] as [number, number],
    roundScores: [...state.roundScores] as [number, number],
    targetScore: engine.getTargetScore(),
    pending: {
      wish: state.wishPending,
      dog: state.dogPending,
      trickWon: state.trickWonPending,
      roundEnd: state.roundEndPending,
    },
  };
}
