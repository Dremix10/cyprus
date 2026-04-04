import { NormalRank, Suit, SpecialCardType } from './types/card.js';
import type { Card, NormalCard, SpecialCard } from './types/card.js';

export const CARD_POINTS: Record<string, number> = {
  [NormalRank.FIVE]: 5,
  [NormalRank.TEN]: 10,
  [NormalRank.KING]: 10,
  [SpecialCardType.DRAGON]: 25,
  [SpecialCardType.PHOENIX]: -25,
};

function createNormalCards(): NormalCard[] {
  const cards: NormalCard[] = [];
  for (const suit of Object.values(Suit)) {
    for (const rank of Object.values(NormalRank)) {
      if (typeof rank === 'number') {
        cards.push({
          type: 'normal',
          suit,
          rank,
          id: `${suit}_${rank}`,
        });
      }
    }
  }
  return cards;
}

function createSpecialCards(): SpecialCard[] {
  return Object.values(SpecialCardType).map((specialType) => ({
    type: 'special' as const,
    specialType,
    id: specialType,
  }));
}

export const FULL_DECK: Card[] = [
  ...createNormalCards(),
  ...createSpecialCards(),
];

export const WINNING_SCORE = 1000;
export const TICHU_POINTS = 100;
export const GRAND_TICHU_POINTS = 200;
export const TOTAL_CARD_POINTS = 100;
