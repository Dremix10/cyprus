import { describe, expect, it } from 'vitest';
import { BotAI, type GameContext } from '../BotAI.js';
import {
  CombinationType,
  NormalRank,
  SpecialCardType,
  Suit,
  type Card,
  type NormalCard,
  type PlayerPosition,
  type SpecialCard,
  type TichuCall,
  type TrickState,
  type WishState,
} from '@cyprus/shared';

function nc(suit: Suit, rank: NormalRank): NormalCard {
  return { type: 'normal', suit, rank, id: `${suit}_${rank}` };
}

function sc(specialType: SpecialCardType): SpecialCard {
  return { type: 'special', specialType, id: specialType };
}

const emptyTrick: TrickState = {
  plays: [],
  currentWinner: null,
  passCount: 0,
  passedPlayers: [],
};

const inactiveWish: WishState = {
  active: false,
  wishedRank: null,
  wishedBy: null,
};

const wishForTwo: WishState = {
  active: true,
  wishedRank: NormalRank.TWO,
  wishedBy: 0,
};

function singleRank(card: Card): number {
  if (card.type === 'normal') return card.rank;
  if (card.specialType === SpecialCardType.MAHJONG) return 1;
  if (card.specialType === SpecialCardType.PHOENIX) return 1.5;
  if (card.specialType === SpecialCardType.DRAGON) return 15;
  return 0;
}

function singleTrick(position: PlayerPosition, card: Card): TrickState {
  return {
    plays: [
      {
        playerPosition: position,
        combination: {
          type: CombinationType.SINGLE,
          cards: [card],
          rank: singleRank(card),
          length: 1,
        },
      },
    ],
    currentWinner: position,
    passCount: 0,
    passedPlayers: [],
  };
}

function report28Context(): GameContext {
  return {
    playerCardCounts: new Map<PlayerPosition, number>([
      [0, 14],
      [1, 8],
      [2, 8],
      [3, 14],
    ]),
    tichuCalls: {
      0: 'tichu',
      1: 'grand_tichu',
      2: 'none',
      3: 'none',
    } as Record<PlayerPosition, TichuCall>,
    finishOrder: [],
    playedCards: [],
    scores: [435, 365],
  };
}

function report26Context(partnerOut: boolean): GameContext {
  return {
    playerCardCounts: new Map<PlayerPosition, number>([
      [0, partnerOut ? 0 : 1],
      [1, 0],
      [2, 2],
      [3, 7],
    ]),
    tichuCalls: {
      0: 'none',
      1: 'none',
      2: 'none',
      3: 'none',
    } as Record<PlayerPosition, TichuCall>,
    finishOrder: partnerOut ? [1, 0] : [1],
    playedCards: [],
    scores: [55, 45],
  };
}

function report25Context(): GameContext {
  return {
    playerCardCounts: new Map<PlayerPosition, number>([
      [0, 6],
      [1, 0],
      [2, 2],
      [3, 10],
    ]),
    tichuCalls: {
      0: 'none',
      1: 'none',
      2: 'none',
      3: 'none',
    } as Record<PlayerPosition, TichuCall>,
    finishOrder: [1],
    playedCards: [],
    scores: [55, 45],
  };
}

function report24Context(): GameContext {
  return {
    playerCardCounts: new Map<PlayerPosition, number>([
      [0, 13],
      [1, 9],
      [2, 14],
      [3, 9],
    ]),
    tichuCalls: {
      0: 'none',
      1: 'none',
      2: 'none',
      3: 'none',
    } as Record<PlayerPosition, TichuCall>,
    finishOrder: [],
    playedCards: [],
    scores: [290, 10],
  };
}

function report22Context(overrides: Partial<GameContext> = {}): GameContext {
  return {
    playerCardCounts: new Map<PlayerPosition, number>([
      [0, 11],
      [1, 11],
      [2, 13],
      [3, 13],
    ]),
    tichuCalls: {
      0: 'none',
      1: 'none',
      2: 'none',
      3: 'none',
    } as Record<PlayerPosition, TichuCall>,
    finishOrder: [],
    playedCards: [],
    scores: [0, 0],
    ...overrides,
  };
}

describe('BotAI Phoenix leading', () => {
  it('does not lead bare Phoenix as the low setup card for a partner Tichu caller', () => {
    const bot = new BotAI('medium');
    const hand: Card[] = [
      sc(SpecialCardType.PHOENIX),
      nc(Suit.JADE, NormalRank.TWO),
      nc(Suit.JADE, NormalRank.FOUR),
      nc(Suit.STAR, NormalRank.SIX),
      nc(Suit.PAGODA, NormalRank.SEVEN),
      nc(Suit.SWORD, NormalRank.SEVEN),
      nc(Suit.STAR, NormalRank.KING),
      sc(SpecialCardType.DRAGON),
    ];

    const play = bot.choosePlay(hand, emptyTrick, inactiveWish, 2, report28Context());

    expect(play).toEqual(['JADE_2']);
  });

  it('still allows Phoenix as a lead when it is the only card left', () => {
    const bot = new BotAI('medium');

    const play = bot.choosePlay(
      [sc(SpecialCardType.PHOENIX)],
      emptyTrick,
      inactiveWish,
      2,
      report28Context(),
    );

    expect(play).toEqual([SpecialCardType.PHOENIX]);
  });
});

describe('BotAI partner-winning endgame follow', () => {
  it('plays over an out partner in the report #26 endgame shape', () => {
    const bot = new BotAI('medium');
    const leadTwo = nc(Suit.PAGODA, NormalRank.TWO);
    const hand: Card[] = [
      nc(Suit.SWORD, NormalRank.JACK),
      nc(Suit.PAGODA, NormalRank.QUEEN),
    ];

    const play = bot.choosePlay(hand, singleTrick(0, leadTwo), inactiveWish, 2, report26Context(true));

    expect(play).toEqual(['SWORD_11']);
    expect(bot.lastBranch).toBe('follow:endgame-partner-out');
  });

  it('still passes when partner is winning and not out', () => {
    const bot = new BotAI('medium');
    const leadTwo = nc(Suit.PAGODA, NormalRank.TWO);
    const hand: Card[] = [
      nc(Suit.SWORD, NormalRank.JACK),
      nc(Suit.PAGODA, NormalRank.QUEEN),
    ];

    const play = bot.choosePlay(hand, singleTrick(0, leadTwo), inactiveWish, 2, report26Context(false));

    expect(play).toBeNull();
    expect(bot.lastBranch).toBe('follow:pass-partner-winning');
  });

  it('mirrors the partner-out endgame exception in the medium follow path', () => {
    const bot = new BotAI('easy');
    const leadTwo = nc(Suit.PAGODA, NormalRank.TWO);
    const hand: Card[] = [
      nc(Suit.SWORD, NormalRank.JACK),
      nc(Suit.PAGODA, NormalRank.QUEEN),
    ];

    const play = bot.choosePlay(hand, singleTrick(0, leadTwo), inactiveWish, 2, report26Context(true));

    expect(play).toEqual(['SWORD_11']);
    expect(bot.lastBranch).toBe('follow:endgame-partner-out');
  });
});

describe('BotAI partner Mahjong wish protection', () => {
  it('plays a normal single over partner Mahjong in the report #25 shape', () => {
    const bot = new BotAI('medium');
    const hand: Card[] = [
      nc(Suit.SWORD, NormalRank.JACK),
      nc(Suit.PAGODA, NormalRank.QUEEN),
    ];

    const play = bot.choosePlay(hand, singleTrick(0, sc(SpecialCardType.MAHJONG)), wishForTwo, 2, report25Context());

    expect(play).toEqual(['SWORD_11']);
    expect(bot.lastBranch).toBe('follow:protect-partner-mahjong-wish');
  });

  it('keeps passing over partner Mahjong when there is no active wish', () => {
    const bot = new BotAI('medium');
    const hand: Card[] = [
      nc(Suit.SWORD, NormalRank.JACK),
      nc(Suit.PAGODA, NormalRank.QUEEN),
    ];

    const play = bot.choosePlay(hand, singleTrick(0, sc(SpecialCardType.MAHJONG)), inactiveWish, 2, report25Context());

    expect(play).toBeNull();
    expect(bot.lastBranch).toBe('follow:pass-partner-winning');
  });

  it('does not spend Dragon or Phoenix just to protect partner Mahjong wish', () => {
    const bot = new BotAI('medium');
    const hand: Card[] = [
      sc(SpecialCardType.PHOENIX),
      sc(SpecialCardType.DRAGON),
    ];

    const play = bot.choosePlay(hand, singleTrick(0, sc(SpecialCardType.MAHJONG)), wishForTwo, 2, report25Context());

    expect(play).toBeNull();
    expect(bot.lastBranch).toBe('follow:pass-partner-winning');
  });
});

describe('BotAI bomb leading', () => {
  it('does not lead an available bomb as a normal multi-card combo in the report #24 shape', () => {
    const bot = new BotAI('medium');
    const hand: Card[] = [
      nc(Suit.PAGODA, NormalRank.TWO),
      nc(Suit.JADE, NormalRank.FIVE),
      nc(Suit.PAGODA, NormalRank.FIVE),
      nc(Suit.STAR, NormalRank.FIVE),
      nc(Suit.SWORD, NormalRank.FIVE),
      nc(Suit.PAGODA, NormalRank.NINE),
      nc(Suit.SWORD, NormalRank.TEN),
      nc(Suit.PAGODA, NormalRank.QUEEN),
      sc(SpecialCardType.DRAGON),
    ];

    const play = bot.choosePlay(hand, emptyTrick, inactiveWish, 3, report24Context());

    expect(play).toEqual(['PAGODA_2']);
    expect(bot.lastBranch).toBe('lead:singleton');
  });

  it('still leads a bomb when it is the only playable lead', () => {
    const bot = new BotAI('medium');
    const hand: Card[] = [
      nc(Suit.JADE, NormalRank.FIVE),
      nc(Suit.PAGODA, NormalRank.FIVE),
      nc(Suit.STAR, NormalRank.FIVE),
      nc(Suit.SWORD, NormalRank.FIVE),
    ];

    const play = bot.choosePlay(hand, emptyTrick, inactiveWish, 3, report24Context());

    expect(play).toEqual(['JADE_5', 'PAGODA_5', 'STAR_5', 'SWORD_5']);
    expect(bot.lastBranch).toBe('lead:bomb-only');
  });

  it('can lead a bomb to close out a short endgame hand', () => {
    const bot = new BotAI('medium');
    const hand: Card[] = [
      nc(Suit.PAGODA, NormalRank.TWO),
      nc(Suit.JADE, NormalRank.FIVE),
      nc(Suit.PAGODA, NormalRank.FIVE),
      nc(Suit.STAR, NormalRank.FIVE),
      nc(Suit.SWORD, NormalRank.FIVE),
    ];

    const play = bot.choosePlay(hand, emptyTrick, inactiveWish, 3, report24Context());

    expect(play).toEqual(['JADE_5', 'PAGODA_5', 'STAR_5', 'SWORD_5']);
    expect(bot.lastBranch).toBe('lead:bomb-endgame');
  });
});

describe('BotAI Phoenix following', () => {
  it('does not spend Phoenix on a Jack when a normal card can win in the report #22 shape', () => {
    const bot = new BotAI('medium');
    const hand: Card[] = [
      sc(SpecialCardType.PHOENIX),
      nc(Suit.JADE, NormalRank.TWO),
      nc(Suit.JADE, NormalRank.FIVE),
      nc(Suit.SWORD, NormalRank.FIVE),
      nc(Suit.PAGODA, NormalRank.SIX),
      nc(Suit.STAR, NormalRank.SEVEN),
      nc(Suit.SWORD, NormalRank.SEVEN),
      nc(Suit.STAR, NormalRank.EIGHT),
      nc(Suit.SWORD, NormalRank.NINE),
      nc(Suit.STAR, NormalRank.JACK),
      nc(Suit.SWORD, NormalRank.JACK),
      nc(Suit.JADE, NormalRank.KING),
      nc(Suit.SWORD, NormalRank.KING),
    ];

    const play = bot.choosePlay(hand, singleTrick(0, nc(Suit.JADE, NormalRank.JACK)), inactiveWish, 3, report22Context());

    expect(play).toEqual(['JADE_13']);
    expect(bot.lastBranch).toBe('follow:smart-select');
  });

  it('uses a normal card instead of Phoenix when an opponent is almost out and both can win', () => {
    const bot = new BotAI('medium');
    const hand: Card[] = [
      sc(SpecialCardType.PHOENIX),
      nc(Suit.JADE, NormalRank.TWO),
      nc(Suit.PAGODA, NormalRank.SIX),
      nc(Suit.STAR, NormalRank.SEVEN),
      nc(Suit.JADE, NormalRank.KING),
      nc(Suit.SWORD, NormalRank.KING),
    ];
    const context = report22Context({
      playerCardCounts: new Map<PlayerPosition, number>([
        [0, 1],
        [1, 11],
        [2, 13],
        [3, 6],
      ]),
    });

    const play = bot.choosePlay(hand, singleTrick(0, nc(Suit.JADE, NormalRank.JACK)), inactiveWish, 3, context);

    expect(play).toEqual(['JADE_13']);
  });

  it('can still use Phoenix when it is the only way to stop an opponent going out', () => {
    const bot = new BotAI('medium');
    const hand: Card[] = [
      sc(SpecialCardType.PHOENIX),
      nc(Suit.JADE, NormalRank.TWO),
      nc(Suit.PAGODA, NormalRank.SIX),
      nc(Suit.STAR, NormalRank.SEVEN),
      nc(Suit.SWORD, NormalRank.NINE),
      nc(Suit.STAR, NormalRank.TEN),
    ];
    const context = report22Context({
      playerCardCounts: new Map<PlayerPosition, number>([
        [0, 1],
        [1, 11],
        [2, 13],
        [3, 6],
      ]),
    });

    const play = bot.choosePlay(hand, singleTrick(0, nc(Suit.JADE, NormalRank.JACK)), inactiveWish, 3, context);

    expect(play).toEqual([SpecialCardType.PHOENIX]);
    expect(bot.lastBranch).toBe('follow:play-opp-about-out');
  });

  it('can still use Phoenix as a late endgame follow', () => {
    const bot = new BotAI('medium');
    const hand: Card[] = [
      sc(SpecialCardType.PHOENIX),
      nc(Suit.JADE, NormalRank.TWO),
      nc(Suit.PAGODA, NormalRank.SIX),
    ];

    const play = bot.choosePlay(hand, singleTrick(0, nc(Suit.JADE, NormalRank.JACK)), inactiveWish, 3, report22Context());

    expect(play).toEqual([SpecialCardType.PHOENIX]);
  });

  it('can still use Phoenix over a King when it is the only winning follow', () => {
    const bot = new BotAI('medium');
    const hand: Card[] = [
      sc(SpecialCardType.PHOENIX),
      nc(Suit.JADE, NormalRank.TWO),
      nc(Suit.PAGODA, NormalRank.SIX),
      nc(Suit.STAR, NormalRank.SEVEN),
      nc(Suit.SWORD, NormalRank.NINE),
      nc(Suit.STAR, NormalRank.TEN),
    ];

    const play = bot.choosePlay(hand, singleTrick(0, nc(Suit.JADE, NormalRank.KING)), inactiveWish, 3);

    expect(play).toEqual([SpecialCardType.PHOENIX]);
  });
});
