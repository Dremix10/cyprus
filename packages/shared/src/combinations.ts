import type { Card, NormalCard } from './types/card.js';
import type { Combination } from './types/combination.js';
import { CombinationType } from './types/combination.js';
import { NormalRank, SpecialCardType } from './types/card.js';
import { isNormalCard, isSpecial } from './cards.js';

// ─── Helpers ───────────────────────────────────────────────────────────

function getNormalCards(cards: Card[]): NormalCard[] {
  return cards.filter(isNormalCard);
}

function hasPhoenix(cards: Card[]): boolean {
  return cards.some((c) => isSpecial(c, SpecialCardType.PHOENIX));
}

function hasDragon(cards: Card[]): boolean {
  return cards.some((c) => isSpecial(c, SpecialCardType.DRAGON));
}

function hasDog(cards: Card[]): boolean {
  return cards.some((c) => isSpecial(c, SpecialCardType.DOG));
}

function hasMahjong(cards: Card[]): boolean {
  return cards.some((c) => isSpecial(c, SpecialCardType.MAHJONG));
}

/** Group normal cards by rank. Returns a map of rank -> cards. */
function groupByRank(cards: NormalCard[]): Map<NormalRank, NormalCard[]> {
  const map = new Map<NormalRank, NormalCard[]>();
  for (const card of cards) {
    const group = map.get(card.rank) ?? [];
    group.push(card);
    map.set(card.rank, group);
  }
  return map;
}

/** Get sorted unique ranks from normal cards. */
function getSortedRanks(cards: NormalCard[]): NormalRank[] {
  const ranks = [...new Set(cards.map((c) => c.rank))];
  return ranks.sort((a, b) => a - b);
}

/** Check if ranks form a consecutive sequence. */
function isConsecutive(ranks: NormalRank[]): boolean {
  for (let i = 1; i < ranks.length; i++) {
    if (ranks[i] !== ranks[i - 1] + 1) return false;
  }
  return true;
}

// ─── Detection ─────────────────────────────────────────────────────────

/** Detect what combination a set of cards forms. Returns null if invalid. */
export function detectCombination(cards: Card[]): Combination | null {
  if (cards.length === 0) return null;

  // Single card
  if (cards.length === 1) return detectSingle(cards);

  // Dog and Dragon can only be played as singles
  if (hasDog(cards) || hasDragon(cards)) return null;

  const phoenix = hasPhoenix(cards);
  const mahjong = hasMahjong(cards);
  const normalCards = getNormalCards(cards);

  // Effective normal count: mahjong acts as rank 1
  const effectiveNormalCount = normalCards.length + (mahjong ? 1 : 0);
  const phoenixCount = phoenix ? 1 : 0;
  const totalEffective = effectiveNormalCount + phoenixCount;

  if (totalEffective !== cards.length) return null; // unknown card types

  if (cards.length === 2) return detectPair(cards, normalCards, phoenix, mahjong);
  if (cards.length === 3) return detectTriple(cards, normalCards, phoenix, mahjong);

  // 4+ cards: check bombs first (no phoenix allowed)
  if (cards.length === 4 && !phoenix && !mahjong) {
    const bomb = detectFourOfAKindBomb(cards, normalCards);
    if (bomb) return bomb;
  }

  // Straight flush bomb (5+ same suit, consecutive, no phoenix, no mahjong)
  if (cards.length >= 5 && !phoenix && !mahjong) {
    const sfBomb = detectStraightFlushBomb(cards, normalCards);
    if (sfBomb) return sfBomb;
  }

  // Full house (exactly 5 cards)
  if (cards.length === 5) {
    const fh = detectFullHouse(cards, normalCards, phoenix, mahjong);
    if (fh) return fh;
  }

  // Straight (5+ cards)
  if (cards.length >= 5) {
    const straight = detectStraight(cards, normalCards, phoenix, mahjong);
    if (straight) return straight;
  }

  // Consecutive pairs (4,6,8,... cards)
  if (cards.length >= 4 && cards.length % 2 === 0) {
    const cp = detectConsecutivePairs(cards, normalCards, phoenix, mahjong);
    if (cp) return cp;
  }

  return null;
}

function detectSingle(cards: Card[]): Combination {
  const card = cards[0];
  let rank: number;
  if (card.type === 'normal') {
    rank = card.rank;
  } else {
    switch (card.specialType) {
      case SpecialCardType.MAHJONG:
        rank = 1;
        break;
      case SpecialCardType.DOG:
        rank = 0;
        break;
      case SpecialCardType.PHOENIX:
        rank = 1.5; // default; adjusted when played on a trick
        break;
      case SpecialCardType.DRAGON:
        rank = 15;
        break;
    }
  }
  return { type: CombinationType.SINGLE, cards, rank, length: 1 };
}

function detectPair(
  cards: Card[],
  normalCards: NormalCard[],
  phoenix: boolean,
  mahjong: boolean
): Combination | null {
  if (mahjong) {
    // Mahjong (rank 1) + phoenix = pair of 1s
    if (phoenix && normalCards.length === 0) {
      return { type: CombinationType.PAIR, cards, rank: 1, length: 2 };
    }
    // Mahjong can't pair with a normal card (no normal card has rank 1)
    return null;
  }

  if (normalCards.length === 2) {
    if (normalCards[0].rank === normalCards[1].rank) {
      return {
        type: CombinationType.PAIR,
        cards,
        rank: normalCards[0].rank,
        length: 2,
      };
    }
    return null;
  }

  // 1 normal + phoenix
  if (phoenix && normalCards.length === 1) {
    return {
      type: CombinationType.PAIR,
      cards,
      rank: normalCards[0].rank,
      length: 2,
    };
  }

  return null;
}

function detectTriple(
  cards: Card[],
  normalCards: NormalCard[],
  phoenix: boolean,
  mahjong: boolean
): Combination | null {
  if (mahjong) return null; // Mahjong can't form triples (no rank-1 normal cards)

  if (normalCards.length === 3) {
    if (
      normalCards[0].rank === normalCards[1].rank &&
      normalCards[1].rank === normalCards[2].rank
    ) {
      return {
        type: CombinationType.TRIPLE,
        cards,
        rank: normalCards[0].rank,
        length: 3,
      };
    }
    return null;
  }

  // 2 normals + phoenix
  if (phoenix && normalCards.length === 2) {
    if (normalCards[0].rank === normalCards[1].rank) {
      return {
        type: CombinationType.TRIPLE,
        cards,
        rank: normalCards[0].rank,
        length: 3,
      };
    }
  }

  return null;
}

function detectFourOfAKindBomb(
  cards: Card[],
  normalCards: NormalCard[]
): Combination | null {
  if (normalCards.length !== 4) return null;
  const rank = normalCards[0].rank;
  if (normalCards.every((c) => c.rank === rank)) {
    return {
      type: CombinationType.FOUR_OF_A_KIND_BOMB,
      cards,
      rank,
      length: 4,
      bombPower: rank,
    };
  }
  return null;
}

function detectStraightFlushBomb(
  cards: Card[],
  normalCards: NormalCard[]
): Combination | null {
  if (normalCards.length !== cards.length) return null;
  // All same suit
  const suit = normalCards[0].suit;
  if (!normalCards.every((c) => c.suit === suit)) return null;
  // Consecutive
  const ranks = getSortedRanks(normalCards);
  if (ranks.length !== normalCards.length) return null; // duplicates
  if (!isConsecutive(ranks)) return null;
  return {
    type: CombinationType.STRAIGHT_FLUSH_BOMB,
    cards,
    rank: ranks[ranks.length - 1],
    length: cards.length,
    bombPower: cards.length * 100 + ranks[ranks.length - 1],
  };
}

function detectFullHouse(
  cards: Card[],
  normalCards: NormalCard[],
  phoenix: boolean,
  mahjong: boolean
): Combination | null {
  if (mahjong) return null; // Mahjong can't be part of a full house

  const grouped = groupByRank(normalCards);
  const groups = [...grouped.entries()].sort((a, b) => b[1].length - a[1].length);

  if (!phoenix) {
    // Need exactly 2 groups: one of 3, one of 2
    if (groups.length !== 2) return null;
    if (groups[0][1].length === 3 && groups[1][1].length === 2) {
      return {
        type: CombinationType.FULL_HOUSE,
        cards,
        rank: groups[0][0], // rank of the triple
        length: 5,
      };
    }
    return null;
  }

  // With phoenix: need exactly 2 groups
  if (groups.length === 1) {
    // 4 of same rank: not a full house (it'd be a bomb without phoenix, but with phoenix it's 5 cards)
    // Actually: 4 normals of same rank + phoenix can't be a valid full house
    return null;
  }
  if (groups.length === 2) {
    const [bigger, smaller] = groups;
    // 3 + 1 + phoenix: phoenix completes the pair
    if (bigger[1].length === 3 && smaller[1].length === 1) {
      return {
        type: CombinationType.FULL_HOUSE,
        cards,
        rank: bigger[0],
        length: 5,
      };
    }
    // 2 + 2 + phoenix: phoenix completes one triple; use the higher rank as triple
    if (bigger[1].length === 2 && smaller[1].length === 2) {
      const tripleRank = Math.max(bigger[0], smaller[0]) as NormalRank;
      return {
        type: CombinationType.FULL_HOUSE,
        cards,
        rank: tripleRank,
        length: 5,
      };
    }
  }

  return null;
}

function detectStraight(
  cards: Card[],
  normalCards: NormalCard[],
  phoenix: boolean,
  mahjong: boolean
): Combination | null {
  // Build the set of available ranks
  const rankSet = new Set<number>();
  for (const c of normalCards) rankSet.add(c.rank);
  if (mahjong) rankSet.add(1); // Mahjong counts as rank 1

  // Check for duplicate ranks (each rank should appear once)
  if (rankSet.size !== normalCards.length + (mahjong ? 1 : 0)) return null;

  const ranks = [...rankSet].sort((a, b) => a - b);
  const gaps = countGaps(ranks);

  if (phoenix) {
    // Phoenix can fill exactly 1 gap or extend by 1 at either end
    if (gaps === 0) {
      // No gap — phoenix extends. Straight of length ranks.length + 1
      if (ranks.length + 1 !== cards.length) return null;
      const highRank = ranks[ranks.length - 1] + 1 <= NormalRank.ACE
        ? ranks[ranks.length - 1] + 1
        : ranks[ranks.length - 1]; // extend high if possible
      return {
        type: CombinationType.STRAIGHT,
        cards,
        rank: Math.max(highRank, ranks[ranks.length - 1]),
        length: cards.length,
      };
    }
    if (gaps === 1) {
      if (ranks.length + 1 !== cards.length) return null;
      return {
        type: CombinationType.STRAIGHT,
        cards,
        rank: ranks[ranks.length - 1],
        length: cards.length,
      };
    }
    return null; // too many gaps
  }

  // No phoenix: must be fully consecutive
  if (!isConsecutive(ranks as NormalRank[])) return null;
  if (ranks.length !== cards.length) return null;

  return {
    type: CombinationType.STRAIGHT,
    cards,
    rank: ranks[ranks.length - 1],
    length: cards.length,
  };
}

function countGaps(sortedRanks: number[]): number {
  let gaps = 0;
  for (let i = 1; i < sortedRanks.length; i++) {
    const diff = sortedRanks[i] - sortedRanks[i - 1];
    if (diff > 1) gaps += diff - 1;
  }
  return gaps;
}

function detectConsecutivePairs(
  cards: Card[],
  normalCards: NormalCard[],
  phoenix: boolean,
  mahjong: boolean
): Combination | null {
  if (mahjong) return null; // Mahjong (rank 1) can't pair with anything

  const grouped = groupByRank(normalCards);
  const pairCount = cards.length / 2;

  if (!phoenix) {
    // Every group must have exactly 2 cards
    if (grouped.size !== pairCount) return null;
    for (const [, group] of grouped) {
      if (group.length !== 2) return null;
    }
    const ranks = getSortedRanks(normalCards);
    if (!isConsecutive(ranks)) return null;
    return {
      type: CombinationType.CONSECUTIVE_PAIRS,
      cards,
      rank: ranks[ranks.length - 1],
      length: cards.length,
    };
  }

  // With phoenix: one group can have 1 card (phoenix completes it) or phoenix fills a gap
  const entries = [...grouped.entries()].sort((a, b) => a[0] - b[0]);
  const singles = entries.filter(([, g]) => g.length === 1);
  const pairs = entries.filter(([, g]) => g.length === 2);
  const others = entries.filter(([, g]) => g.length > 2);

  if (others.length > 0) return null;

  if (singles.length === 1 && pairs.length === pairCount - 1) {
    // Phoenix completes the single into a pair
    const allRanks = entries.map(([r]) => r).sort((a, b) => a - b);
    if (allRanks.length !== pairCount) return null;
    if (!isConsecutive(allRanks)) return null;
    return {
      type: CombinationType.CONSECUTIVE_PAIRS,
      cards,
      rank: allRanks[allRanks.length - 1],
      length: cards.length,
    };
  }

  if (singles.length === 0 && pairs.length === pairCount - 1) {
    // Phoenix creates a missing pair (fills a rank gap)
    const allRanks = pairs.map(([r]) => r).sort((a, b) => a - b);
    // There should be exactly 1 gap of size 1
    if (allRanks.length !== pairCount - 1) return null;
    const gaps = findGapPositions(allRanks);
    if (gaps.length !== 1 || gaps[0].size !== 1) return null;
    return {
      type: CombinationType.CONSECUTIVE_PAIRS,
      cards,
      rank: allRanks[allRanks.length - 1] > gaps[0].rank ? allRanks[allRanks.length - 1] : gaps[0].rank,
      length: cards.length,
    };
  }

  return null;
}

function findGapPositions(
  sortedRanks: NormalRank[]
): Array<{ rank: NormalRank; size: number }> {
  const gaps: Array<{ rank: NormalRank; size: number }> = [];
  for (let i = 1; i < sortedRanks.length; i++) {
    const diff = sortedRanks[i] - sortedRanks[i - 1];
    if (diff > 1) {
      gaps.push({ rank: (sortedRanks[i - 1] + 1) as NormalRank, size: diff - 1 });
    }
  }
  return gaps;
}

// ─── Comparison ────────────────────────────────────────────────────────

/** Check if `played` can beat `current`. */
export function canBeat(
  current: Combination,
  played: Combination
): boolean {
  // Bombs beat everything except higher bombs
  const currentIsBomb =
    current.type === CombinationType.FOUR_OF_A_KIND_BOMB ||
    current.type === CombinationType.STRAIGHT_FLUSH_BOMB;
  const playedIsBomb =
    played.type === CombinationType.FOUR_OF_A_KIND_BOMB ||
    played.type === CombinationType.STRAIGHT_FLUSH_BOMB;

  if (playedIsBomb && !currentIsBomb) return true;
  if (!playedIsBomb && currentIsBomb) return false;

  if (playedIsBomb && currentIsBomb) {
    // Straight flush bombs beat four-of-a-kind bombs
    if (
      played.type === CombinationType.STRAIGHT_FLUSH_BOMB &&
      current.type === CombinationType.FOUR_OF_A_KIND_BOMB
    ) {
      return true;
    }
    if (
      played.type === CombinationType.FOUR_OF_A_KIND_BOMB &&
      current.type === CombinationType.STRAIGHT_FLUSH_BOMB
    ) {
      return false;
    }
    // Same bomb type: compare by bombPower
    return (played.bombPower ?? 0) > (current.bombPower ?? 0);
  }

  // Non-bomb: must match type and length
  if (played.type !== current.type) return false;
  if (played.length !== current.length) return false;

  return played.rank > current.rank;
}

/** Adjust Phoenix single rank based on the last played single. */
export function getPhoenixSingleRank(lastPlayedRank: number): number {
  // Phoenix is half a rank above the last played, but can never beat Dragon (15)
  if (lastPlayedRank >= 15) return 14.5; // Can't surpass Dragon
  return lastPlayedRank + 0.5;
}

// ─── Hand Analysis ────────────────────────────────────────────────────

/**
 * Find all valid combinations from a hand that can beat the current trick.
 * If currentTrick is null, returns all possible combinations (leading).
 * If a wish is active, filters to combinations containing the wished rank when possible.
 */
export function findPlayableFromHand(
  hand: Card[],
  currentTrickTop: Combination | null,
  wish: { active: boolean; wishedRank: NormalRank | null }
): Card[][] {
  const allCombos = findAllCombinations(hand);

  let playable: Card[][];
  if (currentTrickTop === null) {
    // Leading: any valid combination
    playable = allCombos;
  } else {
    // Must beat the current trick
    playable = allCombos.filter((cards) => {
      const combo = detectCombination(cards);
      return combo !== null && canBeat(currentTrickTop, combo);
    });
  }

  // Wish enforcement: if wish is active and we have playable combos containing wished rank, we must play one of those
  if (wish.active && wish.wishedRank !== null) {
    const withWish = playable.filter((cards) =>
      cards.some(
        (c) => c.type === 'normal' && c.rank === wish.wishedRank
      )
    );
    if (withWish.length > 0) return withWish;
  }

  return playable;
}

/**
 * Check if a player can play at all given the current trick and wish state.
 */
export function canPlayFromHand(
  hand: Card[],
  currentTrickTop: Combination | null,
  wish: { active: boolean; wishedRank: NormalRank | null }
): boolean {
  return findPlayableFromHand(hand, currentTrickTop, wish).length > 0;
}

/**
 * Find all valid combinations that can be formed from a hand.
 * Returns arrays of card arrays (each inner array is a valid combination).
 */
function findAllCombinations(hand: Card[]): Card[][] {
  const results: Card[][] = [];
  const n = hand.length;

  // Singles
  for (const card of hand) {
    results.push([card]);
  }

  if (n < 2) return results;

  const normalCards = hand.filter(isNormalCard);
  const phoenix = hand.find((c) => isSpecial(c, SpecialCardType.PHOENIX));
  const mahjong = hand.find((c) => isSpecial(c, SpecialCardType.MAHJONG));
  const grouped = groupByRank(normalCards);

  // Pairs
  for (const [, cards] of grouped) {
    if (cards.length >= 2) {
      // All pair combinations from this rank
      for (let i = 0; i < cards.length; i++) {
        for (let j = i + 1; j < cards.length; j++) {
          results.push([cards[i], cards[j]]);
        }
      }
    }
    // Phoenix pairs
    if (phoenix) {
      for (const card of cards) {
        results.push([card, phoenix]);
      }
    }
  }
  // Mahjong + Phoenix pair
  if (mahjong && phoenix) {
    results.push([mahjong, phoenix]);
  }

  // Triples
  for (const [, cards] of grouped) {
    if (cards.length >= 3) {
      for (let i = 0; i < cards.length; i++) {
        for (let j = i + 1; j < cards.length; j++) {
          for (let k = j + 1; k < cards.length; k++) {
            results.push([cards[i], cards[j], cards[k]]);
          }
        }
      }
    }
    // Phoenix triples
    if (phoenix && cards.length >= 2) {
      for (let i = 0; i < cards.length; i++) {
        for (let j = i + 1; j < cards.length; j++) {
          results.push([cards[i], cards[j], phoenix]);
        }
      }
    }
  }

  // Four of a kind bombs
  for (const [, cards] of grouped) {
    if (cards.length === 4) {
      results.push([...cards]);
    }
  }

  // Straights, full houses, consecutive pairs, straight flush bombs
  // Use detectCombination to validate subsets of 4+ cards
  // For efficiency, build straights from sorted ranks rather than brute-force subsets
  const sortedRanks = [...grouped.keys()].sort((a, b) => a - b);
  const allRanks = mahjong ? [1 as number, ...sortedRanks] : [...sortedRanks];
  const uniqueAllRanks = [...new Set(allRanks)].sort((a, b) => a - b);

  // Find consecutive runs in available ranks
  findStraights(uniqueAllRanks, grouped, mahjong ?? null, phoenix ?? null, results);
  findConsecutivePairs(sortedRanks, grouped, phoenix ?? null, results);
  findFullHouses(sortedRanks, grouped, phoenix ?? null, results);

  return results;
}

function findStraights(
  availableRanks: number[],
  grouped: Map<NormalRank, NormalCard[]>,
  mahjong: Card | null,
  phoenix: Card | null,
  results: Card[][]
): void {
  const n = availableRanks.length;
  const maxExtra = phoenix ? 1 : 0;

  // Try all consecutive windows of length 5+
  for (let len = 5; len <= Math.min(14, n + maxExtra); len++) {
    for (let start = 0; start <= n - (len - maxExtra); start++) {
      // Try building a straight of `len` starting from availableRanks[start]
      const startRank = availableRanks[start];
      const cards: Card[] = [];
      let gaps = 0;
      let valid = true;

      for (let r = startRank; r < startRank + len; r++) {
        if (r === 1 && mahjong) {
          cards.push(mahjong);
        } else if (grouped.has(r as NormalRank)) {
          cards.push(grouped.get(r as NormalRank)![0]);
        } else {
          gaps++;
          if (gaps > maxExtra) {
            valid = false;
            break;
          }
          if (phoenix) cards.push(phoenix);
        }
      }

      if (valid && cards.length === len) {
        const combo = detectCombination(cards);
        if (combo && (combo.type === CombinationType.STRAIGHT || combo.type === CombinationType.STRAIGHT_FLUSH_BOMB)) {
          results.push(cards);

          // If it's a straight flush, also check non-flush versions with different suit cards
          // But for MVP, one representative combo per rank range is sufficient
        }
      }
    }
  }
}

function findConsecutivePairs(
  sortedRanks: NormalRank[],
  grouped: Map<NormalRank, NormalCard[]>,
  phoenix: Card | null,
  results: Card[][]
): void {
  // Find runs of consecutive ranks where each has at least a pair (or single + phoenix)
  for (let pairCount = 2; pairCount <= Math.floor(sortedRanks.length / 1); pairCount++) {
    for (let i = 0; i <= sortedRanks.length - pairCount; i++) {
      // Check if sortedRanks[i..i+pairCount-1] are consecutive
      const ranks = sortedRanks.slice(i, i + pairCount);
      if (!isConsecutive(ranks)) continue;

      let needPhoenix = false;
      let valid = true;
      const cards: Card[] = [];

      for (const rank of ranks) {
        const group = grouped.get(rank)!;
        if (group.length >= 2) {
          cards.push(group[0], group[1]);
        } else if (group.length === 1 && phoenix && !needPhoenix) {
          cards.push(group[0], phoenix);
          needPhoenix = true;
        } else {
          valid = false;
          break;
        }
      }

      if (valid && cards.length === pairCount * 2) {
        const combo = detectCombination(cards);
        if (combo && combo.type === CombinationType.CONSECUTIVE_PAIRS) {
          results.push(cards);
        }
      }
    }
  }

  // Also try phoenix filling a gap rank (all ranks have pairs but there's a rank gap)
  if (phoenix) {
    for (let pairCount = 2; pairCount <= sortedRanks.length + 1; pairCount++) {
      for (let startRank = NormalRank.TWO; startRank + pairCount - 1 <= NormalRank.ACE; startRank++) {
        let gapCount = 0;
        let valid = true;
        const cards: Card[] = [];

        for (let r = startRank; r < startRank + pairCount; r++) {
          const rank = r as NormalRank;
          const group = grouped.get(rank);
          if (group && group.length >= 2) {
            cards.push(group[0], group[1]);
          } else if (!group && gapCount === 0) {
            // Phoenix fills this entire pair — but phoenix is one card, can't make a pair alone
            // Actually phoenix can only complete a single into a pair, not create a pair from nothing
            // Skip this case
            valid = false;
            break;
          } else {
            valid = false;
            break;
          }
        }

        if (valid && cards.length === pairCount * 2) {
          // Already covered by the non-phoenix case above
        }
      }
    }
  }
}

function findFullHouses(
  sortedRanks: NormalRank[],
  grouped: Map<NormalRank, NormalCard[]>,
  phoenix: Card | null,
  results: Card[][]
): void {
  const ranks = sortedRanks;

  for (let i = 0; i < ranks.length; i++) {
    for (let j = 0; j < ranks.length; j++) {
      if (i === j) continue;
      const tripleRank = ranks[i];
      const pairRank = ranks[j];
      const tripleGroup = grouped.get(tripleRank)!;
      const pairGroup = grouped.get(pairRank)!;

      // Without phoenix: need 3 + 2
      if (tripleGroup.length >= 3 && pairGroup.length >= 2) {
        results.push([
          tripleGroup[0], tripleGroup[1], tripleGroup[2],
          pairGroup[0], pairGroup[1],
        ]);
      }

      // With phoenix
      if (phoenix) {
        // Phoenix completes triple (2+phoenix) + pair (2)
        if (tripleGroup.length >= 2 && pairGroup.length >= 2 && tripleRank !== pairRank) {
          const cards = [
            tripleGroup[0], tripleGroup[1], phoenix,
            pairGroup[0], pairGroup[1],
          ];
          const combo = detectCombination(cards);
          if (combo && combo.type === CombinationType.FULL_HOUSE) {
            results.push(cards);
          }
        }
        // Phoenix completes pair (1+phoenix) + triple (3)
        if (tripleGroup.length >= 3 && pairGroup.length >= 1) {
          const cards = [
            tripleGroup[0], tripleGroup[1], tripleGroup[2],
            pairGroup[0], phoenix,
          ];
          const combo = detectCombination(cards);
          if (combo && combo.type === CombinationType.FULL_HOUSE) {
            results.push(cards);
          }
        }
      }
    }
  }
}
