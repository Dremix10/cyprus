import { describe, it, expect } from 'vitest';
import { detectCombination, canBeat } from '../combinations.js';
import { sortCombinationForDisplay, getPhoenixDisplayLabel } from '../combinationDisplay.js';
import { CombinationType } from '../types/combination.js';
import { Suit, NormalRank, SpecialCardType } from '../types/card.js';
import type { Card, NormalCard, SpecialCard } from '../types/card.js';

const S = Suit;
const R = NormalRank;

function nc(suit: Suit, rank: NormalRank): NormalCard {
  return { type: 'normal', suit, rank, id: `${suit}_${rank}` };
}

function sc(specialType: SpecialCardType): SpecialCard {
  return { type: 'special', specialType, id: specialType };
}

function ids(cards: Card[]): string[] {
  return cards.map((c) => c.id);
}

describe('sortCombinationForDisplay', () => {
  it('puts Phoenix in the gap of a straight, not at the end', () => {
    const cards = [
      nc(S.JADE, R.SEVEN),
      nc(S.STAR, R.SIX),
      sc(SpecialCardType.PHOENIX),
      nc(S.PAGODA, R.THREE),
      nc(S.JADE, R.FOUR),
    ];
    const combo = detectCombination(cards)!;
    expect(combo.type).toBe(CombinationType.STRAIGHT);
    expect(ids(sortCombinationForDisplay(combo))).toEqual([
      'PAGODA_3',
      'JADE_4',
      'PHOENIX',
      'STAR_6',
      'JADE_7',
    ]);
    expect(getPhoenixDisplayLabel(combo)).toBe('5');
  });

  it('puts Phoenix at the high end when it extends a straight', () => {
    const cards = [
      sc(SpecialCardType.PHOENIX),
      nc(S.JADE, R.TEN),
      nc(S.STAR, R.JACK),
      nc(S.SWORD, R.QUEEN),
      nc(S.PAGODA, R.KING),
    ];
    const combo = detectCombination(cards)!;
    expect(ids(sortCombinationForDisplay(combo))).toEqual([
      'JADE_10',
      'STAR_11',
      'SWORD_12',
      'PAGODA_13',
      'PHOENIX',
    ]);
    expect(getPhoenixDisplayLabel(combo)).toBe('A');
  });

  it('puts Phoenix below an Ace-high straight it cannot extend upward', () => {
    const cards = [
      nc(S.JADE, R.TEN),
      nc(S.STAR, R.JACK),
      nc(S.SWORD, R.QUEEN),
      nc(S.PAGODA, R.KING),
      nc(S.JADE, R.ACE),
      sc(SpecialCardType.PHOENIX),
    ];
    const combo = detectCombination(cards)!;
    expect(ids(sortCombinationForDisplay(combo))[0]).toBe('PHOENIX');
    expect(getPhoenixDisplayLabel(combo)).toBe('9');
  });

  it('puts Phoenix beside the single it completes in consecutive pairs', () => {
    const low = detectCombination([
      nc(S.JADE, R.FIVE),
      nc(S.SWORD, R.SIX),
      nc(S.PAGODA, R.SIX),
      sc(SpecialCardType.PHOENIX),
    ])!;
    expect(ids(sortCombinationForDisplay(low))).toEqual([
      'JADE_5',
      'PHOENIX',
      'PAGODA_6',
      'SWORD_6',
    ]);

    const high = detectCombination([
      nc(S.JADE, R.FIVE),
      nc(S.STAR, R.FIVE),
      nc(S.SWORD, R.SIX),
      sc(SpecialCardType.PHOENIX),
    ])!;
    expect(ids(sortCombinationForDisplay(high))).toEqual([
      'JADE_5',
      'STAR_5',
      'SWORD_6',
      'PHOENIX',
    ]);
  });

  it('joins Phoenix to the higher pair in a 2+2 full house', () => {
    const combo = detectCombination([
      nc(S.JADE, R.QUEEN),
      nc(S.STAR, R.QUEEN),
      nc(S.SWORD, R.KING),
      nc(S.PAGODA, R.KING),
      sc(SpecialCardType.PHOENIX),
    ])!;
    expect(combo.rank).toBe(R.KING);
    expect(ids(sortCombinationForDisplay(combo))).toEqual([
      'SWORD_13',
      'PAGODA_13',
      'PHOENIX',
      'JADE_12',
      'STAR_12',
    ]);
    expect(getPhoenixDisplayLabel(combo)).toBe('K');
  });
});

describe('Phoenix single ordering vs strength', () => {
  it('beats any single except the Dragon, and a led Phoenix is still 1.5', () => {
    const phoenix = detectCombination([sc(SpecialCardType.PHOENIX)])!;
    const ace = detectCombination([nc(S.JADE, R.ACE)])!;
    const dragon = detectCombination([sc(SpecialCardType.DRAGON)])!;
    expect(phoenix.rank).toBe(1.5);
    expect(canBeat(ace, phoenix)).toBe(true);
    expect(canBeat(dragon, phoenix)).toBe(false);
    expect(canBeat(phoenix, dragon)).toBe(true);
  });
});
