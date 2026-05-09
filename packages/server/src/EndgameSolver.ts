import type {
  Card,
  PlayerPosition,
  TrickState,
  WishState,
} from '@cyprus/shared';
import {
  CombinationType,
  NormalRank as NR,
  SpecialCardType,
  detectCombination,
  findPlayableFromHand,
  getCardPoints,
  getCardSortRank,
  isNormalCard,
  isSpecial,
} from '@cyprus/shared';
import type { GameContext } from './BotAI.js';

export type EndgameSolverFeature = {
  label: string;
  value: number;
};

export type EndgameSolverCandidate = {
  cardIds: string[] | null;
  score: number;
  features: EndgameSolverFeature[];
  rejectedReason: string | null;
};

export type EndgameSolverTrace = {
  cardIds: string[] | null;
  score: number;
  confidence: number;
  reason: string;
  mode: 'partner-tichu-support' | 'opponent-tichu-block' | 'urgent-endgame' | 'self-closeout';
  candidates: EndgameSolverCandidate[];
};

export type EndgameSolverInput = {
  hand: Card[];
  playable: Card[][];
  currentTrick: TrickState;
  wish: WishState;
  botPosition: PlayerPosition;
  context?: GameContext;
};

const ENDGAME_MAX_CARDS = 4;
const DEFAULT_MIN_CONFIDENCE = 0;

function addFeature(features: EndgameSolverFeature[], label: string, value: number): number {
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

function normalRankCounts(cards: Card[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const card of cards) {
    if (isNormalCard(card)) counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  }
  return counts;
}

function breaksBomb(play: Card[], hand: Card[]): boolean {
  const handCounts = normalRankCounts(hand);
  const playCounts = normalRankCounts(play);
  for (const [rank, count] of playCounts) {
    if ((handCounts.get(rank) ?? 0) === 4 && count < 4) return true;
  }
  return false;
}

function breaksMadeSet(play: Card[], hand: Card[]): boolean {
  const handCounts = normalRankCounts(hand);
  const playCounts = normalRankCounts(play);
  for (const [rank, count] of playCounts) {
    const held = handCounts.get(rank) ?? 0;
    if (held >= 2 && count > 0 && count < held) return true;
  }
  return false;
}

function minTurnsToOut(cards: Card[]): number {
  if (cards.length === 0) return 0;
  const plays = findPlayableFromHand(cards, null, { active: false, wishedRank: null });
  if (plays.length === 0) return cards.length;

  let best = cards.length;
  for (const play of plays) {
    const combo = detectCombination(play);
    if (!combo) continue;
    if (breaksBomb(play, cards)) continue;
    best = Math.min(best, 1 + minTurnsToOut(withoutCards(cards, play)));
  }
  return best;
}

function livePartnerCall(botPosition: PlayerPosition, context?: GameContext): 'tichu' | 'grand_tichu' | null {
  if (!context) return null;
  const partner = ((botPosition + 2) % 4) as PlayerPosition;
  if (context.finishOrder.includes(partner)) return null;
  const cards = context.playerCardCounts.get(partner) ?? 14;
  if (cards <= 0) return null;
  const call = context.tichuCalls[partner];
  return call === 'tichu' || call === 'grand_tichu' ? call : null;
}

function liveOpponentCall(botPosition: PlayerPosition, context?: GameContext): 'tichu' | 'grand_tichu' | null {
  if (!context) return null;
  let strongest: 'tichu' | 'grand_tichu' | null = null;
  for (const pos of [0, 1, 2, 3] as PlayerPosition[]) {
    if (pos % 2 === botPosition % 2) continue;
    if (context.finishOrder.includes(pos)) continue;
    const call = context.tichuCalls[pos];
    if (call === 'grand_tichu') return 'grand_tichu';
    if (call === 'tichu') strongest = 'tichu';
  }
  return strongest;
}

function minOpponentCards(botPosition: PlayerPosition, context?: GameContext): number {
  if (!context) return 14;
  let min = 14;
  for (const pos of [0, 1, 2, 3] as PlayerPosition[]) {
    if (pos % 2 === botPosition % 2) continue;
    if (context.finishOrder.includes(pos)) continue;
    min = Math.min(min, context.playerCardCounts.get(pos) ?? 14);
  }
  return min;
}

function passIsLegal(playable: Card[][], currentTrick: TrickState, wish: WishState): boolean {
  if (currentTrick.plays.length === 0) return false;
  if (!wish.active || wish.wishedRank === null) return true;
  return !playable.some((cards) =>
    cards.some((card) => isNormalCard(card) && card.rank === wish.wishedRank)
  );
}

function candidateSummary(features: EndgameSolverFeature[]): string {
  return [...features]
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, 4)
    .map((feature) => `${feature.label} ${feature.value > 0 ? '+' : ''}${feature.value.toFixed(1)}`)
    .join(', ');
}

function chooseMode(
  botPosition: PlayerPosition,
  context: GameContext | undefined,
  partnerCall: 'tichu' | 'grand_tichu' | null,
  opponentCall: 'tichu' | 'grand_tichu' | null,
): EndgameSolverTrace['mode'] {
  if (partnerCall) return 'partner-tichu-support';
  if (opponentCall) return 'opponent-tichu-block';
  if (minOpponentCards(botPosition, context) <= 2) return 'urgent-endgame';
  return 'self-closeout';
}

function scoreCandidate(
  play: Card[] | null,
  input: EndgameSolverInput,
  mode: EndgameSolverTrace['mode'],
  partnerCall: 'tichu' | 'grand_tichu' | null,
  opponentCall: 'tichu' | 'grand_tichu' | null,
): EndgameSolverCandidate {
  const { hand, currentTrick, botPosition, context } = input;
  const features: EndgameSolverFeature[] = [];
  const partner = ((botPosition + 2) % 4) as PlayerPosition;
  const winner = currentTrick.currentWinner;
  const partnerWinning = winner === partner;
  const opponentWinning = winner !== null && winner % 2 !== botPosition % 2;
  const minOppCards = minOpponentCards(botPosition, context);

  if (play === null) {
    let score = 0;
    score += addFeature(features, 'keeps-hand', -8);
    if (partnerWinning) score += addFeature(features, 'partner-winning-pass', partnerCall ? 150 : 45);
    if (opponentWinning) score += addFeature(features, 'opponent-keeps-control', minOppCards <= 2 ? -120 : -45);
    if (opponentCall) score += addFeature(features, 'opponent-tichu-pressure', opponentCall === 'grand_tichu' ? -120 : -70);
    return { cardIds: null, score, features, rejectedReason: null };
  }

  const combo = detectCombination(play);
  if (!combo) {
    return { cardIds: play.map((c) => c.id), score: -Infinity, features, rejectedReason: 'invalid-combo' };
  }
  if (breaksBomb(play, hand)) {
    return { cardIds: play.map((c) => c.id), score: -Infinity, features, rejectedReason: 'breaks-bomb' };
  }

  const remaining = withoutCards(hand, play);
  const immediateOut = remaining.length === 0;
  const remainingTurns = minTurnsToOut(remaining);
  let score = 0;

  score += addFeature(features, 'cards-out', play.length * 18);
  score += addFeature(features, 'remaining-turns', -remainingTurns * 26);
  if (breaksMadeSet(play, hand)) score += addFeature(features, 'breaks-made-set', -55);

  if (combo.type === CombinationType.PAIR) score += addFeature(features, 'pair-closeout', 10);
  if (combo.type === CombinationType.TRIPLE) score += addFeature(features, 'triple-closeout', 18);
  if (combo.type === CombinationType.FOUR_OF_A_KIND_BOMB) score += addFeature(features, 'bomb-closeout', 28);

  if (immediateOut) {
    if (partnerCall) {
      score += addFeature(
        features,
        'blocks-partner-tichu',
        partnerCall === 'grand_tichu' ? -420 : -260,
      );
    } else {
      score += addFeature(features, 'goes-out-now', 145);
    }
  }

  if (partnerCall) {
    if (currentTrick.plays.length === 0) {
      if (play.length === 1 && isSpecial(play[0], SpecialCardType.DOG)) {
        score += addFeature(features, 'dog-to-tichu-partner', 170);
      } else if (play.length === 1 && isNormalCard(play[0]) && play[0].rank <= NR.TEN) {
        score += addFeature(features, 'low-lead-for-partner', 70);
      } else if (play.length > 1) {
        score += addFeature(features, 'hard-for-partner-to-take', -55);
      } else if (getCardSortRank(play[0]) >= NR.KING) {
        score += addFeature(features, 'steals-partner-control', -70);
      }
    }
    if (partnerWinning) score += addFeature(features, 'plays-over-tichu-partner', -180);
  }

  if (opponentWinning) {
    const winnerCards = context?.playerCardCounts.get(winner as PlayerPosition) ?? 14;
    score += addFeature(features, 'takes-from-opponent', winnerCards <= 2 ? 110 : 35);
  }
  if (opponentCall) {
    score += addFeature(features, 'blocks-opponent-tichu', opponentCall === 'grand_tichu' ? 85 : 55);
  }

  if (mode === 'urgent-endgame' && combo.type === CombinationType.SINGLE) {
    const rank = getCardSortRank(play[0]);
    score += addFeature(features, 'control-single', rank >= NR.JACK ? rank * 2.2 : rank * 0.8);
  }

  const points = play.reduce((sum, card) => sum + getCardPoints(card), 0);
  if (points > 0 && !immediateOut) score += addFeature(features, 'point-exposure', -points * 0.3);

  return { cardIds: play.map((c) => c.id), score, features, rejectedReason: null };
}

export function solveEndgameDecision(input: EndgameSolverInput): EndgameSolverTrace | null {
  const { hand, playable, currentTrick, wish, botPosition, context } = input;
  if (hand.length === 0 || hand.length > ENDGAME_MAX_CARDS) return null;

  const decisions: Array<Card[] | null> = [...playable];
  if (passIsLegal(playable, currentTrick, wish)) decisions.push(null);
  if (decisions.length <= 1) return null;

  const partnerCall = livePartnerCall(botPosition, context);
  const opponentCall = liveOpponentCall(botPosition, context);
  const mode = chooseMode(botPosition, context, partnerCall, opponentCall);
  const candidates = decisions.map((decision) => scoreCandidate(decision, input, mode, partnerCall, opponentCall));
  const viable = candidates
    .filter((candidate) => candidate.rejectedReason === null)
    .sort((a, b) => b.score - a.score);
  if (viable.length === 0) return null;

  const best = viable[0];
  const runnerUp = viable[1];
  const confidence = runnerUp ? best.score - runnerUp.score : Infinity;
  if (runnerUp && confidence < DEFAULT_MIN_CONFIDENCE) return null;

  return {
    cardIds: best.cardIds,
    score: best.score,
    confidence,
    reason: candidateSummary(best.features),
    mode,
    candidates,
  };
}
