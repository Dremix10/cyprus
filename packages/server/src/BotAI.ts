import type {
  Card,
  NormalCard,
  NormalRank,
  PlayerPosition,
  TrickState,
  WishState,
  Combination,
  TichuCall,
} from '@cyprus/shared';
import {
  SpecialCardType,
  NormalRank as NR,
  CombinationType,
  findPlayableFromHand,
  detectCombination,
  canBeat,
  isSpecial,
  isNormalCard,
  getCardSortRank,
  getCardPoints,
  FULL_DECK,
} from '@cyprus/shared';

export type BotDifficulty = 'easy' | 'medium' | 'hard' | 'extreme' | 'unfair';

/** Extended context for hard mode decisions. */
export type GameContext = {
  playerCardCounts: Map<PlayerPosition, number>;
  tichuCalls: Record<PlayerPosition, TichuCall>;
  finishOrder: PlayerPosition[];
  playedCards: Card[];
  scores: [number, number];
};

export interface BotDecisionRecorder {
  record(branch: string): void;
}

// ─── Hand Analysis ──────────────────────────────────────────────────────

interface HandPlan {
  combos: Card[][];
  turnsToOut: number;
  controlCount: number; // combos that are very likely to win the trick
  hasBomb: boolean;
}

/** Decompose a hand into an estimated optimal set of combos. */
function planHand(hand: Card[]): HandPlan {
  const dragon = hand.find((c) => isSpecial(c, SpecialCardType.DRAGON));
  const dog = hand.find((c) => isSpecial(c, SpecialCardType.DOG));
  const mahjong = hand.find((c) => isSpecial(c, SpecialCardType.MAHJONG));
  const phoenix = hand.find((c) => isSpecial(c, SpecialCardType.PHOENIX));
  const normals = hand.filter(isNormalCard);

  // Group normal cards by rank
  const groups = new Map<number, NormalCard[]>();
  for (const c of normals) {
    if (!groups.has(c.rank)) groups.set(c.rank, []);
    groups.get(c.rank)!.push(c);
  }

  const combos: Card[][] = [];
  let hasBomb = false;

  // 1. Extract 4-of-a-kind bombs (keep as-is, they're powerful control)
  for (const [rank, cards] of groups) {
    if (cards.length === 4) {
      combos.push([...cards]);
      groups.delete(rank);
      hasBomb = true;
    }
  }

  // 2. Find longest straights (5+ cards, greedily)
  const straightCards = extractStraights(groups, mahjong ?? null, phoenix ?? null);
  let phoenixUsedInStraight = false;
  for (const straight of straightCards) {
    combos.push(straight);
    if (phoenix && straight.some((c) => c.id === phoenix.id)) {
      phoenixUsedInStraight = true;
    }
  }

  // 3. Extract triples
  for (const [rank, cards] of groups) {
    if (cards.length >= 3) {
      combos.push(cards.slice(0, 3));
      const remaining = cards.slice(3);
      if (remaining.length > 0) groups.set(rank, remaining);
      else groups.delete(rank);
    }
  }

  // 4. Extract pairs (including phoenix pairs if phoenix wasn't used)
  const unusedPhoenix = phoenix && !phoenixUsedInStraight;
  let phoenixUsedInPair = false;
  for (const [rank, cards] of groups) {
    if (cards.length >= 2) {
      combos.push(cards.slice(0, 2));
      const remaining = cards.slice(2);
      if (remaining.length > 0) groups.set(rank, remaining);
      else groups.delete(rank);
    } else if (cards.length === 1 && unusedPhoenix && !phoenixUsedInPair) {
      // Use phoenix to form a pair with a singleton
      combos.push([cards[0], phoenix!]);
      groups.delete(rank);
      phoenixUsedInPair = true;
    }
  }

  // 5. Remaining singletons
  for (const [, cards] of groups) {
    for (const c of cards) combos.push([c]);
  }

  // Add special cards as singles
  if (dragon) combos.push([dragon]);
  if (dog) combos.push([dog]);
  if (mahjong && !straightCards.some((s) => s.some((c) => c.id === mahjong.id))) {
    combos.push([mahjong]);
  }
  if (phoenix && !phoenixUsedInStraight && !phoenixUsedInPair) {
    combos.push([phoenix]);
  }

  // Count control cards (combos likely to win)
  let controlCount = 0;
  if (dragon) controlCount++;
  for (const combo of combos) {
    const det = detectCombination(combo);
    if (!det) continue;
    if (det.type === CombinationType.FOUR_OF_A_KIND_BOMB ||
        det.type === CombinationType.STRAIGHT_FLUSH_BOMB) {
      controlCount++;
    } else if (det.type === CombinationType.SINGLE && det.rank >= NR.ACE) {
      controlCount++;
    } else if (det.length >= 2 && det.rank >= NR.ACE) {
      controlCount++;
    }
  }

  return { combos, turnsToOut: combos.length, controlCount, hasBomb };
}

/** Greedily extract the longest straights from available rank groups. */
function extractStraights(
  groups: Map<number, NormalCard[]>,
  mahjong: Card | null,
  phoenix: Card | null
): Card[][] {
  const results: Card[][] = [];

  // Build available ranks including mahjong (rank 1)
  const availableRanks = new Set(groups.keys());
  if (mahjong) availableRanks.add(1);

  const sortedRanks = [...availableRanks].sort((a, b) => a - b);
  if (sortedRanks.length < 5) return results;

  // Find the longest consecutive run, allowing one phoenix gap
  let bestStart = -1;
  let bestLen = 0;
  let bestGap = -1;

  for (let i = 0; i < sortedRanks.length; i++) {
    let len = 1;
    let gapPos = -1;

    for (let j = i + 1; j < sortedRanks.length; j++) {
      const expected = sortedRanks[i] + (j - i);
      if (sortedRanks[j] === expected) {
        len++;
      } else if (
        phoenix &&
        gapPos === -1 &&
        sortedRanks[j] === expected + 1
      ) {
        // One gap, fill with phoenix
        gapPos = expected;
        len += 2; // phoenix card + the card after the gap
        // But we need to re-check: the next iteration expects rank after sortedRanks[j]
        // Continue from j
        for (let k = j + 1; k < sortedRanks.length; k++) {
          const exp2 = sortedRanks[j] + (k - j);
          if (sortedRanks[k] === exp2) {
            len++;
          } else {
            break;
          }
        }
        break;
      } else {
        break;
      }
    }

    if (len >= 5 && len > bestLen) {
      bestLen = len;
      bestStart = sortedRanks[i];
      bestGap = gapPos;
    }
  }

  if (bestLen >= 5 && bestStart >= 0) {
    const straight: Card[] = [];
    for (let r = bestStart; r < bestStart + bestLen; r++) {
      if (r === bestGap && phoenix) {
        straight.push(phoenix);
      } else if (r === 1 && mahjong) {
        straight.push(mahjong);
        // Don't remove mahjong from groups (it's not in groups)
      } else if (groups.has(r)) {
        const cards = groups.get(r)!;
        straight.push(cards[0]);
        if (cards.length <= 1) groups.delete(r);
        else groups.set(r, cards.slice(1));
      }
    }
    if (straight.length >= 5) {
      results.push(straight);
    }
  }

  return results;
}

// ─── Card Counting ──────────────────────────────────────────────────────

interface CardCountInfo {
  remainingCards: Card[];       // cards not yet played and not in my hand
  dragonPlayed: boolean;
  phoenixPlayed: boolean;
  acesRemaining: number;       // aces not in my hand and not played
  bombsPossible: boolean;      // could opponents still have a 4-of-a-kind?
}

function analyzePlayedCards(playedCards: Card[], myHand: Card[]): CardCountInfo {
  const knownIds = new Set([
    ...playedCards.map((c) => c.id),
    ...myHand.map((c) => c.id),
  ]);

  const remainingCards = FULL_DECK.filter((c) => !knownIds.has(c.id));

  const dragonPlayed = playedCards.some((c) => isSpecial(c, SpecialCardType.DRAGON)) ||
    myHand.some((c) => isSpecial(c, SpecialCardType.DRAGON));
  const phoenixPlayed = playedCards.some((c) => isSpecial(c, SpecialCardType.PHOENIX)) ||
    myHand.some((c) => isSpecial(c, SpecialCardType.PHOENIX));

  const acesRemaining = remainingCards.filter(
    (c) => isNormalCard(c) && c.rank === NR.ACE
  ).length;

  // Check if any rank has 4 cards still in play (not played and not in my hand)
  const rankCounts = new Map<number, number>();
  for (const c of remainingCards) {
    if (isNormalCard(c)) {
      rankCounts.set(c.rank, (rankCounts.get(c.rank) || 0) + 1);
    }
  }
  const bombsPossible = [...rankCounts.values()].some((count) => count >= 4);

  return {
    remainingCards,
    dragonPlayed: playedCards.some((c) => isSpecial(c, SpecialCardType.DRAGON)),
    phoenixPlayed: playedCards.some((c) => isSpecial(c, SpecialCardType.PHOENIX)),
    acesRemaining,
    bombsPossible,
  };
}

/**
 * Strip lead candidates that waste Aces in multi-card combos.
 *
 * Rule: when leading, don't embed an Ace pair or triple inside a multi-card combo.
 * Aces are most valuable as singles (or as the top of a long straight). Burning three
 * Aces to lead an AAA-99 full house is a classic over-commit — it wins a zero-point
 * trick at the cost of three top-tier defensive cards.
 *
 * - 2+ Aces in any multi-card combo → filter (AA pair, AAA triple, AAA-XX full house,
 *   KK-AA consecutive pairs, 4-of-Aces bomb-as-lead).
 * - 1 Ace in a combo of length ≤ 4 → filter (Phoenix-A pairs, etc.).
 * - 1 Ace in a length ≥ 5 combo → keep (Ace-ending straights are the legitimate use).
 *
 * Falls back to the unfiltered list if filtering would leave no legal play.
 */
function filterAceWasteInLeads(playable: Card[][]): Card[][] {
  const filtered = playable.filter((cards) => {
    if (cards.length <= 1) return true;
    let aceCount = 0;
    for (const c of cards) if (isNormalCard(c) && c.rank === NR.ACE) aceCount++;
    if (aceCount === 0) return true;
    if (aceCount >= 2) return false;
    if (cards.length <= 4) return false;
    return true;
  });
  return filtered.length > 0 ? filtered : playable;
}

/**
 * Strip any play that would break up a 4-of-a-kind in hand.
 *
 * Hard rule, no exceptions: if the hand has all 4 cards of some rank, the only play
 * that's allowed to touch those cards is the bomb itself (using all 4). A play that
 * uses 1-3 of them (e.g. a triple or pair from those 4 cards, or a single) destroys
 * the bomb — one of the strongest assets in the game — for a moderate immediate gain.
 *
 * Falls back to the unfiltered list if filtering would leave no legal play (defensive;
 * shouldn't happen since the bomb itself always survives the filter).
 */
function filterBombPreserving(playable: Card[][], hand: Card[]): Card[][] {
  const handCounts = new Map<number, number>();
  for (const c of hand) {
    if (isNormalCard(c)) handCounts.set(c.rank, (handCounts.get(c.rank) ?? 0) + 1);
  }
  const bombRanks = new Set<number>();
  for (const [rank, count] of handCounts) if (count === 4) bombRanks.add(rank);
  if (bombRanks.size === 0) return playable;

  const filtered = playable.filter((cards) => {
    for (const rank of bombRanks) {
      let used = 0;
      for (const c of cards) if (isNormalCard(c) && c.rank === rank) used++;
      if (used > 0 && used < 4) return false;
    }
    return true;
  });
  return filtered.length > 0 ? filtered : playable;
}

// ─── Bot Config (tunable parameters for hard mode) ─────────────────────

export interface BotConfig {
  // Bombing thresholds
  bombPointThreshold: number;     // bomb tricks worth this many points (default: 15)
  bombEndgameCards: number;       // bomb any trick when hand <= this (default: 5)

  // Leading preferences
  leadDragonAgainstTichu: boolean;  // lead Dragon when opponent called Tichu (default: false — burns the 25-pt Dragon for no benefit)
  leadAcesAgainstTichu: boolean;    // lead Aces when opponent called Tichu (default: true)

  // Dragon usage when following
  dragonFollowMinPoints: number;    // only play Dragon on tricks worth >= this (default: 10)

  // Phoenix usage when following
  phoenixFollowMinRank: number;     // only play Phoenix as single when top card rank >= this (default: 13 = King)
  phoenixFollowMaxCards: number;    // ignore rank check when hand <= this many cards (default: 5)

  // Partner coordination
  dogPlayMaxCards: number;          // play Dog when hand <= this many cards (default: 14 = always)
  dogPlayPartnerCards: number;      // play Dog when partner has <= this many cards (default: 14 = always)

  // Passing strategy
  passAceToPartner: boolean;        // pass an Ace to partner when not holding a bomb (default: true)

  // Experimental heuristic flags (default off — tested via versus-tier-sim)
  scoreAwareTichu: boolean;         // adjust Tichu thresholds based on score differential (default: false)
  opponentCardCountBombing: boolean; // bomb aggressively when opponents have few cards (default: false)
  smartCardTracking: boolean;       // use remaining-card tracker more widely during follow (default: true)

  // Monte Carlo simulation
  useMonteCarlo: boolean;           // use MC simulation for key decisions (default: false)
  mcSims: number;                   // max simulations per decision (default: 200)
  mcTimeMs: number;                 // time budget in ms per decision (default: 150)
}

export const DEFAULT_BOT_CONFIG: BotConfig = {
  bombPointThreshold: 15,
  bombEndgameCards: 5,
  leadDragonAgainstTichu: false,
  leadAcesAgainstTichu: true,
  dragonFollowMinPoints: 10,
  phoenixFollowMinRank: 13,   // King — only play Phoenix as single on King or Ace
  phoenixFollowMaxCards: 5,
  dogPlayMaxCards: 14,
  dogPlayPartnerCards: 14,
  passAceToPartner: true,
  scoreAwareTichu: false,
  opponentCardCountBombing: false,
  smartCardTracking: true,
  useMonteCarlo: false,
  mcSims: 200,
  mcTimeMs: 150,
};

// ─── Bot AI ─────────────────────────────────────────────────────────────

export class BotAI {
  public config: BotConfig;
  public inRollout: boolean = false; // true during MC rollouts (prevents recursion)
  public lastBranch: string | null = null; // most recent branch tag (set by tag())
  private effectiveDifficulty: BotDifficulty;
  private recorder?: BotDecisionRecorder;

  constructor(private difficulty: BotDifficulty, config?: Partial<BotConfig>) {
    this.config = { ...DEFAULT_BOT_CONFIG, ...config };
    // Shift difficulties up: easy→medium logic, medium→hard logic, hard/unfair→hard+MC
    switch (difficulty) {
      case 'easy': this.effectiveDifficulty = 'medium'; break;
      case 'medium': this.effectiveDifficulty = 'hard'; break;
      case 'hard': this.effectiveDifficulty = 'hard'; break;
      case 'extreme': this.effectiveDifficulty = 'hard'; break;
      case 'unfair': this.effectiveDifficulty = 'hard'; break;
    }
  }

  setRecorder(r: BotDecisionRecorder | undefined): void {
    this.recorder = r;
  }

  private tag(branch: string): void {
    this.recorder?.record(branch);
    this.lastBranch = branch;
  }

  // ─── Grand Tichu ────────────────────────────────────────────────────

  decideGrandTichu(hand: Card[]): boolean {
    if (this.effectiveDifficulty === 'easy') return false;

    if (this.effectiveDifficulty === 'medium') {
      let strength = 0;
      for (const card of hand) {
        if (isSpecial(card, SpecialCardType.DRAGON)) strength += 3;
        if (isSpecial(card, SpecialCardType.PHOENIX)) strength += 2;
        if (card.type === 'normal' && card.rank === NR.ACE) strength += 1.5;
        if (card.type === 'normal' && card.rank === NR.KING) strength += 1;
      }
      return strength >= 9;
    }

    // Hard: thorough hand analysis on 8 cards
    return this.evaluateGrandTichuHard(hand);
  }

  private evaluateGrandTichuHard(hand: Card[]): boolean {
    let strength = 0;

    if (hand.some((c) => isSpecial(c, SpecialCardType.DRAGON))) strength += 3;
    if (hand.some((c) => isSpecial(c, SpecialCardType.PHOENIX))) strength += 2;

    const normalCards = hand.filter(isNormalCard);
    const rankCounts = new Map<number, number>();
    for (const c of normalCards) {
      rankCounts.set(c.rank, (rankCounts.get(c.rank) || 0) + 1);
    }

    for (const c of normalCards) {
      if (c.rank === NR.ACE) strength += 1.5;
      else if (c.rank === NR.KING) strength += 0.8;
      else if (c.rank === NR.QUEEN) strength += 0.3;
    }

    for (const [, count] of rankCounts) {
      if (count >= 4) strength += 3;
      else if (count >= 3) strength += 0.5;
    }

    let pairCount = 0;
    for (const [, count] of rankCounts) {
      if (count >= 2) pairCount++;
    }
    if (pairCount >= 3) strength += 1;

    const ranks = [...rankCounts.keys()].sort((a, b) => a - b);
    let maxRun = 1;
    let currentRun = 1;
    for (let i = 1; i < ranks.length; i++) {
      if (ranks[i] === ranks[i - 1] + 1) {
        currentRun++;
        maxRun = Math.max(maxRun, currentRun);
      } else {
        currentRun = 1;
      }
    }
    if (maxRun >= 5) strength += 2;
    else if (maxRun >= 4) strength += 1;

    return strength >= 9;
  }

  // ─── Regular Tichu ──────────────────────────────────────────────────

  decideTichu(hand: Card[], context?: GameContext, botPosition?: PlayerPosition): boolean {
    if (this.effectiveDifficulty === 'easy') return false;

    const plan = planHand(hand);

    // Score-aware adjustment: loosen when behind, tighten when ahead.
    let scoreMode: 'behind' | 'even' | 'ahead' = 'even';
    if (this.config.scoreAwareTichu && context && botPosition !== undefined) {
      const myTeam = botPosition % 2;
      const diff = context.scores[myTeam] - context.scores[1 - myTeam];
      if (diff <= -300) scoreMode = 'behind';
      else if (diff >= 300) scoreMode = 'ahead';
    }

    if (this.effectiveDifficulty === 'medium') {
      if (scoreMode === 'behind') return plan.turnsToOut <= 5 && plan.controlCount >= 3;
      if (scoreMode === 'ahead') return plan.turnsToOut <= 4 && plan.controlCount >= 5;
      return plan.turnsToOut <= 4 && plan.controlCount >= 4;
    }

    const losableTurns = plan.turnsToOut - plan.controlCount;

    if (scoreMode === 'behind') {
      // More aggressive — take the gamble when losing
      if (plan.turnsToOut <= 7 && losableTurns <= 2 && plan.controlCount >= 3) return true;
      if (plan.turnsToOut <= 6 && plan.controlCount >= 3) return true;
      if (plan.turnsToOut <= 5 && plan.controlCount >= 2) return true;
      if (plan.hasBomb && plan.turnsToOut <= 6 && plan.controlCount >= 2) return true;
      return false;
    }

    if (scoreMode === 'ahead') {
      // More conservative — don't risk -100 when winning
      if (plan.turnsToOut <= 5 && losableTurns <= 1 && plan.controlCount >= 5) return true;
      if (plan.turnsToOut <= 4 && plan.controlCount >= 3) return true;
      if (plan.hasBomb && plan.turnsToOut <= 4 && plan.controlCount >= 4) return true;
      return false;
    }

    // Default thresholds
    if (plan.turnsToOut <= 6 && losableTurns <= 1 && plan.controlCount >= 4) return true;
    if (plan.turnsToOut <= 5 && losableTurns <= 2 && plan.controlCount >= 3) return true;
    if (plan.turnsToOut <= 4 && plan.controlCount >= 2) return true;
    if (plan.hasBomb && plan.turnsToOut <= 5 && plan.controlCount >= 3) return true;

    return false;
  }

  // ─── Card Passing ─────────────────────────────────────────────────

  choosePassCards(
    hand: Card[],
    botPosition?: PlayerPosition,
    tichuCalls?: Record<PlayerPosition, TichuCall>,
  ): { left: string; across: string; right: string } {
    if (this.effectiveDifficulty === 'easy') {
      const shuffled = [...hand].sort(() => Math.random() - 0.5);
      return {
        left: shuffled[0].id,
        across: shuffled[1].id,
        right: shuffled[2].id,
      };
    }

    if (this.effectiveDifficulty === 'medium') {
      return this.passCardsMedium(hand);
    }

    return this.passCardsHard(hand, botPosition!, tichuCalls!);
  }

  private passCardsMedium(hand: Card[]): { left: string; across: string; right: string } {
    const sorted = [...hand].sort(
      (a, b) => getCardSortRank(a) - getCardSortRank(b)
    );
    const safe = sorted.filter(
      (c) =>
        !isSpecial(c, SpecialCardType.DRAGON) &&
        !isSpecial(c, SpecialCardType.PHOENIX)
    );

    const toLeft = safe[0]?.id ?? sorted[0].id;
    const toRight =
      safe.find((c) => c.id !== toLeft)?.id ??
      sorted.find((c) => c.id !== toLeft)!.id;
    const remaining = sorted.filter(
      (c) => c.id !== toLeft && c.id !== toRight
    );
    const toAcross = remaining[Math.floor(remaining.length / 2)]?.id ?? sorted[2].id;

    return { left: toLeft, across: toAcross, right: toRight };
  }

  private passCardsHard(
    hand: Card[],
    botPosition: PlayerPosition,
    tichuCalls: Record<PlayerPosition, TichuCall>,
  ): { left: string; across: string; right: string } {
    const normalCards = hand.filter(isNormalCard);
    const rankCounts = new Map<number, number>();
    for (const c of normalCards) {
      rankCounts.set(c.rank, (rankCounts.get(c.rank) || 0) + 1);
    }

    // Relative positions: left = (pos+3)%4, across/partner = (pos+2)%4, right = (pos+1)%4
    const leftPos = ((botPosition + 3) % 4) as PlayerPosition;
    const acrossPos = ((botPosition + 2) % 4) as PlayerPosition; // partner
    const rightPos = ((botPosition + 1) % 4) as PlayerPosition;

    const partnerCalledGrand = tichuCalls[acrossPos] === 'grand_tichu';
    const leftCalledGrand = tichuCalls[leftPos] === 'grand_tichu';
    const rightCalledGrand = tichuCalls[rightPos] === 'grand_tichu';

    const hasDog = hand.some((c) => isSpecial(c, SpecialCardType.DOG));

    // Never pass bomb cards
    const bombRanks = new Set<number>();
    for (const [rank, count] of rankCounts) {
      if (count >= 4) bombRanks.add(rank);
    }

    // If partner called Grand Tichu, pick the best card to pass them:
    // Dragon > Phoenix > highest normal card
    let partnerGift: string | null = null;
    if (partnerCalledGrand) {
      const dragon = hand.find((c) => isSpecial(c, SpecialCardType.DRAGON));
      const phoenix = hand.find((c) => isSpecial(c, SpecialCardType.PHOENIX));
      if (dragon) {
        partnerGift = dragon.id;
      } else if (phoenix) {
        partnerGift = phoenix.id;
      } else {
        // Pass highest normal card (not from a bomb)
        const sortedNormals = normalCards
          .filter((c) => !bombRanks.has(c.rank))
          .sort((a, b) => b.rank - a.rank);
        if (sortedNormals.length > 0) partnerGift = sortedNormals[0].id;
      }
    }

    // Cards passable to opponents (never Dragon, Phoenix, or bomb cards)
    const passable = hand.filter((c) => {
      if (c.id === partnerGift) return false; // reserved for partner
      if (isSpecial(c, SpecialCardType.DRAGON)) return false;
      if (isSpecial(c, SpecialCardType.PHOENIX)) return false;
      if (isNormalCard(c) && bombRanks.has(c.rank)) return false;
      // Keep Dog when partner called Grand Tichu
      if (isSpecial(c, SpecialCardType.DOG) && partnerCalledGrand) return false;
      return true;
    });

    // Score each card: lower = more expendable
    const scored = passable.map((c) => {
      let value = getCardSortRank(c);

      if (isNormalCard(c)) {
        const count = rankCounts.get(c.rank) || 0;
        if (count === 1) value -= 2; // singleton — expendable
        if (count >= 2) value += 3;  // pair/triple — keep
        if (count >= 3) value += 3;

        const rank = c.rank;
        if (rankCounts.has(rank - 1) || rankCounts.has(rank + 1)) {
          value += 2; // part of potential straight
        }
      }

      if (isSpecial(c, SpecialCardType.DOG)) value = -1;
      if (isSpecial(c, SpecialCardType.MAHJONG)) value = 2;

      return { card: c, value };
    });

    scored.sort((a, b) => a.value - b.value);

    // Opponents get weakest cards
    let toLeft = scored[0]?.card.id ?? hand[0].id;
    let toRight = scored[1]?.card.id ?? hand[1].id;

    // Strategy: pass Dog to opponent who called Grand Tichu (disrupts them)
    if (hasDog && !partnerCalledGrand) {
      const dogId = hand.find((c) => isSpecial(c, SpecialCardType.DOG))!.id;
      const dogInPassable = scored.some((s) => s.card.id === dogId);
      if (dogInPassable) {
        if (leftCalledGrand) {
          // Force Dog to left opponent
          toLeft = dogId;
          const otherScored = scored.filter((s) => s.card.id !== dogId);
          toRight = otherScored[0]?.card.id ?? hand[1].id;
        } else if (rightCalledGrand) {
          // Force Dog to right opponent
          toRight = dogId;
          const otherScored = scored.filter((s) => s.card.id !== dogId);
          toLeft = otherScored[0]?.card.id ?? hand[0].id;
        }
      }
    }

    // Partner gets the reserved gift card, or strongest spare
    let toAcross: string;
    if (partnerGift) {
      toAcross = partnerGift;
    } else if (this.config.passAceToPartner && bombRanks.size === 0) {
      // Pass an Ace to partner if we have one (and not keeping it for a bomb)
      const aces = hand.filter((c) =>
        isNormalCard(c) && c.rank === NR.ACE &&
        c.id !== toLeft && c.id !== toRight &&
        !bombRanks.has(c.rank)
      );
      if (aces.length > 0) {
        toAcross = aces[0].id;
      } else {
        const forPartner = scored
          .filter((s) => s.card.id !== toLeft && s.card.id !== toRight)
          .sort((a, b) => b.value - a.value);
        toAcross = forPartner[0]?.card.id ?? hand[2].id;
      }
    } else {
      const forPartner = scored
        .filter((s) => s.card.id !== toLeft && s.card.id !== toRight)
        .sort((a, b) => b.value - a.value);
      toAcross = forPartner[0]?.card.id ?? hand[2].id;
    }

    return { left: toLeft, across: toAcross, right: toRight };
  }

  // ─── Play Decision ────────────────────────────────────────────────

  choosePlay(
    hand: Card[],
    currentTrick: TrickState,
    wish: WishState,
    botPosition: PlayerPosition,
    context?: GameContext,
    mcEvaluate?: (candidates: (Card[] | null)[]) => string[] | null,
  ): string[] | null {
    const isLeading = currentTrick.plays.length === 0;
    const trickTop = isLeading
      ? null
      : currentTrick.plays[currentTrick.plays.length - 1].combination;

    let playable = findPlayableFromHand(hand, trickTop, wish);
    if (playable.length === 0) return null;

    // Hard rule: never break a bomb. Strip any play that uses 1-3 cards of a rank where
    // we hold all 4 — bombs are too valuable to trade for a moderate full house / straight.
    // The bomb itself (all 4 cards) stays as a valid candidate.
    playable = filterBombPreserving(playable, hand);
    if (playable.length === 0) return null;

    // Don't lead Ace pairs/triples embedded in multi-card combos — Aces shine as singles.
    // Only on lead; in follow situations combo-type matching limits the choice anyway.
    if (isLeading) {
      playable = filterAceWasteInLeads(playable);
      if (playable.length === 0) return null;
    }

    if (this.effectiveDifficulty === 'easy') {
      return this.choosePlayEasy(playable, isLeading);
    }

    if (this.effectiveDifficulty === 'medium') {
      if (isLeading) return this.chooseLeadMedium(hand, playable, botPosition, context);
      return this.chooseFollowMedium(hand, playable, currentTrick, botPosition, context);
    }

    // Compute card tracker once — used by MC pre-filter and heuristic fallback
    const cardInfo = context?.playedCards
      ? analyzePlayedCards(context.playedCards, hand)
      : null;

    // Defer to the heuristic when LEADING with partner mid-Tichu/GT. The heuristic has an
    // explicit "lead low for partner" branch; MC's rollouts use generic hard-tier rollout
    // bots that don't reliably support partner Tichu, so MC can pick high singles (e.g. Ace)
    // that block the Tichu caller from winning their own setup tricks.
    const partnerPos = ((botPosition + 2) % 4) as PlayerPosition;
    const partnerHasLiveTichu = !!context && (
      context.tichuCalls[partnerPos] === 'tichu' ||
      context.tichuCalls[partnerPos] === 'grand_tichu'
    ) && !context.finishOrder.includes(partnerPos);

    // Hard mode — try Monte Carlo for both leading and following
    if (
      this.config.useMonteCarlo &&
      !this.inRollout &&
      mcEvaluate &&
      hand.length >= 2 &&
      playable.length >= 2 &&
      !(isLeading && partnerHasLiveTichu)
    ) {
      // Filter wasteful Phoenix-single candidates before handing off to MC.
      // Phoenix as a single becomes rank = topRank + 0.5. If any remaining opponent card can
      // beat that rank (Dragon or a higher normal card), we'll likely lose Phoenix (-25 pts
      // goes to opponents) AND lose our strongest Ace-counter for nothing. MC rollouts can't
      // reliably detect this, so strip the candidate here.
      let filteredPlayable: Card[][] = playable;
      if (!isLeading) {
        const topRank = currentTrick.plays[currentTrick.plays.length - 1]?.combination?.rank ?? 0;
        const oppAboutToOut = context ? this.isOpponentAboutToOut(botPosition, context) : false;
        if (hand.length > this.config.phoenixFollowMaxCards && !oppAboutToOut) {
          const phoenixResultingRank = topRank + 0.5;
          const canBeBeaten = cardInfo
            ? cardInfo.remainingCards.some((c) => {
                if (isSpecial(c, SpecialCardType.DRAGON)) return true;
                if (isNormalCard(c)) return c.rank > phoenixResultingRank;
                return false;
              })
            : topRank < this.config.phoenixFollowMinRank; // fallback heuristic when no tracker
          if (canBeBeaten) {
            const withoutWastedPhoenix = filteredPlayable.filter(
              (cards) => !(cards.length === 1 && isSpecial(cards[0], SpecialCardType.PHOENIX))
            );
            if (withoutWastedPhoenix.length > 0) filteredPlayable = withoutWastedPhoenix;
          }
        }

        // Filter wasteful Dragon-single candidates. Dragon-win rule means we always give the
        // trick pile to an opponent, so playing Dragon on a low-value trick is strictly a loss
        // (−25 pts given + Dragon gone forever). Only makes sense on point-rich tricks or endgame.
        const trickPoints = this.estimateTrickPoints(currentTrick);
        if (hand.length > 3 && !oppAboutToOut && trickPoints < this.config.dragonFollowMinPoints) {
          const withoutWastedDragon = filteredPlayable.filter(
            (cards) => !(cards.length === 1 && isSpecial(cards[0], SpecialCardType.DRAGON))
          );
          if (withoutWastedDragon.length > 0) filteredPlayable = withoutWastedDragon;
        }
      }
      // For follow decisions, include "pass" as a candidate
      const candidates: (Card[] | null)[] = [...filteredPlayable];
      if (!isLeading) candidates.push(null);
      const result = mcEvaluate(candidates);
      if (result !== undefined) return result;
    }

    if (isLeading) {
      return this.chooseLeadHard(hand, playable, botPosition, context, cardInfo);
    }
    return this.chooseFollowHard(hand, playable, currentTrick, botPosition, context, cardInfo);
  }

  // ─── Easy ────────────────────────────────────────────────────────

  private choosePlayEasy(playable: Card[][], isLeading: boolean): string[] | null {
    if (!isLeading && Math.random() < 0.3) return null;
    const choice = playable[Math.floor(Math.random() * playable.length)];
    return choice.map((c) => c.id);
  }

  // ─── Medium Leading ──────────────────────────────────────────────

  private chooseLeadMedium(hand: Card[], playable: Card[][], botPosition?: PlayerPosition, context?: GameContext): string[] {
    // Filter out multi-card combos that waste aces (pairs/trips/full houses of aces)
    const multiCard = playable.filter((c) => c.length > 1).filter((combo) => {
      const aceCount = combo.filter((c) => isNormalCard(c) && c.rank === NR.ACE).length;
      // Don't lead pairs/trips/full houses containing aces (save aces as singles)
      if (aceCount > 0 && combo.length <= 5) return false;
      return true;
    });
    const singles = playable.filter((c) => c.length === 1);
    const nonSpecialSingles = singles.filter(
      (c) =>
        !isSpecial(c[0], SpecialCardType.DOG) &&
        !isSpecial(c[0], SpecialCardType.DRAGON)
    );

    // Counter opponent Tichu: lead high to steal tricks
    if (context && botPosition !== undefined && this.hasOpponentTichuCall(botPosition, context)) {
      const highSingles = nonSpecialSingles.filter(
        (c) => isNormalCard(c[0]) && c[0].rank >= NR.KING
      );
      if (highSingles.length > 0) {
        return this.pickHighestCombo(highSingles);
      }
    }

    if (multiCard.length > 0 && Math.random() < 0.6) {
      return this.pickLowestCombo(multiCard);
    }

    if (nonSpecialSingles.length > 0) {
      return this.pickLowestCombo(nonSpecialSingles);
    }

    return this.pickLowestCombo(playable);
  }

  // ─── Medium Following ────────────────────────────────────────────

  private chooseFollowMedium(
    hand: Card[],
    playable: Card[][],
    currentTrick: TrickState,
    botPosition: PlayerPosition,
    context?: GameContext
  ): string[] | null {
    const partnerPos = ((botPosition + 2) % 4) as PlayerPosition;
    const partnerWinning = currentTrick.currentWinner === partnerPos;

    const { bombs, regular } = this.splitBombs(playable);

    const trickPoints = this.estimateTrickPoints(currentTrick);

    // Bomb if opponent called Tichu and is winning this trick with few cards left
    if (bombs.length > 0 && !partnerWinning && context) {
      const winner = currentTrick.currentWinner;
      if (winner !== null && winner % 2 !== botPosition % 2) {
        const winnerCards = context.playerCardCounts.get(winner) ?? 14;
        const winnerCall = context.tichuCalls[winner];
        if ((winnerCall === 'tichu' || winnerCall === 'grand_tichu') && winnerCards <= 5) {
          return this.pickLowestCombo(bombs);
        }
      }
    }

    // Proactive bombing: bomb high-value tricks even with regular plays available
    if (bombs.length > 0 && !partnerWinning) {
      if (trickPoints >= this.config.bombPointThreshold) {
        return this.pickLowestCombo(bombs);
      }
      if (hand.length <= this.config.bombEndgameCards) {
        return this.pickLowestCombo(bombs);
      }
    }

    // Partner is winning — don't play on top of them
    if (partnerWinning) return null;

    if (regular.length === 0) {
      if (hand.length <= this.config.bombEndgameCards && bombs.length > 0) {
        return this.pickLowestCombo(bombs);
      }
      return null;
    }

    const sorted = this.sortByRank(regular);
    const lowestBeat = sorted[0];
    const lowestCombo = detectCombination(lowestBeat);

    // Only pass on very expensive plays (Ace+) with some randomness — reduced from 40% King pass
    if (lowestCombo && lowestCombo.rank >= NR.ACE && Math.random() < 0.3) {
      return null;
    }

    // Save Phoenix for beating high cards (Queen+) — don't waste on low singles
    if (lowestBeat.length === 1 && isSpecial(lowestBeat[0], SpecialCardType.PHOENIX) && hand.length > 5) {
      const topRank = currentTrick.plays[currentTrick.plays.length - 1]?.combination?.rank ?? 0;
      if (topRank < NR.QUEEN) return null;
    }

    return lowestBeat.map((c) => c.id);
  }

  // ─── Hard Leading ────────────────────────────────────────────────

  private chooseLeadHard(
    hand: Card[],
    playable: Card[][],
    botPosition: PlayerPosition,
    context?: GameContext,
    cardInfo?: CardCountInfo | null
  ): string[] {
    const combos = this.categorizeCombos(playable);
    const plan = planHand(hand);

    // ── Endgame: 1-3 cards left, just go out ──
    if (hand.length <= 3) {
      const biggest = [...playable].sort((a, b) => b.length - a.length);
      this.tag('lead:endgame-dump');
      return biggest[0].map((c) => c.id);
    }

    // ── Team coordination: play Dog to give partner the lead ──
    const dogPlay = combos.singles.find((c) => isSpecial(c[0], SpecialCardType.DOG));
    if (dogPlay && context) {
      const partnerPos = ((botPosition + 2) % 4) as PlayerPosition;
      const partnerCards = context.playerCardCounts.get(partnerPos) ?? 14;
      const partnerOut = context.finishOrder.includes(partnerPos);
      const partnerCalledTichu = context.tichuCalls[partnerPos] === 'tichu' ||
        context.tichuCalls[partnerPos] === 'grand_tichu';

      // Play Dog if partner called Tichu, partner has few cards, or bot is holding it too long
      if (!partnerOut && (partnerCalledTichu || (partnerCards <= this.config.dogPlayPartnerCards && partnerCards > 0) || hand.length <= this.config.dogPlayMaxCards)) {
        this.tag('lead:dog');
        return dogPlay.map((c) => c.id);
      }
    }

    // ── Lead with Mahjong: prefer using it in a straight over leading as singleton ──
    // ── Lead with Mahjong first (it's the lowest card, hardest to get rid of later) ──
    const mahjongPlay = combos.singles.find((c) => isSpecial(c[0], SpecialCardType.MAHJONG));
    if (mahjongPlay) {
      this.tag('lead:mahjong');
      return mahjongPlay.map((c) => c.id);
    }

    // ── Partner called Tichu/GT: lead low to let them beat us and take the lead ──
    // (Earlier this was gated on partnerCards < hand.length, which was backwards — leading
    // low helps the Tichu caller regardless of relative hand sizes. With the gate, the bot
    // would happily lead an Ace when its own hand was small, blocking the partner's run.)
    if (context) {
      const partnerPos2 = ((botPosition + 2) % 4) as PlayerPosition;
      const partnerOut2 = context.finishOrder.includes(partnerPos2);
      const partnerCalledTichu2 = context.tichuCalls[partnerPos2] === 'tichu' ||
        context.tichuCalls[partnerPos2] === 'grand_tichu';

      if (!partnerOut2 && partnerCalledTichu2) {
        if (combos.nonSpecialSingles.length > 0) {
          this.tag('lead:partner-tichu-low');
          return this.pickLowestCombo(combos.nonSpecialSingles);
        }
      }
    }

    // ── Counter opponent Tichu: force a pass or burn, without giving up the Dragon ──
    if (context && this.hasOpponentTichuCall(botPosition, context)) {
      // 1. Lead strong multi-card combos first — much more likely to force a pass
      //    (Tichu caller often can't match a high pair/trip/5+ straight)
      const strongMulti = combos.multiCard.filter((combo) => {
        const c = detectCombination(combo);
        if (!c) return false;
        // Pair of King+, any trip, any 5+ straight, any full house
        if (combo.length === 2 && c.rank >= NR.KING) return true;
        if (combo.length === 3) return true;
        if (combo.length >= 5) return true;
        return false;
      });
      if (strongMulti.length > 0) {
        const sorted = [...strongMulti].sort((a, b) => {
          if (b.length !== a.length) return b.length - a.length;
          return (detectCombination(b)?.rank ?? 0) - (detectCombination(a)?.rank ?? 0);
        });
        this.tag('lead:vs-tichu-multi');
        return sorted[0].map((c) => c.id);
      }
      // 2. Lead Aces as singles — if they burn Dragon, we get the 25pts back (Dragon rule).
      //    Skip if we know nothing remaining can beat Ace (pure waste).
      if (this.config.leadAcesAgainstTichu) {
        const aceSingles = combos.nonSpecialSingles.filter(
          (c) => isNormalCard(c[0]) && c[0].rank === NR.ACE
        );
        if (aceSingles.length > 0 && !this.aceSingleIsUnbeatable(cardInfo)) {
          this.tag('lead:vs-tichu-ace');
          return aceSingles[0].map((c) => c.id);
        }
      }
      // 3. Lead King+ singles to pressure
      const highSingles = combos.nonSpecialSingles.filter(
        (c) => isNormalCard(c[0]) && c[0].rank >= NR.KING
      );
      if (highSingles.length > 0) {
        this.tag('lead:vs-tichu-high');
        return this.pickHighestCombo(highSingles);
      }
      // 4. Legacy Dragon-lead (off by default — Dragon rule gives 25pts to opp for free)
      if (this.config.leadDragonAgainstTichu) {
        const dragonPlay = combos.singles.find((c) => isSpecial(c[0], SpecialCardType.DRAGON));
        if (dragonPlay) {
          this.tag('lead:vs-tichu-dragon');
          return dragonPlay.map((c) => c.id);
        }
      }
    }

    // ── Prefer aces as singles — filter out non-straight combos containing aces ──
    // Matches the choosePlay-level filter (filterAceWasteInLeads): an Ace pair or triple
    // inside any multi-card combo is filtered (covers AAA-XX full houses, KK-AA consecutive
    // pairs, etc.); a single Ace is only allowed in length-5+ combos (Ace-ending straights).
    const noAceCombos = combos.multiCard.filter((combo) => {
      const aceCount = combo.filter((c) => isNormalCard(c) && c.rank === NR.ACE).length;
      if (aceCount === 0) return true;
      if (aceCount >= 2) return false;
      if (combo.length <= 4) return false;
      return true;
    });

    // ── Lead long combos first (hardest to beat) ──
    // Straights of 5+ are very hard to beat
    const longCombos = noAceCombos.filter((c) => c.length >= 5);
    if (longCombos.length > 0) {
      // Lead the longest, lowest-rank one
      const sorted = [...longCombos].sort((a, b) => {
        if (b.length !== a.length) return b.length - a.length;
        return (detectCombination(a)?.rank ?? 0) - (detectCombination(b)?.rank ?? 0);
      });
      this.tag('lead:long-5plus');
      return sorted[0].map((c) => c.id);
    }

    // ── Lead isolated multi-card combos ──
    const isolatedMulti = this.findIsolatedMultiCardCombos(hand, noAceCombos);
    if (isolatedMulti.length > 0) {
      const sorted = [...isolatedMulti].sort((a, b) => b.length - a.length);
      this.tag('lead:isolated-multi');
      return sorted[0].map((c) => c.id);
    }

    // ── Lead multi-card combos (longest first) ──
    if (noAceCombos.length > 0) {
      const sorted = [...noAceCombos].sort((a, b) => {
        if (b.length !== a.length) return b.length - a.length;
        return (detectCombination(a)?.rank ?? 0) - (detectCombination(b)?.rank ?? 0);
      });
      this.tag('lead:multi');
      return sorted[0].map((c) => c.id);
    }

    // ── Lead singleton low cards ──
    let singletons = this.findSingletonCards(hand, combos.nonSpecialSingles);
    // Avoid burning an Ace singleton when nothing remaining can beat it (pure waste)
    if (singletons.length > 1 && this.aceSingleIsUnbeatable(cardInfo)) {
      const nonAce = singletons.filter((p) => !this.isAceSingle(p));
      if (nonAce.length > 0) singletons = nonAce;
    }
    if (singletons.length > 0) {
      this.tag('lead:singleton');
      return this.pickLowestCombo(singletons);
    }

    // ── Lead lowest non-special single ──
    let lowSingles = combos.nonSpecialSingles;
    if (lowSingles.length > 1 && this.aceSingleIsUnbeatable(cardInfo)) {
      const nonAce = lowSingles.filter((p) => !this.isAceSingle(p));
      if (nonAce.length > 0) lowSingles = nonAce;
    }
    if (lowSingles.length > 0) {
      this.tag('lead:low-single');
      return this.pickLowestCombo(lowSingles);
    }

    // ── Lead high single if it's safe (all higher cards played) ──
    if (cardInfo && combos.singles.length > 0) {
      for (const single of this.sortByRank(combos.singles)) {
        if (isSpecial(single[0], SpecialCardType.DOG)) continue;
        if (isSpecial(single[0], SpecialCardType.DRAGON)) continue;
        const rank = getCardSortRank(single[0]);
        // Check if any remaining card could beat this
        const canBeBeat = cardInfo.remainingCards.some((c) => {
          const r = getCardSortRank(c);
          return r > rank;
        });
        if (!canBeBeat) {
          this.tag('lead:safe-high-single');
          return single.map((c) => c.id);
        }
      }
    }

    this.tag('lead:fallback');
    return this.pickLowestCombo(playable);
  }

  // ─── Hard Following ──────────────────────────────────────────────

  private chooseFollowHard(
    hand: Card[],
    playable: Card[][],
    currentTrick: TrickState,
    botPosition: PlayerPosition,
    context?: GameContext,
    cardInfo?: CardCountInfo | null
  ): string[] | null {
    const partnerPos = ((botPosition + 2) % 4) as PlayerPosition;
    const partnerWinning = currentTrick.currentWinner === partnerPos;
    const trickPoints = this.estimateTrickPoints(currentTrick);
    const { bombs, regular } = this.splitBombs(playable);

    // Who led this trick?
    const trickLeader = currentTrick.plays.length > 0
      ? currentTrick.plays[0].playerPosition
      : null;
    const partnerLed = trickLeader === partnerPos;

    // Is there an opponent Tichu/Grand Tichu call we should save bombs for?
    const opponentTichuActive = context ? this.hasOpponentTichuCall(botPosition, context) : false;

    // ── Endgame urgency: play to go out ──
    // Skip if partner is already winning — don't overtake partner, especially if they called Tichu.
    // Exception: if *we* called Tichu/GT, we still need to race out.
    if (hand.length <= 3 && regular.length > 0) {
      const botCalledTichu = !!context && (
        context.tichuCalls[botPosition] === 'tichu' ||
        context.tichuCalls[botPosition] === 'grand_tichu'
      );
      if (!partnerWinning || botCalledTichu) {
        const sorted = this.sortByRank(regular);
        this.tag('follow:endgame-urgency');
        return sorted[0].map((c) => c.id);
      }
    }

    // ── Check if opponent is about to go out ──
    const opponentAboutToOut = context ? this.isOpponentAboutToOut(botPosition, context) : false;

    // ── Bomb opponent Tichu caller who's winning and close to going out ──
    if (bombs.length > 0 && !partnerWinning && context) {
      const winner = currentTrick.currentWinner;
      if (winner !== null && winner % 2 !== botPosition % 2) {
        const winnerCards = context.playerCardCounts.get(winner) ?? 14;
        const winnerCall = context.tichuCalls[winner];
        // Bomb if Tichu caller is winning and has ≤5 cards
        if ((winnerCall === 'tichu' || winnerCall === 'grand_tichu') && winnerCards <= 5) {
          this.tag('follow:bomb-opp-tichu-thin');
          return this.pickLowestCombo(bombs);
        }
      }
    }

    // ── Partner winning ──
    if (partnerWinning) {
      // Bomb only if opponent is about to go out (prevent them)
      if (opponentAboutToOut && bombs.length > 0) {
        this.tag('follow:bomb-block-opp-out');
        return this.pickLowestCombo(bombs);
      }
      // Partner is winning — let them have it
      this.tag('follow:pass-partner-winning');
      return null;
    }

    // ── Proactive bombing: bomb high-value tricks even when regular plays exist ──
    if (bombs.length > 0 && !partnerWinning) {
      // Opponent card-count awareness: bomb aggressively when opponents are thin
      if (this.config.opponentCardCountBombing && context) {
        const minOppCards = this.minOpponentCardCount(botPosition, context);
        // Opponent at 1 card — always bomb
        if (minOppCards <= 1) { this.tag('follow:bomb-opp-1-card'); return this.pickLowestCombo(bombs); }
        // Opponent at ≤2 cards — bomb any trick
        if (minOppCards <= 2) { this.tag('follow:bomb-opp-2-card'); return this.pickLowestCombo(bombs); }
        // Opponent at ≤3 with Tichu call — bomb any trick ≥5 pts
        if (minOppCards <= 3 && opponentTichuActive && trickPoints >= 5) {
          this.tag('follow:bomb-opp-3-tichu');
          return this.pickLowestCombo(bombs);
        }
      }
      // Bomb valuable tricks (15+ points) — worth spending a bomb to steal
      if (trickPoints >= this.config.bombPointThreshold) {
        this.tag('follow:bomb-high-points');
        return this.pickLowestCombo(bombs);
      }
      // Bomb 10+ point tricks if opponent is about to go out or has Tichu
      if (trickPoints >= 10 && (opponentAboutToOut || opponentTichuActive)) {
        this.tag('follow:bomb-10pts-urgent');
        return this.pickLowestCombo(bombs);
      }
      // Bomb any trick if close to going out (use bombs before hand empties)
      if (hand.length <= this.config.bombEndgameCards) {
        this.tag('follow:bomb-endgame-clear');
        return this.pickLowestCombo(bombs);
      }
    }

    // ── Lead-back: partner led but got beaten — play conservatively ──
    if (partnerLed && !partnerWinning) {
      // Partner led, someone beat them. Try to win back with minimal effort.
      // Only pass on truly pointless tricks when we have plenty of cards
      if (trickPoints <= 0 && !opponentAboutToOut && hand.length > 8) {
        if (regular.length > 0) {
          const sorted = this.sortByRank(regular);
          const cheapest = sorted[0];
          const cheapCombo = detectCombination(cheapest);
          // Only pass if cheapest beat costs us an Ace (not King — Kings are worth playing)
          if (cheapCombo && cheapCombo.rank >= NR.ACE) {
            this.tag('follow:pass-leadback-ace-cost');
            return null;
          }
        }
      }
    }

    // ── No regular plays — consider bombing ──
    if (regular.length === 0) {
      if (bombs.length > 0 && this.shouldUseBombHard(hand, trickPoints, opponentAboutToOut, opponentTichuActive, bombs.length)) {
        this.tag('follow:bomb-no-regular');
        return this.pickLowestCombo(bombs);
      }
      this.tag('follow:pass-no-regular');
      return null;
    }

    const sorted = this.sortByRank(regular);

    // ── Smart card selection ──
    const bestPlay = this.findBestFollowCard(hand, sorted, trickPoints, cardInfo);
    if (bestPlay) { this.tag('follow:smart-select'); return bestPlay; }

    // Fallback to lowest beat
    const lowestBeat = sorted[0];
    const lowestCombo = detectCombination(lowestBeat);

    // Dragon wins singles — but only on tricks worth enough points (configurable)
    if (lowestBeat.length === 1 && isSpecial(lowestBeat[0], SpecialCardType.DRAGON) && !partnerWinning) {
      if (trickPoints >= this.config.dragonFollowMinPoints || hand.length <= 3) {
        this.tag('follow:dragon-play');
        return lowestBeat.map((c) => c.id);
      }
      this.tag('follow:pass-dragon-save');
      return null; // pass instead of wasting Dragon on a low-value trick
    }

    // Save Phoenix for beating high cards (King/Ace) — don't waste on low singles.
    // Two reasons to save: (a) Phoenix can still be overtaken (Ace/Dragon/bomb out), in which
    // case we'd lose Phoenix AND lose the trick to whoever overtakes — even when an opponent
    // is "about to go out", they might just take it from us. (b) The trick is low-rank and
    // there's no urgency. Endgame (hand <= phoenixFollowMaxCards) skips this save entirely.
    if (lowestBeat.length === 1 && isSpecial(lowestBeat[0], SpecialCardType.PHOENIX)) {
      if (hand.length > this.config.phoenixFollowMaxCards) {
        const topRank = currentTrick.plays[currentTrick.plays.length - 1]?.combination?.rank ?? 0;
        const phoenixResultingRank = topRank + 0.5;
        const canBeOvertaken = cardInfo
          ? cardInfo.remainingCards.some((c) => {
              if (isSpecial(c, SpecialCardType.DRAGON)) return true;
              if (isNormalCard(c) && c.rank > phoenixResultingRank) return true;
              return false;
            })
          : false;
        if (canBeOvertaken) {
          this.tag('follow:pass-phoenix-save');
          return null;
        }
        if (!opponentAboutToOut && topRank < this.config.phoenixFollowMinRank) {
          this.tag('follow:pass-phoenix-save');
          return null;
        }
      }
    }

    // Pass if cheapest beat is Ace+ on a pointless trick and we have many cards
    if (lowestCombo && lowestCombo.rank >= NR.ACE && trickPoints <= 0 && hand.length > 10) {
      this.tag('follow:pass-ace-pointless');
      return null;
    }

    // If opponent is about to go out, always play (don't let them win tricks)
    if (opponentAboutToOut) {
      this.tag('follow:play-opp-about-out');
      return lowestBeat.map((c) => c.id);
    }

    this.tag('follow:play-lowest-beat');
    return lowestBeat.map((c) => c.id);
  }

  /** Among available plays, prefer ones that use "loose" cards. */
  private findBestFollowCard(
    hand: Card[],
    sortedPlays: Card[][],
    trickPoints: number,
    cardInfo?: CardCountInfo | null
  ): string[] | null {
    if (sortedPlays.length <= 1) return null;

    const normalHand = hand.filter(isNormalCard);
    const rankCounts = new Map<number, number>();
    for (const c of normalHand) {
      rankCounts.set(c.rank, (rankCounts.get(c.rank) || 0) + 1);
    }

    let bestPlay: Card[] | null = null;
    let bestScore = Infinity;

    for (const play of sortedPlays) {
      let score = 0;
      const combo = detectCombination(play);
      if (!combo) continue;

      // Base: rank cost
      score += combo.rank;

      for (const c of play) {
        if (isSpecial(c, SpecialCardType.PHOENIX)) {
          score += 10; // Phoenix is very valuable
        } else if (isSpecial(c, SpecialCardType.DRAGON)) {
          score += trickPoints >= 5 ? -5 : 5;
        } else if (isNormalCard(c)) {
          const count = rankCounts.get(c.rank) || 0;
          if (count === 1) score -= 3;  // singleton — expendable
          if (count >= 3) score += 5;   // part of triple/bomb — protect
          if (count === 2) score += 1;  // part of pair
          // Penalize using aces in multi-card combos (save them as singles)
          if (c.rank === NR.ACE && play.length > 1) score += 8;
        }
      }

      // Bonus: if this card is the highest of its type remaining (safe to play)
      if (cardInfo && play.length === 1 && isNormalCard(play[0])) {
        const rank = play[0].rank;
        const higherExists = cardInfo.remainingCards.some(
          (c) => isNormalCard(c) && c.rank > rank
        );
        if (!higherExists) score -= 5; // this is the top card — safe to play
      }

      // Smart card tracking: extend the "top remaining" bonus to multi-card combos
      // and penalize overkill (playing much higher than needed).
      if (this.config.smartCardTracking && cardInfo) {
        if (play.length >= 2 && combo) {
          // For pairs/trips/etc: is there any remaining rank with enough copies to beat us?
          const needed = play.length === 2 ? 2 : play.length >= 3 ? 3 : 0;
          if (needed > 0) {
            const remainingRankCounts = new Map<number, number>();
            for (const c of cardInfo.remainingCards) {
              if (isNormalCard(c) && c.rank > combo.rank) {
                remainingRankCounts.set(c.rank, (remainingRankCounts.get(c.rank) || 0) + 1);
              }
            }
            const canBeBeaten = [...remainingRankCounts.values()].some((n) => n >= needed);
            // Phoenix can make a pair/trip too (if not yet played)
            const phoenixStillOut = !cardInfo.phoenixPlayed && !play.some(
              (c) => isSpecial(c, SpecialCardType.PHOENIX)
            );
            const phoenixCanHelp = phoenixStillOut && [...remainingRankCounts.values()].some(
              (n) => n >= needed - 1
            );
            if (!canBeBeaten && !phoenixCanHelp) score -= 6; // our combo is the top remaining
          }
        }

        // Penalize "overkill" singles: playing an Ace when a King beats the top.
        if (play.length === 1 && isNormalCard(play[0])) {
          const myRank = play[0].rank;
          // Would a lower rank have sufficed? (Only makes sense if we had lower beats available.)
          const lowerBeats = sortedPlays.filter((p) => {
            const c = detectCombination(p);
            return p.length === 1 && c && c.rank < myRank && c.rank >= 10;
          });
          if (lowerBeats.length > 0 && myRank >= NR.ACE) score += 4;
        }
      }

      if (score < bestScore) {
        bestScore = score;
        bestPlay = play;
      }
    }

    return bestPlay ? bestPlay.map((c) => c.id) : null;
  }

  // ─── Bomb Logic ──────────────────────────────────────────────────

  private shouldUseBombHard(
    hand: Card[],
    trickPoints: number,
    opponentAboutToOut: boolean,
    opponentTichuActive: boolean,
    bombCount: number
  ): boolean {
    // Always bomb if close to going out
    if (hand.length <= 6) return true;
    // Bomb to prevent opponent from going out
    if (opponentAboutToOut) return true;
    // Bomb high-value tricks (≥15 pts — matches the proactive-bomb threshold).
    // Below this, the bomb's strategic worth (defending a 25-pt Dragon trick later,
    // disrupting a Tichu, going out fast in endgame) exceeds the pts we'd win now.
    if (trickPoints >= this.config.bombPointThreshold) return true;

    // Opponent Tichu: bomb more aggressively to deny tricks
    if (opponentTichuActive) {
      // Lower bar (≥10) when there's a Tichu to disrupt
      if (trickPoints >= 10) return true;
      // With multiple bombs we can afford a more speculative one
      if (bombCount >= 2) return true;
      return false;
    }

    return false;
  }

  private hasOpponentTichuCall(botPosition: PlayerPosition, context: GameContext): boolean {
    for (const pos of [0, 1, 2, 3] as PlayerPosition[]) {
      if (pos % 2 === botPosition % 2) continue; // skip teammates
      if (context.finishOrder.includes(pos)) continue; // already out
      const call = context.tichuCalls[pos];
      if (call === 'tichu' || call === 'grand_tichu') return true;
    }
    return false;
  }

  private minOpponentCardCount(botPosition: PlayerPosition, context: GameContext): number {
    let min = 14;
    for (const pos of [0, 1, 2, 3] as PlayerPosition[]) {
      if (pos % 2 === botPosition % 2) continue;
      if (context.finishOrder.includes(pos)) continue;
      const cards = context.playerCardCounts.get(pos) ?? 14;
      if (cards < min) min = cards;
    }
    return min;
  }

  private isOpponentAboutToOut(botPosition: PlayerPosition, context: GameContext): boolean {
    for (const pos of [0, 1, 2, 3] as PlayerPosition[]) {
      if (pos % 2 === botPosition % 2) continue; // skip teammates
      if (context.finishOrder.includes(pos)) continue;
      const cards = context.playerCardCounts.get(pos) ?? 14;
      // Opponent has 1-2 cards: they're about to go out
      if (cards <= 2) return true;
      // Opponent called Tichu and has few cards
      const call = context.tichuCalls[pos];
      if ((call === 'tichu' || call === 'grand_tichu') && cards <= 4) return true;
    }
    return false;
  }

  // ─── Utility Methods ─────────────────────────────────────────────

  private categorizeCombos(playable: Card[][]) {
    const singles = playable.filter((c) => c.length === 1);
    const nonSpecialSingles = singles.filter(
      (c) =>
        !isSpecial(c[0], SpecialCardType.DOG) &&
        !isSpecial(c[0], SpecialCardType.DRAGON)
    );
    const multiCard = playable.filter((c) => c.length > 1);
    return { singles, nonSpecialSingles, multiCard };
  }

  private findIsolatedMultiCardCombos(hand: Card[], multiCard: Card[][]): Card[][] {
    const rankCounts = new Map<number, number>();
    for (const c of hand) {
      if (isNormalCard(c)) {
        rankCounts.set(c.rank, (rankCounts.get(c.rank) || 0) + 1);
      }
    }
    return multiCard.filter((combo) => {
      if (combo.length === 2) {
        const nc = combo.filter(isNormalCard);
        if (nc.length === 2 && nc[0].rank === nc[1].rank) {
          return rankCounts.get(nc[0].rank) === 2;
        }
      }
      if (combo.length === 3) {
        const nc = combo.filter(isNormalCard);
        if (nc.length === 3 && nc.every((c) => c.rank === nc[0].rank)) {
          return rankCounts.get(nc[0].rank) === 3;
        }
      }
      return false;
    });
  }

  // True when no opponent card remaining could beat an Ace single (Dragon and Phoenix both out
  // or in our hand, no bomb material plausibly out). Used to avoid burning an Ace on a 0-point
  // trick where everyone would pass and we'd just lose our strongest single for nothing.
  private aceSingleIsUnbeatable(cardInfo?: CardCountInfo | null): boolean {
    if (!cardInfo) return false;
    const rem = cardInfo.remainingCards;
    const hasDragon = rem.some((c) => isSpecial(c, SpecialCardType.DRAGON));
    const hasPhoenix = rem.some((c) => isSpecial(c, SpecialCardType.PHOENIX));
    if (hasDragon || hasPhoenix) return false;
    // Check any rank with 4 remaining (a bomb that would beat the single)
    const rankCounts = new Map<number, number>();
    for (const c of rem) {
      if (isNormalCard(c)) rankCounts.set(c.rank, (rankCounts.get(c.rank) || 0) + 1);
    }
    for (const count of rankCounts.values()) {
      if (count >= 4) return false;
    }
    return true;
  }

  private isAceSingle(play: Card[]): boolean {
    return play.length === 1 && isNormalCard(play[0]) && play[0].rank === NR.ACE;
  }

  private findSingletonCards(hand: Card[], singles: Card[][]): Card[][] {
    const rankCounts = new Map<number, number>();
    for (const c of hand) {
      const r = getCardSortRank(c);
      rankCounts.set(r, (rankCounts.get(r) || 0) + 1);
    }
    return singles.filter((c) => rankCounts.get(getCardSortRank(c[0])) === 1);
  }

  private splitBombs(playable: Card[][]): { bombs: Card[][]; regular: Card[][] } {
    const bombs: Card[][] = [];
    const regular: Card[][] = [];
    for (const cards of playable) {
      const combo = detectCombination(cards);
      if (
        combo?.type === CombinationType.FOUR_OF_A_KIND_BOMB ||
        combo?.type === CombinationType.STRAIGHT_FLUSH_BOMB
      ) {
        bombs.push(cards);
      } else {
        regular.push(cards);
      }
    }
    return { bombs, regular };
  }

  private estimateTrickPoints(currentTrick: TrickState): number {
    let points = 0;
    for (const play of currentTrick.plays) {
      for (const card of play.combination.cards) {
        points += getCardPoints(card);
      }
    }
    return points;
  }

  private sortByRank(combos: Card[][]): Card[][] {
    return [...combos].sort((a, b) => {
      const ra = detectCombination(a)?.rank ?? 0;
      const rb = detectCombination(b)?.rank ?? 0;
      return ra - rb;
    });
  }

  private pickLowestCombo(combos: Card[][]): string[] {
    const sorted = this.sortByRank(combos);
    return sorted[0].map((c) => c.id);
  }

  private pickHighestCombo(combos: Card[][]): string[] {
    const sorted = this.sortByRank(combos);
    return sorted[sorted.length - 1].map((c) => c.id);
  }

  // ─── Dragon Give ─────────────────────────────────────────────────

  chooseDragonGiveTarget(
    opponents: PlayerPosition[],
    playerCardCounts: Map<PlayerPosition, number>,
    context?: GameContext
  ): PlayerPosition {
    if (this.effectiveDifficulty === 'easy') {
      return opponents[Math.floor(Math.random() * opponents.length)];
    }

    if (this.effectiveDifficulty === 'hard' && context) {
      // Give to opponent who benefits LEAST from the +25 points
      // Prefer giving to the opponent with more cards (further from going out)
      // But also consider: if one opponent's team is ahead, give to the other
      const scored = opponents.map((pos) => {
        let score = 0;
        const cards = playerCardCounts.get(pos) ?? 0;
        score += cards * 10; // more cards = better target (further from going out)

        // If opponent called Tichu, DON'T give them Dragon (helps their trick points)
        const call = context.tichuCalls[pos];
        if (call === 'tichu' || call === 'grand_tichu') {
          score -= 100;
        }

        return { pos, score };
      });

      scored.sort((a, b) => b.score - a.score);
      return scored[0].pos;
    }

    // Medium: give to opponent with more cards
    const sorted = [...opponents].sort(
      (a, b) => (playerCardCounts.get(b) ?? 0) - (playerCardCounts.get(a) ?? 0)
    );
    return sorted[0];
  }

  // ─── Wish ────────────────────────────────────────────────────────

  chooseWish(hand: Card[], context?: GameContext): NormalRank {
    if (this.effectiveDifficulty === 'easy') {
      const ranks = [
        NR.TWO, NR.THREE, NR.FOUR, NR.FIVE, NR.SIX, NR.SEVEN,
        NR.EIGHT, NR.NINE, NR.TEN, NR.JACK, NR.QUEEN, NR.KING, NR.ACE,
      ];
      return ranks[Math.floor(Math.random() * ranks.length)];
    }

    const myRanks = new Set<NormalRank>();
    for (const c of hand) {
      if (c.type === 'normal') myRanks.add(c.rank);
    }

    // Wish for high ranks we DON'T have (forces opponents to use strong cards)
    const candidates = [
      NR.ACE, NR.KING, NR.QUEEN, NR.JACK, NR.TEN,
      NR.NINE, NR.EIGHT, NR.SEVEN, NR.SIX, NR.FIVE,
      NR.FOUR, NR.THREE, NR.TWO,
    ];

    for (const r of candidates) {
      if (!myRanks.has(r)) return r;
    }
    return NR.ACE;
  }

  getDelay(humanIsOut = false): number {
    let base: number;
    switch (this.difficulty) {
      case 'easy':
        base = 800 + Math.random() * 700;
        break;
      case 'medium':
        base = 600 + Math.random() * 600;
        break;
      case 'hard':
        base = 400 + Math.random() * 500;
        break;
      case 'extreme':
        base = 450 + Math.random() * 550;
        break;
      case 'unfair':
        base = 500 + Math.random() * 600;
        break;
    }
    // Slow down so the human can follow the action after they're out
    return humanIsOut ? base + 1500 : base;
  }
}
