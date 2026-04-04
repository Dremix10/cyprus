import { describe, it, expect } from 'vitest';
import {
  sortCards,
  getCardSortRank,
  getCardPoints,
  getRankLabel,
  isNormalCard,
  isSpecial,
} from '../cards.js';
import { Suit, NormalRank, SpecialCardType } from '../types/card.js';
import type { Card, NormalCard, SpecialCard } from '../types/card.js';
import { FULL_DECK } from '../constants.js';

// ─── Helpers ───────────────────────────────────────────────────────────

function nc(suit: Suit, rank: NormalRank): NormalCard {
  return { type: 'normal', suit, rank, id: `${suit}_${rank}` };
}

function sc(specialType: SpecialCardType): SpecialCard {
  return { type: 'special', specialType, id: specialType };
}

// ─── Tests ─────────────────────────────────────────────────────────────

describe('FULL_DECK', () => {
  it('has 56 cards', () => {
    expect(FULL_DECK).toHaveLength(56);
  });

  it('has 52 normal cards', () => {
    expect(FULL_DECK.filter((c) => c.type === 'normal')).toHaveLength(52);
  });

  it('has 4 special cards', () => {
    expect(FULL_DECK.filter((c) => c.type === 'special')).toHaveLength(4);
  });

  it('has unique IDs', () => {
    const ids = FULL_DECK.map((c) => c.id);
    expect(new Set(ids).size).toBe(56);
  });
});

describe('getCardSortRank', () => {
  it('returns rank for normal cards', () => {
    expect(getCardSortRank(nc(Suit.JADE, NormalRank.ACE))).toBe(14);
    expect(getCardSortRank(nc(Suit.STAR, NormalRank.TWO))).toBe(2);
  });

  it('returns correct ranks for special cards', () => {
    expect(getCardSortRank(sc(SpecialCardType.MAHJONG))).toBe(1);
    expect(getCardSortRank(sc(SpecialCardType.DOG))).toBe(0);
    expect(getCardSortRank(sc(SpecialCardType.PHOENIX))).toBe(0.5);
    expect(getCardSortRank(sc(SpecialCardType.DRAGON))).toBe(15);
  });
});

describe('sortCards', () => {
  it('sorts by rank ascending', () => {
    const cards: Card[] = [
      nc(Suit.JADE, NormalRank.KING),
      nc(Suit.STAR, NormalRank.TWO),
      nc(Suit.SWORD, NormalRank.TEN),
    ];
    const sorted = sortCards(cards);
    expect(sorted.map(getCardSortRank)).toEqual([2, 10, 13]);
  });

  it('places specials correctly', () => {
    const cards: Card[] = [
      nc(Suit.JADE, NormalRank.FIVE),
      sc(SpecialCardType.DRAGON),
      sc(SpecialCardType.DOG),
      sc(SpecialCardType.MAHJONG),
    ];
    const sorted = sortCards(cards);
    expect(sorted.map(getCardSortRank)).toEqual([0, 1, 5, 15]);
  });
});

describe('getCardPoints', () => {
  it('fives are worth 5', () => {
    expect(getCardPoints(nc(Suit.JADE, NormalRank.FIVE))).toBe(5);
  });

  it('tens are worth 10', () => {
    expect(getCardPoints(nc(Suit.STAR, NormalRank.TEN))).toBe(10);
  });

  it('kings are worth 10', () => {
    expect(getCardPoints(nc(Suit.SWORD, NormalRank.KING))).toBe(10);
  });

  it('dragon is worth 25', () => {
    expect(getCardPoints(sc(SpecialCardType.DRAGON))).toBe(25);
  });

  it('phoenix is worth -25', () => {
    expect(getCardPoints(sc(SpecialCardType.PHOENIX))).toBe(-25);
  });

  it('other cards are worth 0', () => {
    expect(getCardPoints(nc(Suit.JADE, NormalRank.TWO))).toBe(0);
    expect(getCardPoints(nc(Suit.STAR, NormalRank.JACK))).toBe(0);
    expect(getCardPoints(sc(SpecialCardType.MAHJONG))).toBe(0);
    expect(getCardPoints(sc(SpecialCardType.DOG))).toBe(0);
  });

  it('total deck points sum to 100', () => {
    const total = FULL_DECK.reduce((sum, c) => sum + getCardPoints(c), 0);
    expect(total).toBe(100);
  });
});

describe('getRankLabel', () => {
  it('returns number string for numeric ranks', () => {
    expect(getRankLabel(NormalRank.TWO)).toBe('2');
    expect(getRankLabel(NormalRank.TEN)).toBe('10');
  });

  it('returns letter for face cards', () => {
    expect(getRankLabel(NormalRank.JACK)).toBe('J');
    expect(getRankLabel(NormalRank.QUEEN)).toBe('Q');
    expect(getRankLabel(NormalRank.KING)).toBe('K');
    expect(getRankLabel(NormalRank.ACE)).toBe('A');
  });
});

describe('isNormalCard / isSpecial', () => {
  it('identifies normal cards', () => {
    expect(isNormalCard(nc(Suit.JADE, NormalRank.ACE))).toBe(true);
    expect(isNormalCard(sc(SpecialCardType.DRAGON))).toBe(false);
  });

  it('identifies special cards', () => {
    expect(isSpecial(sc(SpecialCardType.PHOENIX), SpecialCardType.PHOENIX)).toBe(true);
    expect(isSpecial(sc(SpecialCardType.DOG), SpecialCardType.PHOENIX)).toBe(false);
    expect(isSpecial(nc(Suit.JADE, NormalRank.ACE), SpecialCardType.PHOENIX)).toBe(false);
  });
});
