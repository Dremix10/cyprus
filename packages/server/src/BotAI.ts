import type {
  Card,
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
  isSpecial,
  isNormalCard,
  getCardSortRank,
  getCardPoints,
} from '@cyprus/shared';

export type BotDifficulty = 'easy' | 'medium' | 'hard';

/** Extra context available for smarter bot decisions. */
export type GameContext = {
  playerCardCounts: Map<PlayerPosition, number>;
  tichuCalls: Record<PlayerPosition, TichuCall>;
  finishOrder: PlayerPosition[];
};

export class BotAI {
  constructor(private difficulty: BotDifficulty) {}

  // ─── Grand Tichu ──────────────────────────────────────────────────────

  decideGrandTichu(hand: Card[]): boolean {
    if (this.difficulty === 'easy') return false;

    if (this.difficulty === 'medium') {
      let strength = 0;
      for (const card of hand) {
        if (isSpecial(card, SpecialCardType.DRAGON)) strength += 3;
        if (isSpecial(card, SpecialCardType.PHOENIX)) strength += 2;
        if (card.type === 'normal' && card.rank === NR.ACE) strength += 1.5;
        if (card.type === 'normal' && card.rank === NR.KING) strength += 1;
      }
      return strength >= 8;
    }

    // Hard: thorough hand analysis
    return this.evaluateGrandTichuHard(hand);
  }

  private evaluateGrandTichuHard(hand: Card[]): boolean {
    let strength = 0;

    const hasDragon = hand.some((c) => isSpecial(c, SpecialCardType.DRAGON));
    const hasPhoenix = hand.some((c) => isSpecial(c, SpecialCardType.PHOENIX));

    if (hasDragon) strength += 3;
    if (hasPhoenix) strength += 2;

    const normalCards = hand.filter(isNormalCard);
    const rankCounts = new Map<number, number>();
    for (const c of normalCards) {
      rankCounts.set(c.rank, (rankCounts.get(c.rank) || 0) + 1);
    }

    // High cards
    for (const c of normalCards) {
      if (c.rank === NR.ACE) strength += 1.5;
      else if (c.rank === NR.KING) strength += 0.8;
      else if (c.rank === NR.QUEEN) strength += 0.3;
    }

    // Bombs (4 of a kind in 8 cards is huge)
    for (const [, count] of rankCounts) {
      if (count >= 4) strength += 3;
      else if (count >= 3) strength += 0.5;
    }

    // Pairs are good (multi-card combos clear hand faster)
    let pairCount = 0;
    for (const [, count] of rankCounts) {
      if (count >= 2) pairCount++;
    }
    if (pairCount >= 3) strength += 1;

    // Consecutive ranks (straight potential)
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

    return strength >= 7;
  }

  // ─── Card Passing ─────────────────────────────────────────────────────

  choosePassCards(
    hand: Card[],
  ): { left: string; across: string; right: string } {
    if (this.difficulty === 'easy') {
      const shuffled = [...hand].sort(() => Math.random() - 0.5);
      return {
        left: shuffled[0].id,
        across: shuffled[1].id,
        right: shuffled[2].id,
      };
    }

    if (this.difficulty === 'medium') {
      return this.passCardsMedium(hand);
    }

    return this.passCardsHard(hand);
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

  private passCardsHard(hand: Card[]): { left: string; across: string; right: string } {
    // Analyze hand structure to find "loose" cards that don't contribute to combos
    const normalCards = hand.filter(isNormalCard);
    const rankCounts = new Map<number, number>();
    for (const c of normalCards) {
      rankCounts.set(c.rank, (rankCounts.get(c.rank) || 0) + 1);
    }

    // Never pass Dragon or Phoenix (too valuable)
    // Never break up a bomb (4 of a kind)
    const bombRanks = new Set<number>();
    for (const [rank, count] of rankCounts) {
      if (count >= 4) bombRanks.add(rank);
    }

    const passable = hand.filter((c) => {
      if (isSpecial(c, SpecialCardType.DRAGON)) return false;
      if (isSpecial(c, SpecialCardType.PHOENIX)) return false;
      if (isNormalCard(c) && bombRanks.has(c.rank)) return false;
      return true;
    });

    // Score each passable card by how "loose" it is (lower = more expendable)
    const scored = passable.map((c) => {
      let value = getCardSortRank(c);

      if (isNormalCard(c)) {
        const count = rankCounts.get(c.rank) || 0;
        // Singletons are more expendable than paired cards
        if (count === 1) value -= 2;
        // Cards in pairs/triples are more valuable (combo potential)
        if (count >= 2) value += 3;
        if (count >= 3) value += 3;

        // Check if this card participates in a consecutive run
        const rank = c.rank;
        const hasNeighbor =
          rankCounts.has(rank - 1) || rankCounts.has(rank + 1);
        if (hasNeighbor) value += 2; // part of a potential straight
      }

      // Dog and Mahjong have special tactical value
      if (isSpecial(c, SpecialCardType.DOG)) value = -1; // very expendable to pass
      if (isSpecial(c, SpecialCardType.MAHJONG)) value = 2; // modest value

      return { card: c, value };
    });

    // Sort by value ascending (most expendable first)
    scored.sort((a, b) => a.value - b.value);

    // To opponents (left, right): pass the two weakest cards
    // To partner (across): pass the best remaining card we can spare, preferring an Ace or high card
    const toLeft = scored[0]?.card.id ?? hand[0].id;
    const toRight = scored[1]?.card.id ?? hand[1].id;

    // For partner, give the highest-value passable card that isn't already chosen
    const forPartner = scored
      .filter((s) => s.card.id !== toLeft && s.card.id !== toRight)
      .sort((a, b) => b.value - a.value);

    const toAcross = forPartner[0]?.card.id ?? hand[2].id;

    return { left: toLeft, across: toAcross, right: toRight };
  }

  // ─── Play Decision ────────────────────────────────────────────────────

  choosePlay(
    hand: Card[],
    currentTrick: TrickState,
    wish: WishState,
    botPosition: PlayerPosition,
    context?: GameContext
  ): string[] | null {
    const isLeading = currentTrick.plays.length === 0;
    const trickTop = isLeading
      ? null
      : currentTrick.plays[currentTrick.plays.length - 1].combination;

    const playable = findPlayableFromHand(hand, trickTop, wish);
    if (playable.length === 0) return null;

    if (this.difficulty === 'easy') {
      return this.choosePlayEasy(playable, isLeading);
    }

    if (this.difficulty === 'medium') {
      if (isLeading) return this.chooseLeadMedium(hand, playable);
      return this.chooseFollowMedium(hand, playable, currentTrick, botPosition);
    }

    // Hard mode: optimal play with full context
    if (isLeading) {
      return this.chooseLeadHard(hand, playable, botPosition, context);
    }
    return this.chooseFollowHard(hand, playable, currentTrick, botPosition, context);
  }

  // ─── Easy ────────────────────────────────────────────────────────────

  private choosePlayEasy(playable: Card[][], isLeading: boolean): string[] | null {
    if (!isLeading && Math.random() < 0.3) return null;
    const choice = playable[Math.floor(Math.random() * playable.length)];
    return choice.map((c) => c.id);
  }

  // ─── Medium Leading ─────────────────────────────────────────────────

  private chooseLeadMedium(hand: Card[], playable: Card[][]): string[] {
    const multiCard = playable.filter((c) => c.length > 1);
    const singles = playable.filter((c) => c.length === 1);
    const nonSpecialSingles = singles.filter(
      (c) => !isSpecial(c[0], SpecialCardType.DOG) &&
             !isSpecial(c[0], SpecialCardType.DRAGON)
    );

    if (multiCard.length > 0 && Math.random() < 0.6) {
      return this.pickLowestCombo(multiCard);
    }

    if (nonSpecialSingles.length > 0) {
      return this.pickLowestCombo(nonSpecialSingles);
    }

    return this.pickLowestCombo(playable);
  }

  // ─── Medium Following ──────────────────────────────────────────────

  private chooseFollowMedium(
    hand: Card[],
    playable: Card[][],
    currentTrick: TrickState,
    botPosition: PlayerPosition
  ): string[] | null {
    const partnerPos = ((botPosition + 2) % 4) as PlayerPosition;
    const partnerWinning = currentTrick.currentWinner === partnerPos;
    const trickTop = currentTrick.plays[currentTrick.plays.length - 1].combination;

    const { bombs, regular } = this.splitBombs(playable);

    if (partnerWinning && Math.random() < 0.5) return null;

    if (regular.length === 0) {
      if (this.shouldUseBombBasic(hand, partnerWinning)) {
        return this.pickLowestCombo(bombs);
      }
      return null;
    }

    const sorted = this.sortByRank(regular);
    const lowestBeat = sorted[0];
    const lowestCombo = detectCombination(lowestBeat);

    if (lowestCombo && lowestCombo.rank >= NR.KING && Math.random() < 0.4) {
      return null;
    }

    if (lowestBeat.length === 1 && isSpecial(lowestBeat[0], SpecialCardType.PHOENIX) && Math.random() < 0.5) {
      return null;
    }

    return lowestBeat.map((c) => c.id);
  }

  // ─── Hard Leading ──────────────────────────────────────────────────

  private chooseLeadHard(
    hand: Card[],
    playable: Card[][],
    botPosition: PlayerPosition,
    context?: GameContext
  ): string[] {
    const combos = this.categorizeCombos(playable);

    // If 1-2 cards left, just play to go out
    if (hand.length <= 2) {
      // Prefer multi-card combos to go out in one play
      const biggest = [...playable].sort((a, b) => b.length - a.length);
      return biggest[0].map((c) => c.id);
    }

    // Dog: play it to give lead to partner if partner has fewer cards
    const dogPlay = combos.singles.find((c) => isSpecial(c[0], SpecialCardType.DOG));
    if (dogPlay && context) {
      const partnerPos = ((botPosition + 2) % 4) as PlayerPosition;
      const partnerCards = context.playerCardCounts.get(partnerPos) ?? 14;
      const partnerOut = context.finishOrder.includes(partnerPos);
      // Play Dog if partner has few cards and isn't already out
      if (!partnerOut && partnerCards <= 5 && partnerCards > 0) {
        return dogPlay.map((c) => c.id);
      }
    }

    // Priority 1: Lead multi-card combos that are "isolated" (clear whole rank groups)
    const isolatedMulti = this.findIsolatedMultiCardCombos(hand, combos.multiCard);
    if (isolatedMulti.length > 0) {
      // Prefer longer combos (straights, full houses clear more cards)
      const longestFirst = [...isolatedMulti].sort((a, b) => b.length - a.length);
      return longestFirst[0].map((c) => c.id);
    }

    // Priority 2: Lead with multi-card combos (longest first to clear hand)
    if (combos.multiCard.length > 0) {
      // Among multi-card combos, prefer ones with more cards, then lowest rank
      const sorted = [...combos.multiCard].sort((a, b) => {
        if (b.length !== a.length) return b.length - a.length;
        const ra = detectCombination(a)?.rank ?? 0;
        const rb = detectCombination(b)?.rank ?? 0;
        return ra - rb;
      });
      return sorted[0].map((c) => c.id);
    }

    // Priority 3: Lead singleton cards (ranks that appear only once in hand)
    const singletons = this.findSingletonCards(hand, combos.nonSpecialSingles);
    if (singletons.length > 0) {
      return this.pickLowestCombo(singletons);
    }

    // Priority 4: Lead lowest non-special single
    if (combos.nonSpecialSingles.length > 0) {
      return this.pickLowestCombo(combos.nonSpecialSingles);
    }

    // Priority 5: Lead Mahjong if we have it (start trick, get wish)
    const mahjongPlay = combos.singles.find((c) => isSpecial(c[0], SpecialCardType.MAHJONG));
    if (mahjongPlay) {
      return mahjongPlay.map((c) => c.id);
    }

    return this.pickLowestCombo(playable);
  }

  // ─── Hard Following ────────────────────────────────────────────────

  private chooseFollowHard(
    hand: Card[],
    playable: Card[][],
    currentTrick: TrickState,
    botPosition: PlayerPosition,
    context?: GameContext
  ): string[] | null {
    const partnerPos = ((botPosition + 2) % 4) as PlayerPosition;
    const partnerWinning = currentTrick.currentWinner === partnerPos;
    const trickTop = currentTrick.plays[currentTrick.plays.length - 1].combination;
    const trickPoints = this.estimateTrickPoints(currentTrick);

    const { bombs, regular } = this.splitBombs(playable);

    // If I have 1-2 cards left, always play to go out
    if (hand.length <= 2 && regular.length > 0) {
      return this.pickLowestCombo(regular);
    }

    // Partner is winning: always pass (don't overplay partner)
    if (partnerWinning) {
      // Exception: play if I can go out (1-2 cards) - already handled above
      // Exception: bomb if opponent called Tichu and is close to going out
      if (context && bombs.length > 0) {
        if (this.shouldBombToPreventOpponentOut(botPosition, context)) {
          return this.pickLowestCombo(bombs);
        }
      }
      return null;
    }

    // No regular plays available — consider bombing
    if (regular.length === 0) {
      if (bombs.length > 0 && this.shouldUseBombHard(hand, trickPoints, botPosition, context)) {
        return this.pickLowestCombo(bombs);
      }
      return null;
    }

    const sorted = this.sortByRank(regular);
    const lowestBeat = sorted[0];

    // If Dragon is our only option for a single, always play it (it always wins)
    if (lowestBeat.length === 1 && isSpecial(lowestBeat[0], SpecialCardType.DRAGON)) {
      return lowestBeat.map((c) => c.id);
    }

    // Smart card selection: prefer "loose" cards over cards in combos
    const bestPlay = this.findBestFollowCard(hand, sorted, trickPoints);
    if (bestPlay) return bestPlay;

    // Don't waste Phoenix on low-value tricks if we have many cards left
    if (lowestBeat.length === 1 && isSpecial(lowestBeat[0], SpecialCardType.PHOENIX)) {
      if (trickPoints < 5 && hand.length > 4) return null;
    }

    // If cheapest beat is very expensive (Ace) and trick has no points, pass
    const lowestCombo = detectCombination(lowestBeat);
    if (lowestCombo && lowestCombo.rank >= NR.ACE && trickPoints <= 0 && hand.length > 4) {
      return null;
    }

    return lowestBeat.map((c) => c.id);
  }

  /** Among available plays, prefer ones that use "loose" cards (singletons, non-combo cards). */
  private findBestFollowCard(hand: Card[], sortedPlays: Card[][], trickPoints: number): string[] | null {
    if (sortedPlays.length <= 1) return null;

    const normalHand = hand.filter(isNormalCard);
    const rankCounts = new Map<number, number>();
    for (const c of normalHand) {
      rankCounts.set(c.rank, (rankCounts.get(c.rank) || 0) + 1);
    }

    // Score each play option: lower is better (prefer expendable cards)
    let bestPlay: Card[] | null = null;
    let bestScore = Infinity;

    for (const play of sortedPlays) {
      let score = 0;
      const combo = detectCombination(play);
      if (!combo) continue;

      // Base: rank cost (higher rank = higher cost)
      score += combo.rank;

      for (const c of play) {
        if (isSpecial(c, SpecialCardType.PHOENIX)) {
          score += 8; // Phoenix is very valuable, avoid using
        } else if (isSpecial(c, SpecialCardType.DRAGON)) {
          // Dragon always wins - it's great value if trick has points
          score += trickPoints >= 5 ? -5 : 5;
        } else if (isNormalCard(c)) {
          const count = rankCounts.get(c.rank) || 0;
          if (count === 1) score -= 3; // singleton — expendable, prefer using
          if (count >= 3) score += 4; // part of triple/bomb — don't break
          if (count === 2) score += 1; // part of pair — mild preference to keep
        }
      }

      if (score < bestScore) {
        bestScore = score;
        bestPlay = play;
      }
    }

    return bestPlay ? bestPlay.map((c) => c.id) : null;
  }

  // ─── Bomb Logic ────────────────────────────────────────────────────

  private shouldUseBombBasic(hand: Card[], partnerWinning: boolean): boolean {
    if (partnerWinning) return false;
    return hand.length <= 5;
  }

  private shouldUseBombHard(
    hand: Card[],
    trickPoints: number,
    botPosition: PlayerPosition,
    context?: GameContext
  ): boolean {
    // Always bomb if close to going out
    if (hand.length <= 5) return true;

    // Bomb high-value tricks (≥ 10 points)
    if (trickPoints >= 10) return true;

    // Bomb to prevent opponent Tichu
    if (context && this.shouldBombToPreventOpponentOut(botPosition, context)) {
      return true;
    }

    return false;
  }

  private shouldBombToPreventOpponentOut(
    botPosition: PlayerPosition,
    context: GameContext
  ): boolean {
    // Check if an opponent called Tichu and has very few cards
    for (const pos of [0, 1, 2, 3] as PlayerPosition[]) {
      if (pos % 2 === botPosition % 2) continue; // skip teammates
      if (context.finishOrder.includes(pos)) continue; // already out
      const call = context.tichuCalls[pos];
      const cards = context.playerCardCounts.get(pos) ?? 14;
      if ((call === 'tichu' || call === 'grand_tichu') && cards <= 3) {
        return true;
      }
    }
    return false;
  }

  // ─── Utility Methods ─────────────────────────────────────────────────

  private categorizeCombos(playable: Card[][]) {
    const singles = playable.filter((c) => c.length === 1);
    const nonSpecialSingles = singles.filter(
      (c) => !isSpecial(c[0], SpecialCardType.DOG) &&
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
        const normalCards = combo.filter(isNormalCard);
        if (normalCards.length === 2 && normalCards[0].rank === normalCards[1].rank) {
          return rankCounts.get(normalCards[0].rank) === 2;
        }
      }
      if (combo.length === 3) {
        const normalCards = combo.filter(isNormalCard);
        if (normalCards.length === 3 && normalCards.every((c) => c.rank === normalCards[0].rank)) {
          return rankCounts.get(normalCards[0].rank) === 3;
        }
      }
      return false;
    });
  }

  private findSingletonCards(hand: Card[], singles: Card[][]): Card[][] {
    const rankCounts = new Map<number, number>();
    for (const c of hand) {
      const r = getCardSortRank(c);
      rankCounts.set(r, (rankCounts.get(r) || 0) + 1);
    }
    return singles.filter(
      (c) => rankCounts.get(getCardSortRank(c[0])) === 1
    );
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

  // ─── Dragon & Wish ───────────────────────────────────────────────────

  chooseDragonGiveTarget(
    opponents: PlayerPosition[],
    playerCardCounts: Map<PlayerPosition, number>
  ): PlayerPosition {
    if (this.difficulty === 'easy') {
      return opponents[Math.floor(Math.random() * opponents.length)];
    }
    // Give to opponent with more cards remaining (less likely to go out soon)
    const sorted = [...opponents].sort(
      (a, b) => (playerCardCounts.get(b) ?? 0) - (playerCardCounts.get(a) ?? 0)
    );
    return sorted[0];
  }

  chooseWish(hand: Card[]): NormalRank {
    if (this.difficulty === 'easy') {
      const ranks = [
        NR.TWO, NR.THREE, NR.FOUR, NR.FIVE, NR.SIX, NR.SEVEN,
        NR.EIGHT, NR.NINE, NR.TEN, NR.JACK, NR.QUEEN, NR.KING, NR.ACE,
      ];
      return ranks[Math.floor(Math.random() * ranks.length)];
    }

    // Wish for a high rank the bot doesn't have — forces opponents to reveal/use strong cards
    const myRanks = new Set<NormalRank>();
    for (const c of hand) {
      if (c.type === 'normal') myRanks.add(c.rank);
    }

    // Hard: prioritize ranks that are most disruptive (Aces first, then Kings)
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

  getDelay(): number {
    switch (this.difficulty) {
      case 'easy':
        return 800 + Math.random() * 700;
      case 'medium':
        return 600 + Math.random() * 600;
      case 'hard':
        return 400 + Math.random() * 500;
    }
  }
}
