import type { Card, NormalCard } from './types/card.js';
import { NormalRank, SpecialCardType } from './types/card.js';

/** Get the effective rank of a card for sorting. Specials: Mahjong=1, Dog=0, Phoenix=0.5, Dragon=15 */
export function getCardSortRank(card: Card): number {
  if (card.type === 'normal') return card.rank;
  switch (card.specialType) {
    case SpecialCardType.MAHJONG:
      return 1;
    case SpecialCardType.DOG:
      return 0;
    case SpecialCardType.PHOENIX:
      return 0.5;
    case SpecialCardType.DRAGON:
      return 15;
  }
}

/** Sort cards by rank ascending, specials placed by their effective rank. */
export function sortCards(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => {
    const rankDiff = getCardSortRank(a) - getCardSortRank(b);
    if (rankDiff !== 0) return rankDiff;
    // Same rank: sort by suit for normal cards
    if (a.type === 'normal' && b.type === 'normal') {
      return a.suit.localeCompare(b.suit);
    }
    return 0;
  });
}

/** Check if a card is a normal card. */
export function isNormalCard(card: Card): card is NormalCard {
  return card.type === 'normal';
}

/** Check if a card is a specific special card. */
export function isSpecial(card: Card, type: SpecialCardType): boolean {
  return card.type === 'special' && card.specialType === type;
}

/** Get the point value of a card. */
export function getCardPoints(card: Card): number {
  if (card.type === 'special') {
    if (card.specialType === SpecialCardType.DRAGON) return 25;
    if (card.specialType === SpecialCardType.PHOENIX) return -25;
    return 0;
  }
  if (card.rank === NormalRank.FIVE) return 5;
  if (card.rank === NormalRank.TEN || card.rank === NormalRank.KING) return 10;
  return 0;
}

/** Get the rank label for display (e.g., "J", "Q", "K", "A"). */
export function getRankLabel(rank: NormalRank): string {
  switch (rank) {
    case NormalRank.JACK:
      return 'J';
    case NormalRank.QUEEN:
      return 'Q';
    case NormalRank.KING:
      return 'K';
    case NormalRank.ACE:
      return 'A';
    default:
      return String(rank);
  }
}
