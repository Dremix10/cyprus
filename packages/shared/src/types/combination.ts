import type { Card } from './card.js';

export enum CombinationType {
  SINGLE = 'SINGLE',
  PAIR = 'PAIR',
  TRIPLE = 'TRIPLE',
  STRAIGHT = 'STRAIGHT',
  CONSECUTIVE_PAIRS = 'CONSECUTIVE_PAIRS',
  FULL_HOUSE = 'FULL_HOUSE',
  FOUR_OF_A_KIND_BOMB = 'FOUR_OF_A_KIND_BOMB',
  STRAIGHT_FLUSH_BOMB = 'STRAIGHT_FLUSH_BOMB',
}

export type Combination = {
  type: CombinationType;
  cards: Card[];
  rank: number;
  length: number;
  bombPower?: number;
};
