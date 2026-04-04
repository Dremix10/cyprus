export enum Suit {
  JADE = 'JADE',
  PAGODA = 'PAGODA',
  STAR = 'STAR',
  SWORD = 'SWORD',
}

export enum NormalRank {
  TWO = 2,
  THREE = 3,
  FOUR = 4,
  FIVE = 5,
  SIX = 6,
  SEVEN = 7,
  EIGHT = 8,
  NINE = 9,
  TEN = 10,
  JACK = 11,
  QUEEN = 12,
  KING = 13,
  ACE = 14,
}

export enum SpecialCardType {
  MAHJONG = 'MAHJONG',
  DOG = 'DOG',
  PHOENIX = 'PHOENIX',
  DRAGON = 'DRAGON',
}

export type NormalCard = {
  type: 'normal';
  suit: Suit;
  rank: NormalRank;
  id: string;
};

export type SpecialCard = {
  type: 'special';
  specialType: SpecialCardType;
  id: string;
};

export type Card = NormalCard | SpecialCard;
