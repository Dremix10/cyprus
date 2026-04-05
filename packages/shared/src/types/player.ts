import type { Card } from './card.js';

export type PlayerPosition = 0 | 1 | 2 | 3;

export type TichuCall = 'none' | 'tichu' | 'grand_tichu';

export type PublicPlayerState = {
  position: PlayerPosition;
  nickname: string;
  cardCount: number;
  collectedCards: number;
  hasPassed: boolean;
  tichuCall: TichuCall;
  isOut: boolean;
  finishOrder: number | null;
  hand?: Card[];
};

export type PrivatePlayerState = PublicPlayerState & {
  hand: Card[];
};
