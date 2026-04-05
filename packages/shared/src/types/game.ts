import type { Card, NormalRank } from './card.js';
import type { Combination } from './combination.js';
import type { PlayerPosition, PublicPlayerState } from './player.js';
import type { RoundScoreBreakdown } from '../scoring.js';

export enum GamePhase {
  WAITING = 'WAITING',
  GRAND_TICHU = 'GRAND_TICHU',
  DEALING = 'DEALING',
  PASSING = 'PASSING',
  PLAYING = 'PLAYING',
  DRAGON_GIVE = 'DRAGON_GIVE',
  ROUND_SCORING = 'ROUND_SCORING',
  GAME_OVER = 'GAME_OVER',
}

export type TrickPlay = {
  playerPosition: PlayerPosition;
  combination: Combination;
};

export type TrickState = {
  plays: TrickPlay[];
  currentWinner: PlayerPosition | null;
  passCount: number;
};

export type WishState = {
  active: boolean;
  wishedRank: NormalRank | null;
  wishedBy: PlayerPosition | null;
};

export type ClientGameState = {
  roomCode: string;
  phase: GamePhase;
  myPosition: PlayerPosition;
  myHand: Card[];
  players: PublicPlayerState[];
  currentPlayer: PlayerPosition;
  currentTrick: TrickState;
  wish: WishState;
  finishOrder: PlayerPosition[];
  scores: [number, number];
  roundScores: [number, number];
  targetScore: number;
  roundTrickCards?: [Card[], Card[]];
  roundBreakdown?: RoundScoreBreakdown;
  grandTichuPending?: boolean;
  hasPlayedCards?: boolean;
};
