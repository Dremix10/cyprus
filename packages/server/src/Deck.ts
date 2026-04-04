import { FULL_DECK } from '@cyprus/shared';
import type { Card } from '@cyprus/shared';

/** Fisher-Yates shuffle a copy of the array. */
function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export type DealtCards = {
  /** First 8 cards per player (for Grand Tichu decision) */
  initial: [Card[], Card[], Card[], Card[]];
  /** Remaining 6 cards per player (dealt after Grand Tichu) */
  remaining: [Card[], Card[], Card[], Card[]];
};

/** Shuffle the deck and split into 4 hands of 14 (8 initial + 6 remaining). */
export function dealCards(): DealtCards {
  const deck = shuffle(FULL_DECK);

  const initial: [Card[], Card[], Card[], Card[]] = [[], [], [], []];
  const remaining: [Card[], Card[], Card[], Card[]] = [[], [], [], []];

  for (let i = 0; i < 4; i++) {
    initial[i] = deck.slice(i * 14, i * 14 + 8);
    remaining[i] = deck.slice(i * 14 + 8, i * 14 + 14);
  }

  return { initial, remaining };
}
