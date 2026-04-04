import type {
  Card,
  NormalRank,
  PlayerPosition,
  TrickState,
  WishState,
  GameEvent,
} from '@cyprus/shared';
import {
  SpecialCardType,
  NormalRank as NR,
  CombinationType,
  findPlayableFromHand,
  detectCombination,
  isSpecial,
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
      if (!isLeading && Math.random() < 0.3) return null;
      const choice = playable[Math.floor(Math.random() * playable.length)];
      return choice.map((c) => c.id);
    }

    if (isLeading) {
      return this.chooseLead(hand, playable);
    }

    return this.chooseFollow(playable, currentTrick, botPosition);
  }

  private chooseLead(hand: Card[], playable: Card[][]): string[] {
    const singles = playable.filter((c) => c.length === 1);
    const nonDogSingles = singles.filter(
      (c) => !isSpecial(c[0], SpecialCardType.DOG)
    );

    if (this.difficulty === 'hard') {
      // Lead with singletons (ranks with only 1 card) to clear weak cards
      const rankCounts = new Map<number, number>();
      for (const c of hand) {
        const r = getCardSortRank(c);
        rankCounts.set(r, (rankCounts.get(r) || 0) + 1);
      }
      const singletons = nonDogSingles.filter(
        (c) => rankCounts.get(getCardSortRank(c[0])) === 1
      );
      if (singletons.length > 0) {
        singletons.sort(
          (a, b) => getCardSortRank(a[0]) - getCardSortRank(b[0])
        );
        return singletons[0].map((c) => c.id);
      }
    }

    // Play lowest single (not Dog)
    if (nonDogSingles.length > 0) {
      nonDogSingles.sort(
        (a, b) => getCardSortRank(a[0]) - getCardSortRank(b[0])
      );
      return nonDogSingles[0].map((c) => c.id);
    }

    // Play lowest combo
    const sorted = [...playable].sort((a, b) => {
      const ra = detectCombination(a)?.rank ?? 0;
      const rb = detectCombination(b)?.rank ?? 0;
      return ra - rb;
    });
    return sorted[0].map((c) => c.id);
  }

  private chooseFollow(
    playable: Card[][],
    currentTrick: TrickState,
    botPosition: PlayerPosition
  ): string[] | null {
    // Check if partner is currently winning
    const partnerPos = ((botPosition + 2) % 4) as PlayerPosition;
    const partnerWinning = currentTrick.currentWinner === partnerPos;

    // Hard: if partner is winning, consider passing
    if (this.difficulty === 'hard' && partnerWinning && Math.random() < 0.6) {
      return null;
    }

    // Play lowest non-bomb beat
    const sorted = [...playable].sort((a, b) => {
      const ra = detectCombination(a)?.rank ?? 0;
      const rb = detectCombination(b)?.rank ?? 0;
      return ra - rb;
    });

    const nonBombs = sorted.filter((c) => {
      const combo = detectCombination(c);
      return (
        combo?.type !== CombinationType.FOUR_OF_A_KIND_BOMB &&
        combo?.type !== CombinationType.STRAIGHT_FLUSH_BOMB
      );
    });

    return (nonBombs.length > 0 ? nonBombs[0] : sorted[0]).map((c) => c.id);
  }

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
