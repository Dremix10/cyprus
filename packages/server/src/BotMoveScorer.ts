import type { Card, PlayerPosition } from '@cyprus/shared';
import {
  CombinationType,
  NormalRank as NR,
  SpecialCardType,
  detectCombination,
  getCardPoints,
  getCardSortRank,
  isNormalCard,
  isSpecial,
} from '@cyprus/shared';
import type { GameContext } from './BotAI.js';

export type LeadScoreFeature = {
  label: string;
  value: number;
};

export type LeadCandidateScore = {
  cards: Card[];
  cardIds: string[];
  score: number;
  features: LeadScoreFeature[];
  rejectedReason: string | null;
};

export type LeadScoreTrace = {
  cards: Card[];
  cardIds: string[];
  score: number;
  confidence: number;
  reason: string;
  candidates: LeadCandidateScore[];
};

export type LeadScoreOptions = {
  minConfidence?: number;
};

const DEFAULT_MIN_CONFIDENCE = 8;

function addFeature(features: LeadScoreFeature[], label: string, value: number): number {
  if (value !== 0) features.push({ label, value });
  return value;
}

function withoutCards(hand: Card[], played: Card[]): Card[] {
  const remainingIds = played.map((c) => c.id);
  return hand.filter((card) => {
    const idx = remainingIds.indexOf(card.id);
    if (idx === -1) return true;
    remainingIds.splice(idx, 1);
    return false;
  });
}

function normalRankCounts(hand: Card[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const card of hand) {
    if (isNormalCard(card)) counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  }
  return counts;
}

function breaksBomb(play: Card[], hand: Card[]): boolean {
  const counts = normalRankCounts(hand);
  for (const card of play) {
    if (!isNormalCard(card)) continue;
    if ((counts.get(card.rank) ?? 0) === 4 && play.filter((c) => isNormalCard(c) && c.rank === card.rank).length < 4) {
      return true;
    }
  }
  return false;
}

function breaksMadeSet(play: Card[], hand: Card[]): boolean {
  const handCounts = normalRankCounts(hand);
  const playCounts = normalRankCounts(play);
  for (const [rank, used] of playCounts) {
    const held = handCounts.get(rank) ?? 0;
    if (held >= 2 && used > 0 && used < held) return true;
  }
  return false;
}

function minOpponentCardCount(botPosition: PlayerPosition, context?: GameContext): number {
  if (!context) return 14;
  let min = 14;
  for (const pos of [0, 1, 2, 3] as PlayerPosition[]) {
    if (pos % 2 === botPosition % 2) continue;
    if (context.finishOrder.includes(pos)) continue;
    const cards = context.playerCardCounts.get(pos) ?? 14;
    if (cards < min) min = cards;
  }
  return min;
}

function opponentTichuPressure(botPosition: PlayerPosition, context?: GameContext): boolean {
  if (!context) return false;
  for (const pos of [0, 1, 2, 3] as PlayerPosition[]) {
    if (pos % 2 === botPosition % 2) continue;
    if (context.finishOrder.includes(pos)) continue;
    const call = context.tichuCalls[pos];
    const cards = context.playerCardCounts.get(pos) ?? 14;
    if ((call === 'tichu' || call === 'grand_tichu') && cards <= 5) return true;
  }
  return false;
}

function remainingShapeScore(remaining: Card[]): number {
  const counts = normalRankCounts(remaining);
  let score = 0;
  for (const count of counts.values()) {
    if (count === 1) score -= 2;
    if (count === 2) score += 5;
    if (count === 3) score += 12;
    if (count === 4) score += 28;
  }
  return score;
}

function featureSummary(features: LeadScoreFeature[]): string {
  return [...features]
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, 3)
    .map((f) => `${f.label} ${f.value > 0 ? '+' : ''}${f.value.toFixed(1)}`)
    .join(', ');
}

function scoreLeadCandidate(
  hand: Card[],
  play: Card[],
  botPosition: PlayerPosition,
  context?: GameContext,
): LeadCandidateScore {
  const combo = detectCombination(play);
  const features: LeadScoreFeature[] = [];
  const cardIds = play.map((c) => c.id);

  if (!combo) {
    return { cards: play, cardIds, score: -Infinity, features, rejectedReason: 'invalid-combo' };
  }
  if (
    combo.type === CombinationType.FOUR_OF_A_KIND_BOMB ||
    combo.type === CombinationType.STRAIGHT_FLUSH_BOMB
  ) {
    return { cards: play, cardIds, score: -Infinity, features, rejectedReason: 'bomb-guardrail' };
  }
  if (breaksBomb(play, hand)) {
    return { cards: play, cardIds, score: -Infinity, features, rejectedReason: 'breaks-bomb' };
  }

  let score = 0;
  const minOppCards = minOpponentCardCount(botPosition, context);
  const pressure = minOppCards <= 2 ? 1 : (minOppCards <= 4 || opponentTichuPressure(botPosition, context) ? 0.55 : 0);
  const remaining = withoutCards(hand, play);
  const hasPhoenix = play.some((c) => isSpecial(c, SpecialCardType.PHOENIX));
  const highNormals = play.filter((c) => isNormalCard(c) && c.rank >= NR.KING).length;
  const hasAce = play.some((c) => isNormalCard(c) && c.rank === NR.ACE);

  if (
    pressure === 0 &&
    play.length > 1 &&
    (hasPhoenix || (hasAce && highNormals >= 2) || highNormals >= 3)
  ) {
    return { cards: play, cardIds, score: -Infinity, features, rejectedReason: 'high-resource-waste' };
  }

  score += addFeature(features, 'cards-out', play.length * 12);
  score += addFeature(features, 'remaining-shape', remainingShapeScore(remaining));

  if (combo.type === CombinationType.PAIR) score += addFeature(features, 'made-pair', 9);
  if (combo.type === CombinationType.TRIPLE) score += addFeature(features, 'made-triple', 15);
  if (combo.type === CombinationType.FULL_HOUSE) score += addFeature(features, 'full-house', 18);
  if (combo.type === CombinationType.STRAIGHT) score += addFeature(features, 'straight', 14 + play.length);
  if (combo.type === CombinationType.CONSECUTIVE_PAIRS) score += addFeature(features, 'consecutive-pairs', 18 + play.length);

  if (breaksMadeSet(play, hand)) {
    score += addFeature(features, 'breaks-made-set', -42);
  }

  const aceCount = play.filter((c) => isNormalCard(c) && c.rank === NR.ACE).length;
  if (aceCount > 0 && play.length <= 4) {
    score += addFeature(features, 'ace-resource-waste', -18 * aceCount);
  }

  const specialPenalty = play.reduce((sum, card) => {
    if (isSpecial(card, SpecialCardType.DOG)) return sum - 50;
    if (isSpecial(card, SpecialCardType.MAHJONG)) return sum - 30;
    if (isSpecial(card, SpecialCardType.PHOENIX)) return sum - 18;
    if (isSpecial(card, SpecialCardType.DRAGON)) return sum - 12;
    return sum;
  }, 0);
  score += addFeature(features, 'special-resource', specialPenalty);

  if (combo.type === CombinationType.SINGLE) {
    const rank = getCardSortRank(play[0]);
    const normalSingleton = isNormalCard(play[0]);
    score += addFeature(features, 'single-cost', -rank * (pressure > 0 ? 0.15 : 0.8));
    if (normalSingleton && pressure > 0) {
      score += addFeature(features, 'endgame-control', rank * 1.7 * pressure);
      if (rank >= NR.JACK) score += addFeature(features, 'high-control-single', 7 * pressure);
      if (rank === NR.ACE) score += addFeature(features, 'ace-control', 8 * pressure);
    }
  } else {
    score += addFeature(features, 'combo-rank-cost', -combo.rank * 0.25);
  }

  const points = play.reduce((sum, card) => sum + getCardPoints(card), 0);
  if (points > 0 && pressure === 0) {
    score += addFeature(features, 'point-exposure', -points * 0.2);
  }

  return { cards: play, cardIds, score, features, rejectedReason: null };
}

export function scoreLeadCandidates(
  hand: Card[],
  playable: Card[][],
  botPosition: PlayerPosition,
  context?: GameContext,
  options: LeadScoreOptions = {},
): LeadScoreTrace | null {
  const candidates = playable.map((play) => scoreLeadCandidate(hand, play, botPosition, context));
  const viable = candidates
    .filter((candidate) => candidate.rejectedReason === null)
    .sort((a, b) => b.score - a.score);
  if (viable.length === 0) return null;

  const best = viable[0];
  const runnerUp = viable[1];
  const confidence = runnerUp ? best.score - runnerUp.score : Infinity;
  const minConfidence = options.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  if (runnerUp && confidence < minConfidence) return null;

  return {
    cards: best.cards,
    cardIds: best.cardIds,
    score: best.score,
    confidence,
    reason: featureSummary(best.features),
    candidates,
  };
}
