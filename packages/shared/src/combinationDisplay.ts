import type { Card, Combination } from './types/index.js';
import { CombinationType } from './types/combination.js';
import { NormalRank, SpecialCardType } from './types/card.js';
import { getRankLabel, sortCards } from './cards.js';

function isPhoenix(card: Card): boolean {
  return card.type === 'special' && card.specialType === SpecialCardType.PHOENIX;
}

/** Rank Phoenix stands in for, ignoring the Phoenix itself. Mahjong is 1. */
function naturalRank(card: Card): number {
  if (card.type === 'normal') return card.rank;
  if (card.type === 'special' && card.specialType === SpecialCardType.MAHJONG) return 1;
  return 0;
}

/**
 * Rank label to show on a Phoenix inside a played combination.
 * For a single, pass the previous card's rank so the badge reads half above it.
 */
export function getPhoenixDisplayLabel(combo: Combination, prevRank?: number): string | null {
  const phoenix = combo.cards.find(isPhoenix);
  if (!phoenix) return null;

  if (combo.cards.length === 1 && prevRank !== undefined) {
    return getRankLabel(Math.floor(prevRank) as NormalRank) + '½';
  }
  if (combo.cards.length <= 1) return null;

  const others = combo.cards.filter((c) => c !== phoenix);
  const ranks = others.map(naturalRank);

  if (combo.type === CombinationType.STRAIGHT) {
    const minRank = Math.min(...ranks);
    const maxRank = Math.max(...ranks);
    let phoenixRank = maxRank >= 14 ? minRank - 1 : maxRank + 1;
    for (let r = minRank; r <= maxRank; r++) {
      if (!ranks.includes(r)) {
        phoenixRank = r;
        break;
      }
    }
    if (phoenixRank < 1 || phoenixRank > 14) return null;
    return getRankLabel(phoenixRank as NormalRank);
  }

  if (combo.type === CombinationType.CONSECUTIVE_PAIRS) {
    const rankCounts = new Map<number, number>();
    for (const r of ranks) rankCounts.set(r, (rankCounts.get(r) ?? 0) + 1);
    const minRank = Math.min(...ranks);
    const maxRank = Math.max(...ranks);
    let phoenixRank = maxRank + 1;
    for (let r = minRank; r <= maxRank; r++) {
      if (!rankCounts.has(r)) {
        phoenixRank = r;
        break;
      }
    }
    if (phoenixRank === maxRank + 1) {
      for (const [r, count] of rankCounts) {
        if (count === 1) {
          phoenixRank = r;
          break;
        }
      }
    }
    if (phoenixRank > 14 || phoenixRank < 1) return null;
    return getRankLabel(phoenixRank as NormalRank);
  }

  if (
    combo.type === CombinationType.PAIR ||
    combo.type === CombinationType.TRIPLE ||
    combo.type === CombinationType.FULL_HOUSE
  ) {
    const rankCounts = new Map<number, number>();
    for (const r of ranks) rankCounts.set(r, (rankCounts.get(r) ?? 0) + 1);
    if (combo.type === CombinationType.FULL_HOUSE && rankCounts.size === 2) {
      const [r1, r2] = [...rankCounts.keys()];
      if (rankCounts.get(r1) === 2 && rankCounts.get(r2) === 2) {
        return getRankLabel(Math.max(r1, r2) as NormalRank);
      }
    }
    let minCount = Infinity;
    let phoenixRank = ranks[0];
    for (const [r, count] of rankCounts) {
      if (count < minCount) {
        minCount = count;
        phoenixRank = r;
      }
    }
    return getRankLabel(phoenixRank as NormalRank);
  }

  return null;
}

/** Rank the Phoenix fills so it can be dropped into sorted order. */
function phoenixFillRank(combo: Combination, others: Card[]): number | null {
  const ranks = others.map(naturalRank);
  const minRank = Math.min(...ranks);
  const maxRank = Math.max(...ranks);

  if (combo.type === CombinationType.STRAIGHT) {
    let phoenixRank = maxRank >= 14 ? minRank - 1 : maxRank + 1;
    for (let r = minRank; r <= maxRank; r++) {
      if (!ranks.includes(r)) {
        phoenixRank = r;
        break;
      }
    }
    return phoenixRank;
  }

  if (combo.type === CombinationType.CONSECUTIVE_PAIRS) {
    const rankCounts = new Map<number, number>();
    for (const r of ranks) rankCounts.set(r, (rankCounts.get(r) ?? 0) + 1);
    for (let r = minRank; r <= maxRank; r++) {
      if (!rankCounts.has(r)) return r;
    }
    for (const [r, count] of [...rankCounts.entries()].sort((a, b) => a[0] - b[0])) {
      if (count === 1) return r;
    }
    return maxRank + 1;
  }

  return null;
}

/**
 * Order a played combination the way it should sit on the table.
 * Phoenix is inserted at the rank it is standing in for, not wherever it
 * was clicked.
 */
export function sortCombinationForDisplay(combo: Combination): Card[] {
  if (combo.type === CombinationType.FULL_HOUSE) {
    const phoenix = combo.cards.find(isPhoenix);
    const normalCards = combo.cards.filter((c) => c !== phoenix);
    const rankCounts = new Map<number, Card[]>();
    for (const c of normalCards) {
      const rank = naturalRank(c);
      const group = rankCounts.get(rank) ?? [];
      group.push(c);
      rankCounts.set(rank, group);
    }
    // Phoenix completes the smaller group. Two pairs: it joins the higher pair.
    if (phoenix) {
      const entries = [...rankCounts.entries()];
      const minLen = Math.min(...entries.map(([, g]) => g.length));
      const candidates = entries.filter(([, g]) => g.length === minLen);
      const targetRank = Math.max(...candidates.map(([r]) => r));
      rankCounts.get(targetRank)?.push(phoenix);
    }
    const groups = [...rankCounts.values()].sort((a, b) => b.length - a.length || naturalRank(b[0]) - naturalRank(a[0]));
    return groups.flat();
  }

  const phoenix = combo.cards.find(isPhoenix);
  if (phoenix && combo.cards.length > 1) {
    const others = combo.cards.filter((c) => c !== phoenix);
    const sorted = sortCards(others);

    if (combo.type === CombinationType.STRAIGHT || combo.type === CombinationType.CONSECUTIVE_PAIRS) {
      const phoenixRank = phoenixFillRank(combo, sorted);
      if (phoenixRank === null) return [...sorted, phoenix];
      const insertIdx = sorted.findIndex((c) => naturalRank(c) > phoenixRank);
      if (insertIdx === -1) sorted.push(phoenix);
      else sorted.splice(insertIdx, 0, phoenix);
      return sorted;
    }

    sorted.push(phoenix);
    return sorted;
  }

  return sortCards(combo.cards);
}
