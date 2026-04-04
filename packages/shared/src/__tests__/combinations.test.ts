import { describe, it, expect } from 'vitest';
import { detectCombination, canBeat, getPhoenixSingleRank } from '../combinations.js';
import { CombinationType } from '../types/combination.js';
import { Suit, NormalRank, SpecialCardType } from '../types/card.js';
import type { Card, NormalCard, SpecialCard } from '../types/card.js';

// ─── Helpers ───────────────────────────────────────────────────────────

function nc(suit: Suit, rank: NormalRank): NormalCard {
  return { type: 'normal', suit, rank, id: `${suit}_${rank}` };
}

function sc(specialType: SpecialCardType): SpecialCard {
  return { type: 'special', specialType, id: specialType };
}

const S = Suit;
const R = NormalRank;

// ─── Singles ───────────────────────────────────────────────────────────

describe('detectCombination - singles', () => {
  it('detects a normal single', () => {
    const combo = detectCombination([nc(S.JADE, R.SEVEN)]);
    expect(combo).not.toBeNull();
    expect(combo!.type).toBe(CombinationType.SINGLE);
    expect(combo!.rank).toBe(7);
  });

  it('detects Mahjong single (rank 1)', () => {
    const combo = detectCombination([sc(SpecialCardType.MAHJONG)]);
    expect(combo!.type).toBe(CombinationType.SINGLE);
    expect(combo!.rank).toBe(1);
  });

  it('detects Dragon single (rank 15)', () => {
    const combo = detectCombination([sc(SpecialCardType.DRAGON)]);
    expect(combo!.type).toBe(CombinationType.SINGLE);
    expect(combo!.rank).toBe(15);
  });

  it('detects Dog single (rank 0)', () => {
    const combo = detectCombination([sc(SpecialCardType.DOG)]);
    expect(combo!.type).toBe(CombinationType.SINGLE);
    expect(combo!.rank).toBe(0);
  });

  it('detects Phoenix single', () => {
    const combo = detectCombination([sc(SpecialCardType.PHOENIX)]);
    expect(combo!.type).toBe(CombinationType.SINGLE);
    expect(combo!.rank).toBe(1.5);
  });
});

// ─── Pairs ─────────────────────────────────────────────────────────────

describe('detectCombination - pairs', () => {
  it('detects a normal pair', () => {
    const combo = detectCombination([
      nc(S.JADE, R.SEVEN),
      nc(S.STAR, R.SEVEN),
    ]);
    expect(combo!.type).toBe(CombinationType.PAIR);
    expect(combo!.rank).toBe(7);
  });

  it('detects pair with Phoenix', () => {
    const combo = detectCombination([
      nc(S.JADE, R.ACE),
      sc(SpecialCardType.PHOENIX),
    ]);
    expect(combo!.type).toBe(CombinationType.PAIR);
    expect(combo!.rank).toBe(14);
  });

  it('rejects mismatched pair', () => {
    const combo = detectCombination([
      nc(S.JADE, R.SEVEN),
      nc(S.STAR, R.EIGHT),
    ]);
    expect(combo).toBeNull();
  });

  it('detects Mahjong + Phoenix pair (rank 1)', () => {
    const combo = detectCombination([
      sc(SpecialCardType.MAHJONG),
      sc(SpecialCardType.PHOENIX),
    ]);
    expect(combo!.type).toBe(CombinationType.PAIR);
    expect(combo!.rank).toBe(1);
  });

  it('rejects Dragon in a pair', () => {
    const combo = detectCombination([
      sc(SpecialCardType.DRAGON),
      nc(S.JADE, R.ACE),
    ]);
    expect(combo).toBeNull();
  });

  it('rejects Dog in a pair', () => {
    const combo = detectCombination([
      sc(SpecialCardType.DOG),
      nc(S.JADE, R.ACE),
    ]);
    expect(combo).toBeNull();
  });
});

// ─── Triples ───────────────────────────────────────────────────────────

describe('detectCombination - triples', () => {
  it('detects a normal triple', () => {
    const combo = detectCombination([
      nc(S.JADE, R.NINE),
      nc(S.STAR, R.NINE),
      nc(S.SWORD, R.NINE),
    ]);
    expect(combo!.type).toBe(CombinationType.TRIPLE);
    expect(combo!.rank).toBe(9);
  });

  it('detects triple with Phoenix', () => {
    const combo = detectCombination([
      nc(S.JADE, R.QUEEN),
      nc(S.STAR, R.QUEEN),
      sc(SpecialCardType.PHOENIX),
    ]);
    expect(combo!.type).toBe(CombinationType.TRIPLE);
    expect(combo!.rank).toBe(12);
  });

  it('rejects invalid triple', () => {
    const combo = detectCombination([
      nc(S.JADE, R.SEVEN),
      nc(S.STAR, R.SEVEN),
      nc(S.SWORD, R.EIGHT),
    ]);
    expect(combo).toBeNull();
  });
});

// ─── Four of a Kind Bomb ───────────────────────────────────────────────

describe('detectCombination - four of a kind bomb', () => {
  it('detects a four of a kind bomb', () => {
    const combo = detectCombination([
      nc(S.JADE, R.TEN),
      nc(S.STAR, R.TEN),
      nc(S.SWORD, R.TEN),
      nc(S.PAGODA, R.TEN),
    ]);
    expect(combo!.type).toBe(CombinationType.FOUR_OF_A_KIND_BOMB);
    expect(combo!.rank).toBe(10);
    expect(combo!.bombPower).toBe(10);
  });

  it('rejects four cards with Phoenix (not a bomb)', () => {
    const combo = detectCombination([
      nc(S.JADE, R.TEN),
      nc(S.STAR, R.TEN),
      nc(S.SWORD, R.TEN),
      sc(SpecialCardType.PHOENIX),
    ]);
    // 3 tens + phoenix = not a bomb (phoenix can't be in bombs)
    // But this could be detected as something else? No, 4 cards with no valid combo = null
    expect(combo).toBeNull();
  });
});

// ─── Straight Flush Bomb ───────────────────────────────────────────────

describe('detectCombination - straight flush bomb', () => {
  it('detects a 5-card straight flush bomb', () => {
    const combo = detectCombination([
      nc(S.JADE, R.THREE),
      nc(S.JADE, R.FOUR),
      nc(S.JADE, R.FIVE),
      nc(S.JADE, R.SIX),
      nc(S.JADE, R.SEVEN),
    ]);
    expect(combo!.type).toBe(CombinationType.STRAIGHT_FLUSH_BOMB);
    expect(combo!.rank).toBe(7);
    expect(combo!.length).toBe(5);
  });

  it('detects a longer straight flush bomb', () => {
    const combo = detectCombination([
      nc(S.STAR, R.EIGHT),
      nc(S.STAR, R.NINE),
      nc(S.STAR, R.TEN),
      nc(S.STAR, R.JACK),
      nc(S.STAR, R.QUEEN),
      nc(S.STAR, R.KING),
    ]);
    expect(combo!.type).toBe(CombinationType.STRAIGHT_FLUSH_BOMB);
    expect(combo!.length).toBe(6);
  });

  it('rejects straight flush with Phoenix', () => {
    const combo = detectCombination([
      nc(S.JADE, R.THREE),
      nc(S.JADE, R.FOUR),
      nc(S.JADE, R.FIVE),
      nc(S.JADE, R.SIX),
      sc(SpecialCardType.PHOENIX),
    ]);
    // Not a bomb — but could be a straight
    expect(combo).not.toBeNull();
    expect(combo!.type).not.toBe(CombinationType.STRAIGHT_FLUSH_BOMB);
  });

  it('rejects mixed suits', () => {
    const cards: Card[] = [
      nc(S.JADE, R.THREE),
      nc(S.STAR, R.FOUR),
      nc(S.JADE, R.FIVE),
      nc(S.JADE, R.SIX),
      nc(S.JADE, R.SEVEN),
    ];
    const combo = detectCombination(cards);
    // Should be a regular straight, not a straight flush bomb
    expect(combo).not.toBeNull();
    if (combo) {
      expect(combo.type).not.toBe(CombinationType.STRAIGHT_FLUSH_BOMB);
    }
  });
});

// ─── Straights ─────────────────────────────────────────────────────────

describe('detectCombination - straights', () => {
  it('detects a 5-card straight', () => {
    const combo = detectCombination([
      nc(S.JADE, R.THREE),
      nc(S.STAR, R.FOUR),
      nc(S.SWORD, R.FIVE),
      nc(S.PAGODA, R.SIX),
      nc(S.JADE, R.SEVEN),
    ]);
    expect(combo!.type).toBe(CombinationType.STRAIGHT);
    expect(combo!.rank).toBe(7);
    expect(combo!.length).toBe(5);
  });

  it('detects a straight starting with Mahjong (rank 1)', () => {
    const combo = detectCombination([
      sc(SpecialCardType.MAHJONG),
      nc(S.JADE, R.TWO),
      nc(S.STAR, R.THREE),
      nc(S.SWORD, R.FOUR),
      nc(S.PAGODA, R.FIVE),
    ]);
    expect(combo!.type).toBe(CombinationType.STRAIGHT);
    expect(combo!.rank).toBe(5);
    expect(combo!.length).toBe(5);
  });

  it('detects a straight with Phoenix filling a gap', () => {
    const combo = detectCombination([
      nc(S.JADE, R.THREE),
      nc(S.STAR, R.FOUR),
      sc(SpecialCardType.PHOENIX), // fills 5
      nc(S.PAGODA, R.SIX),
      nc(S.JADE, R.SEVEN),
    ]);
    expect(combo!.type).toBe(CombinationType.STRAIGHT);
    expect(combo!.rank).toBe(7);
    expect(combo!.length).toBe(5);
  });

  it('detects a straight with Phoenix extending high', () => {
    const combo = detectCombination([
      nc(S.JADE, R.TEN),
      nc(S.STAR, R.JACK),
      nc(S.SWORD, R.QUEEN),
      nc(S.PAGODA, R.KING),
      sc(SpecialCardType.PHOENIX),
    ]);
    expect(combo!.type).toBe(CombinationType.STRAIGHT);
    expect(combo!.length).toBe(5);
  });

  it('detects a long straight (7 cards)', () => {
    const combo = detectCombination([
      nc(S.JADE, R.THREE),
      nc(S.STAR, R.FOUR),
      nc(S.SWORD, R.FIVE),
      nc(S.PAGODA, R.SIX),
      nc(S.JADE, R.SEVEN),
      nc(S.STAR, R.EIGHT),
      nc(S.SWORD, R.NINE),
    ]);
    expect(combo!.type).toBe(CombinationType.STRAIGHT);
    expect(combo!.rank).toBe(9);
    expect(combo!.length).toBe(7);
  });

  it('rejects straight with too many gaps for Phoenix', () => {
    const combo = detectCombination([
      nc(S.JADE, R.THREE),
      nc(S.STAR, R.FOUR),
      sc(SpecialCardType.PHOENIX),
      nc(S.PAGODA, R.EIGHT),
      nc(S.JADE, R.NINE),
    ]);
    expect(combo).toBeNull();
  });

  it('rejects straight with duplicate ranks', () => {
    const combo = detectCombination([
      nc(S.JADE, R.THREE),
      nc(S.STAR, R.THREE),
      nc(S.SWORD, R.FOUR),
      nc(S.PAGODA, R.FIVE),
      nc(S.JADE, R.SIX),
    ]);
    expect(combo).toBeNull();
  });

  it('rejects 4-card straight (minimum is 5)', () => {
    const combo = detectCombination([
      nc(S.JADE, R.THREE),
      nc(S.STAR, R.FOUR),
      nc(S.SWORD, R.FIVE),
      nc(S.PAGODA, R.SIX),
    ]);
    // 4 cards of different ranks — could only be a bomb or consecutive pairs
    expect(combo?.type).not.toBe(CombinationType.STRAIGHT);
  });
});

// ─── Full House ────────────────────────────────────────────────────────

describe('detectCombination - full house', () => {
  it('detects a normal full house', () => {
    const combo = detectCombination([
      nc(S.JADE, R.SEVEN),
      nc(S.STAR, R.SEVEN),
      nc(S.SWORD, R.SEVEN),
      nc(S.PAGODA, R.KING),
      nc(S.JADE, R.KING),
    ]);
    expect(combo!.type).toBe(CombinationType.FULL_HOUSE);
    expect(combo!.rank).toBe(7); // rank of the triple
  });

  it('detects full house with Phoenix completing pair', () => {
    const combo = detectCombination([
      nc(S.JADE, R.JACK),
      nc(S.STAR, R.JACK),
      nc(S.SWORD, R.JACK),
      nc(S.PAGODA, R.FIVE),
      sc(SpecialCardType.PHOENIX),
    ]);
    expect(combo!.type).toBe(CombinationType.FULL_HOUSE);
    expect(combo!.rank).toBe(11); // triple of jacks
  });

  it('detects full house with Phoenix completing triple (two pairs)', () => {
    const combo = detectCombination([
      nc(S.JADE, R.QUEEN),
      nc(S.STAR, R.QUEEN),
      nc(S.SWORD, R.FOUR),
      nc(S.PAGODA, R.FOUR),
      sc(SpecialCardType.PHOENIX),
    ]);
    expect(combo!.type).toBe(CombinationType.FULL_HOUSE);
    expect(combo!.rank).toBe(12); // phoenix makes queens the triple
  });

  it('rejects 5 cards that are not a full house', () => {
    const combo = detectCombination([
      nc(S.JADE, R.TWO),
      nc(S.STAR, R.THREE),
      nc(S.SWORD, R.FOUR),
      nc(S.PAGODA, R.FIVE),
      nc(S.JADE, R.SEVEN),
    ]);
    // This is not a straight (missing 6), not a full house
    expect(combo?.type).not.toBe(CombinationType.FULL_HOUSE);
  });
});

// ─── Consecutive Pairs ─────────────────────────────────────────────────

describe('detectCombination - consecutive pairs', () => {
  it('detects 2 consecutive pairs (4 cards)', () => {
    const combo = detectCombination([
      nc(S.JADE, R.FIVE),
      nc(S.STAR, R.FIVE),
      nc(S.SWORD, R.SIX),
      nc(S.PAGODA, R.SIX),
    ]);
    expect(combo!.type).toBe(CombinationType.CONSECUTIVE_PAIRS);
    expect(combo!.rank).toBe(6);
    expect(combo!.length).toBe(4);
  });

  it('detects 3 consecutive pairs (6 cards)', () => {
    const combo = detectCombination([
      nc(S.JADE, R.SEVEN),
      nc(S.STAR, R.SEVEN),
      nc(S.SWORD, R.EIGHT),
      nc(S.PAGODA, R.EIGHT),
      nc(S.JADE, R.NINE),
      nc(S.STAR, R.NINE),
    ]);
    expect(combo!.type).toBe(CombinationType.CONSECUTIVE_PAIRS);
    expect(combo!.rank).toBe(9);
    expect(combo!.length).toBe(6);
  });

  it('detects consecutive pairs with Phoenix completing a pair', () => {
    const combo = detectCombination([
      nc(S.JADE, R.FIVE),
      nc(S.STAR, R.FIVE),
      nc(S.SWORD, R.SIX),
      sc(SpecialCardType.PHOENIX),
    ]);
    expect(combo!.type).toBe(CombinationType.CONSECUTIVE_PAIRS);
    expect(combo!.rank).toBe(6);
  });

  it('rejects non-consecutive pairs', () => {
    const combo = detectCombination([
      nc(S.JADE, R.FIVE),
      nc(S.STAR, R.FIVE),
      nc(S.SWORD, R.EIGHT),
      nc(S.PAGODA, R.EIGHT),
    ]);
    expect(combo).toBeNull();
  });
});

// ─── canBeat ───────────────────────────────────────────────────────────

describe('canBeat', () => {
  it('higher single beats lower single', () => {
    const current = detectCombination([nc(S.JADE, R.SEVEN)])!;
    const played = detectCombination([nc(S.STAR, R.NINE)])!;
    expect(canBeat(current, played)).toBe(true);
  });

  it('lower single does not beat higher single', () => {
    const current = detectCombination([nc(S.JADE, R.NINE)])!;
    const played = detectCombination([nc(S.STAR, R.SEVEN)])!;
    expect(canBeat(current, played)).toBe(false);
  });

  it('same rank does not beat', () => {
    const current = detectCombination([nc(S.JADE, R.SEVEN)])!;
    const played = detectCombination([nc(S.STAR, R.SEVEN)])!;
    expect(canBeat(current, played)).toBe(false);
  });

  it('higher pair beats lower pair', () => {
    const current = detectCombination([nc(S.JADE, R.FIVE), nc(S.STAR, R.FIVE)])!;
    const played = detectCombination([nc(S.SWORD, R.KING), nc(S.PAGODA, R.KING)])!;
    expect(canBeat(current, played)).toBe(true);
  });

  it('pair cannot beat single', () => {
    const current = detectCombination([nc(S.JADE, R.FIVE)])!;
    const played = detectCombination([nc(S.SWORD, R.KING), nc(S.PAGODA, R.KING)])!;
    expect(canBeat(current, played)).toBe(false);
  });

  it('four of a kind bomb beats any non-bomb', () => {
    const current = detectCombination([nc(S.JADE, R.ACE)])!;
    const played = detectCombination([
      nc(S.JADE, R.TWO),
      nc(S.STAR, R.TWO),
      nc(S.SWORD, R.TWO),
      nc(S.PAGODA, R.TWO),
    ])!;
    expect(canBeat(current, played)).toBe(true);
  });

  it('higher four of a kind bomb beats lower', () => {
    const lower = detectCombination([
      nc(S.JADE, R.THREE),
      nc(S.STAR, R.THREE),
      nc(S.SWORD, R.THREE),
      nc(S.PAGODA, R.THREE),
    ])!;
    const higher = detectCombination([
      nc(S.JADE, R.TEN),
      nc(S.STAR, R.TEN),
      nc(S.SWORD, R.TEN),
      nc(S.PAGODA, R.TEN),
    ])!;
    expect(canBeat(lower, higher)).toBe(true);
    expect(canBeat(higher, lower)).toBe(false);
  });

  it('straight flush bomb beats four of a kind bomb', () => {
    const fourKind = detectCombination([
      nc(S.JADE, R.ACE),
      nc(S.STAR, R.ACE),
      nc(S.SWORD, R.ACE),
      nc(S.PAGODA, R.ACE),
    ])!;
    const straightFlush = detectCombination([
      nc(S.JADE, R.THREE),
      nc(S.JADE, R.FOUR),
      nc(S.JADE, R.FIVE),
      nc(S.JADE, R.SIX),
      nc(S.JADE, R.SEVEN),
    ])!;
    expect(canBeat(fourKind, straightFlush)).toBe(true);
  });

  it('four of a kind bomb does not beat straight flush bomb', () => {
    const straightFlush = detectCombination([
      nc(S.JADE, R.THREE),
      nc(S.JADE, R.FOUR),
      nc(S.JADE, R.FIVE),
      nc(S.JADE, R.SIX),
      nc(S.JADE, R.SEVEN),
    ])!;
    const fourKind = detectCombination([
      nc(S.JADE, R.ACE),
      nc(S.STAR, R.ACE),
      nc(S.SWORD, R.ACE),
      nc(S.PAGODA, R.ACE),
    ])!;
    expect(canBeat(straightFlush, fourKind)).toBe(false);
  });

  it('longer straight flush bomb beats shorter', () => {
    const shorter = detectCombination([
      nc(S.JADE, R.THREE),
      nc(S.JADE, R.FOUR),
      nc(S.JADE, R.FIVE),
      nc(S.JADE, R.SIX),
      nc(S.JADE, R.SEVEN),
    ])!;
    const longer = detectCombination([
      nc(S.STAR, R.TWO),
      nc(S.STAR, R.THREE),
      nc(S.STAR, R.FOUR),
      nc(S.STAR, R.FIVE),
      nc(S.STAR, R.SIX),
      nc(S.STAR, R.SEVEN),
    ])!;
    expect(canBeat(shorter, longer)).toBe(true);
  });

  it('non-bomb cannot beat bomb', () => {
    const bomb = detectCombination([
      nc(S.JADE, R.TWO),
      nc(S.STAR, R.TWO),
      nc(S.SWORD, R.TWO),
      nc(S.PAGODA, R.TWO),
    ])!;
    const pair = detectCombination([nc(S.JADE, R.ACE), nc(S.STAR, R.ACE)])!;
    expect(canBeat(bomb, pair)).toBe(false);
  });

  it('straight must match length', () => {
    const fiveCard = detectCombination([
      nc(S.JADE, R.THREE),
      nc(S.STAR, R.FOUR),
      nc(S.SWORD, R.FIVE),
      nc(S.PAGODA, R.SIX),
      nc(S.JADE, R.SEVEN),
    ])!;
    const sevenCard = detectCombination([
      nc(S.JADE, R.FOUR),
      nc(S.STAR, R.FIVE),
      nc(S.SWORD, R.SIX),
      nc(S.PAGODA, R.SEVEN),
      nc(S.JADE, R.EIGHT),
      nc(S.STAR, R.NINE),
      nc(S.SWORD, R.TEN),
    ])!;
    expect(canBeat(fiveCard, sevenCard)).toBe(false);
  });

  it('Dragon beats everything as a single', () => {
    const aceCard = detectCombination([nc(S.JADE, R.ACE)])!;
    const dragon = detectCombination([sc(SpecialCardType.DRAGON)])!;
    expect(canBeat(aceCard, dragon)).toBe(true);
  });
});

// ─── Phoenix single rank ──────────────────────────────────────────────

describe('getPhoenixSingleRank', () => {
  it('returns 0.5 above the last played rank', () => {
    expect(getPhoenixSingleRank(7)).toBe(7.5);
    expect(getPhoenixSingleRank(14)).toBe(14.5);
  });

  it('Phoenix at 14.5 still below Dragon at 15', () => {
    expect(getPhoenixSingleRank(14)).toBeLessThan(15);
  });
});

// ─── Edge cases ────────────────────────────────────────────────────────

describe('detectCombination - edge cases', () => {
  it('empty cards returns null', () => {
    expect(detectCombination([])).toBeNull();
  });

  it('Dragon cannot be in multi-card combinations', () => {
    expect(
      detectCombination([sc(SpecialCardType.DRAGON), nc(S.JADE, R.ACE)])
    ).toBeNull();
  });

  it('Dog cannot be in multi-card combinations', () => {
    expect(
      detectCombination([sc(SpecialCardType.DOG), nc(S.JADE, R.ACE)])
    ).toBeNull();
  });
});
