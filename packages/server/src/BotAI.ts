import type {
  Card,
  NormalRank,
  PlayerPosition,
  TrickState,
  WishState,
  Combination,
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
} from '@cyprus/shared';

export type BotDifficulty = 'easy' | 'medium' | 'hard';

export class BotAI {
  constructor(private difficulty: BotDifficulty) {}

  decideGrandTichu(hand: Card[]): boolean {
    if (this.difficulty === 'easy') return false;

    let strength = 0;
    for (const card of hand) {
      if (isSpecial(card, SpecialCardType.DRAGON)) strength += 3;
      if (isSpecial(card, SpecialCardType.PHOENIX)) strength += 2;
      if (card.type === 'normal' && card.rank === NR.ACE) strength += 1.5;
      if (card.type === 'normal' && card.rank === NR.KING) strength += 1;
    }

    return this.difficulty === 'medium' ? strength >= 8 : strength >= 7;
  }

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

    // Medium/Hard: pass low cards to opponents (left/right), decent card to partner (across)
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

  choosePlay(
    hand: Card[],
    currentTrick: TrickState,
    wish: WishState,
    botPosition: PlayerPosition
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

    if (isLeading) {
      return this.chooseLead(hand, playable);
    }

    return this.chooseFollow(hand, playable, currentTrick, botPosition);
  }

  // ─── Easy ────────────────────────────────────────────────────────────

  private choosePlayEasy(playable: Card[][], isLeading: boolean): string[] | null {
    // Easy: random play, sometimes pass
    if (!isLeading && Math.random() < 0.3) return null;
    const choice = playable[Math.floor(Math.random() * playable.length)];
    return choice.map((c) => c.id);
  }

  // ─── Leading ─────────────────────────────────────────────────────────

  private chooseLead(hand: Card[], playable: Card[][]): string[] {
    if (this.difficulty === 'hard') {
      return this.chooseLeadHard(hand, playable);
    }
    return this.chooseLeadMedium(hand, playable);
  }

  private chooseLeadMedium(hand: Card[], playable: Card[][]): string[] {
    // Prefer multi-card combos to clear hand faster, but play low ones
    const multiCard = playable.filter((c) => c.length > 1);
    const singles = playable.filter((c) => c.length === 1);
    const nonSpecialSingles = singles.filter(
      (c) => !isSpecial(c[0], SpecialCardType.DOG) &&
             !isSpecial(c[0], SpecialCardType.DRAGON)
    );

    // 60% chance to lead with a multi-card combo if available
    if (multiCard.length > 0 && Math.random() < 0.6) {
      return this.pickLowestCombo(multiCard);
    }

    // Lead with low single
    if (nonSpecialSingles.length > 0) {
      return this.pickLowestCombo(nonSpecialSingles);
    }

    return this.pickLowestCombo(playable);
  }

  private chooseLeadHard(hand: Card[], playable: Card[][]): string[] {
    // Analyze hand structure to decide what to lead
    const combos = this.categorizeCombos(playable);

    // Priority 1: Lead with multi-card combos that clear isolated groups
    // (e.g., if you have exactly one pair of 4s, lead with it to clear those cards)
    const isolatedMulti = this.findIsolatedMultiCardCombos(hand, combos.multiCard);
    if (isolatedMulti.length > 0) {
      return this.pickLowestCombo(isolatedMulti);
    }

    // Priority 2: Lead with lowest multi-card combo
    if (combos.multiCard.length > 0 && Math.random() < 0.7) {
      return this.pickLowestCombo(combos.multiCard);
    }

    // Priority 3: Lead singletons (cards whose rank appears only once in hand)
    const singletons = this.findSingletonCards(hand, combos.nonSpecialSingles);
    if (singletons.length > 0) {
      return this.pickLowestCombo(singletons);
    }

    // Priority 4: Lead lowest non-power single
    const lowSingles = combos.nonSpecialSingles.filter(
      (c) => getCardSortRank(c[0]) <= NR.TEN
    );
    if (lowSingles.length > 0) {
      return this.pickLowestCombo(lowSingles);
    }

    if (combos.nonSpecialSingles.length > 0) {
      return this.pickLowestCombo(combos.nonSpecialSingles);
    }

    return this.pickLowestCombo(playable);
  }

  // ─── Following ───────────────────────────────────────────────────────

  private chooseFollow(
    hand: Card[],
    playable: Card[][],
    currentTrick: TrickState,
    botPosition: PlayerPosition
  ): string[] | null {
    const partnerPos = ((botPosition + 2) % 4) as PlayerPosition;
    const partnerWinning = currentTrick.currentWinner === partnerPos;
    const trickTop = currentTrick.plays[currentTrick.plays.length - 1].combination;

    // Separate bombs from regular plays
    const { bombs, regular } = this.splitBombs(playable);

    if (this.difficulty === 'medium') {
      return this.chooseFollowMedium(hand, regular, bombs, partnerWinning, trickTop);
    }

    return this.chooseFollowHard(hand, regular, bombs, partnerWinning, trickTop, currentTrick);
  }

  private chooseFollowMedium(
    hand: Card[],
    regular: Card[][],
    bombs: Card[][],
    partnerWinning: boolean,
    trickTop: Combination
  ): string[] | null {
    // If partner is winning, usually pass
    if (partnerWinning && Math.random() < 0.5) return null;

    if (regular.length === 0) {
      // Only have bombs — use them sparingly
      if (this.shouldUseBomb(hand, trickTop, partnerWinning)) {
        return this.pickLowestCombo(bombs);
      }
      return null;
    }

    const sorted = this.sortByRank(regular);
    const lowestBeat = sorted[0];
    const lowestCombo = detectCombination(lowestBeat);

    // If the cheapest beat costs a high card, consider passing
    if (lowestCombo && lowestCombo.rank >= NR.KING && Math.random() < 0.4) {
      return null;
    }

    // If the cheapest beat uses Phoenix/Dragon as single, consider passing
    if (lowestBeat.length === 1 && this.isPowerCard(lowestBeat[0]) && Math.random() < 0.5) {
      return null;
    }

    return lowestBeat.map((c) => c.id);
  }

  private chooseFollowHard(
    hand: Card[],
    regular: Card[][],
    bombs: Card[][],
    partnerWinning: boolean,
    trickTop: Combination,
    currentTrick: TrickState
  ): string[] | null {
    // If partner is winning, almost always pass
    if (partnerWinning && Math.random() < 0.8) return null;

    if (regular.length === 0) {
      if (this.shouldUseBomb(hand, trickTop, partnerWinning)) {
        return this.pickLowestCombo(bombs);
      }
      return null;
    }

    const sorted = this.sortByRank(regular);
    const lowestBeat = sorted[0];
    const lowestCombo = detectCombination(lowestBeat);

    // Estimate trick value — is it worth competing for?
    const trickPoints = this.estimateTrickPoints(currentTrick);

    // If the cheapest beat is expensive (Ace+) and trick has few points, pass
    if (lowestCombo && lowestCombo.rank >= NR.ACE && trickPoints < 10 && Math.random() < 0.6) {
      return null;
    }

    // If cheapest beat is a high card (King+) and trick is low value, consider passing
    if (lowestCombo && lowestCombo.rank >= NR.KING && trickPoints < 5 && Math.random() < 0.4) {
      return null;
    }

    // Don't waste Dragon on low-value tricks
    if (lowestBeat.length === 1 && isSpecial(lowestBeat[0], SpecialCardType.DRAGON)) {
      if (trickPoints < 15) return null;
    }

    // Don't waste Phoenix on low-value single tricks
    if (lowestBeat.length === 1 && isSpecial(lowestBeat[0], SpecialCardType.PHOENIX)) {
      if (trickPoints < 10 && Math.random() < 0.5) return null;
    }

    // If we have few cards left (<= 4), play more aggressively to go out
    if (hand.length <= 4) {
      return lowestBeat.map((c) => c.id);
    }

    return lowestBeat.map((c) => c.id);
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
    // Find combos where the cards don't overlap with other useful combos
    // Simplified: find combos of cards that only appear in one combo type
    const rankCounts = new Map<number, number>();
    for (const c of hand) {
      if (isNormalCard(c)) {
        rankCounts.set(c.rank, (rankCounts.get(c.rank) || 0) + 1);
      }
    }

    // A pair where both cards are the only ones at that rank (exactly 2 of that rank)
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

  private shouldUseBomb(
    hand: Card[],
    trickTop: Combination,
    partnerWinning: boolean
  ): boolean {
    if (partnerWinning) return false;
    // Use bomb if few cards remain (close to going out)
    if (hand.length <= 5) return true;
    // Use bomb on high-point tricks (Dragon, many 10s/Ks)
    return false;
  }

  private isPowerCard(card: Card): boolean {
    return (
      isSpecial(card, SpecialCardType.DRAGON) ||
      isSpecial(card, SpecialCardType.PHOENIX)
    );
  }

  private estimateTrickPoints(currentTrick: TrickState): number {
    let points = 0;
    for (const play of currentTrick.plays) {
      for (const card of play.combination.cards) {
        if (card.type === 'normal') {
          if (card.rank === NR.FIVE) points += 5;
          if (card.rank === NR.TEN || card.rank === NR.KING) points += 10;
        }
        if (isSpecial(card, SpecialCardType.DRAGON)) points += 25;
        if (isSpecial(card, SpecialCardType.PHOENIX)) points -= 25;
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
    // Give to opponent with more cards remaining (less likely to go out)
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

    // Wish for a high rank the bot doesn't have
    const myRanks = new Set<NormalRank>();
    for (const c of hand) {
      if (c.type === 'normal') myRanks.add(c.rank);
    }

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
