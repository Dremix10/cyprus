import { describe, expect, it } from 'vitest';
import { BotAI, type GameContext, type MonteCarloDecisionResult } from '../BotAI.js';
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

function reportTrick(
  plays: Array<{ position: PlayerPosition; card: Card }>,
  currentWinner: PlayerPosition,
): TrickState {
  return {
    plays: plays.map(({ position, card }) => ({
      playerPosition: position,
      combination: {
        type: CombinationType.SINGLE,
        cards: [card],
        rank: singleRank(card),
        length: 1,
      },
    })),
    currentWinner,
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

function report20Context(overrides: Partial<GameContext> = {}): GameContext {
  return {
    playerCardCounts: new Map<PlayerPosition, number>([
      [0, 14],
      [1, 4],
      [2, 14],
      [3, 14],
    ]),
    tichuCalls: {
      0: 'grand_tichu',
      1: 'none',
      2: 'none',
      3: 'none',
    } as Record<PlayerPosition, TichuCall>,
    finishOrder: [],
    playedCards: [],
    scores: [-260, 260],
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

describe('BotAI endgame lead planning', () => {
  it('uses the explainable lead scorer for ordinary hard leads', () => {
    const bot = new BotAI('hard', { useLeadScorer: true });
    const hand: Card[] = [
      nc(Suit.PAGODA, NormalRank.THREE),
      nc(Suit.STAR, NormalRank.FOUR),
      nc(Suit.SWORD, NormalRank.FIVE),
      nc(Suit.JADE, NormalRank.SIX),
      nc(Suit.PAGODA, NormalRank.SEVEN),
      nc(Suit.STAR, NormalRank.NINE),
      nc(Suit.SWORD, NormalRank.TEN),
    ];

    const play = bot.choosePlay(hand, emptyTrick, inactiveWish, 2, report22Context());

    expect(play).toEqual(['PAGODA_3', 'STAR_4', 'SWORD_5', 'JADE_6', 'PAGODA_7']);
    expect(bot.lastBranch).toBe('lead:scorer');
    expect(bot.lastLeadScoreTrace?.reason).toContain('cards-out');
    expect(bot.lastLeadScoreTrace?.candidates.length).toBeGreaterThan(1);
  });

  it('can disable the lead scorer for arena baselines', () => {
    const bot = new BotAI('hard', { useLeadScorer: false, recordLeadScorerTrace: false });
    const hand: Card[] = [
      nc(Suit.PAGODA, NormalRank.THREE),
      nc(Suit.STAR, NormalRank.FOUR),
      nc(Suit.SWORD, NormalRank.FIVE),
      nc(Suit.JADE, NormalRank.SIX),
      nc(Suit.PAGODA, NormalRank.SEVEN),
      nc(Suit.STAR, NormalRank.NINE),
      nc(Suit.SWORD, NormalRank.TEN),
    ];

    const play = bot.choosePlay(hand, emptyTrick, inactiveWish, 2, report22Context());

    expect(play).toEqual(['PAGODA_3', 'STAR_4', 'SWORD_5', 'JADE_6', 'PAGODA_7']);
    expect(bot.lastBranch).toBe('lead:long-5plus');
    expect(bot.lastLeadScoreTrace).toBeNull();
  });

  it('records lead scorer diagnostics in shadow mode without changing the move', () => {
    const bot = new BotAI('hard');
    const hand: Card[] = [
      nc(Suit.PAGODA, NormalRank.THREE),
      nc(Suit.STAR, NormalRank.FOUR),
      nc(Suit.SWORD, NormalRank.FIVE),
      nc(Suit.JADE, NormalRank.SIX),
      nc(Suit.PAGODA, NormalRank.SEVEN),
      nc(Suit.STAR, NormalRank.NINE),
      nc(Suit.SWORD, NormalRank.TEN),
    ];

    const play = bot.choosePlay(hand, emptyTrick, inactiveWish, 2, report22Context());

    expect(play).toEqual(['PAGODA_3', 'STAR_4', 'SWORD_5', 'JADE_6', 'PAGODA_7']);
    expect(bot.lastBranch).toBe('lead:long-5plus');
    expect(bot.lastLeadScoreTrace?.cardIds).toEqual(['PAGODA_3', 'STAR_4', 'SWORD_5', 'JADE_6', 'PAGODA_7']);
  });

  it('does not break a triple in the report #21 endgame shape', () => {
    const bot = new BotAI('hard');
    const hand: Card[] = [
      nc(Suit.PAGODA, NormalRank.NINE),
      nc(Suit.STAR, NormalRank.NINE),
      nc(Suit.SWORD, NormalRank.NINE),
      nc(Suit.SWORD, NormalRank.TEN),
      nc(Suit.JADE, NormalRank.QUEEN),
    ];

    const play = bot.choosePlay(hand, emptyTrick, inactiveWish, 2, report22Context({
      playerCardCounts: new Map<PlayerPosition, number>([
        [0, 0],
        [1, 0],
        [2, 5],
        [3, 4],
      ]),
      tichuCalls: {
        0: 'grand_tichu',
        1: 'none',
        2: 'none',
        3: 'none',
      } as Record<PlayerPosition, TichuCall>,
      finishOrder: [1, 0],
      scores: [-260, 260],
    }));

    expect(play).toEqual(['PAGODA_9', 'STAR_9', 'SWORD_9']);
    expect(bot.lastBranch).toBe('lead:endgame-plan');
  });

  it('uses the endgame lead plan before Monte Carlo can choose a broken singleton', () => {
    const bot = new BotAI('hard', { useMonteCarlo: true });
    let mcCalled = false;
    const hand: Card[] = [
      nc(Suit.PAGODA, NormalRank.NINE),
      nc(Suit.STAR, NormalRank.NINE),
      nc(Suit.SWORD, NormalRank.NINE),
      nc(Suit.SWORD, NormalRank.TEN),
      nc(Suit.JADE, NormalRank.QUEEN),
    ];

    const play = bot.choosePlay(
      hand,
      emptyTrick,
      inactiveWish,
      2,
      report22Context({
        playerCardCounts: new Map<PlayerPosition, number>([
          [0, 0],
          [1, 0],
          [2, 5],
          [3, 4],
        ]),
        finishOrder: [1, 0],
      }),
      () => {
        mcCalled = true;
        return mcDecision(['PAGODA_9'], [
          { cardIds: ['PAGODA_9'], avg: 100 },
        ]);
      },
    );

    expect(mcCalled).toBe(false);
    expect(play).toEqual(['PAGODA_9', 'STAR_9', 'SWORD_9']);
    expect(bot.lastBranch).toBe('lead:endgame-plan');
  });

  it('does not break a pair in a small endgame hand when the pair is playable', () => {
    const bot = new BotAI('hard');
    const hand: Card[] = [
      nc(Suit.PAGODA, NormalRank.EIGHT),
      nc(Suit.SWORD, NormalRank.EIGHT),
      nc(Suit.SWORD, NormalRank.TEN),
      nc(Suit.JADE, NormalRank.QUEEN),
    ];

    const play = bot.choosePlay(hand, emptyTrick, inactiveWish, 2, report22Context());

    expect(play).toEqual(['PAGODA_8', 'SWORD_8']);
    expect(bot.lastBranch).toBe('lead:endgame-plan');
  });

  it('leads the high control single first in the report #33 three-card endgame', () => {
    const bot = new BotAI('hard');
    const hand: Card[] = [
      nc(Suit.STAR, NormalRank.THREE),
      nc(Suit.PAGODA, NormalRank.FOUR),
      nc(Suit.JADE, NormalRank.TEN),
    ];

    const play = bot.choosePlay(hand, emptyTrick, inactiveWish, 2, report22Context({
      playerCardCounts: new Map<PlayerPosition, number>([
        [0, 0],
        [1, 0],
        [2, 3],
        [3, 1],
      ]),
      finishOrder: [0, 1],
      scores: [-260, 260],
    }));

    expect(play).toEqual(['JADE_10']);
    expect(bot.lastBranch).toBe('lead:endgame-control-ladder');
  });

  it('uses the Ace before the Ten in the report #34 two-card endgame', () => {
    const bot = new BotAI('hard', { useMonteCarlo: true });
    let mcCalled = false;
    const hand: Card[] = [
      nc(Suit.SWORD, NormalRank.TEN),
      nc(Suit.STAR, NormalRank.ACE),
    ];

    const play = bot.choosePlay(
      hand,
      emptyTrick,
      inactiveWish,
      1,
      report22Context({
        playerCardCounts: new Map<PlayerPosition, number>([
          [0, 0],
          [1, 2],
          [2, 4],
          [3, 1],
        ]),
        finishOrder: [0],
        scores: [-260, 260],
      }),
      () => {
        mcCalled = true;
        return mcDecision(['STAR_14'], [
          { cardIds: ['SWORD_10'], avg: -70 },
          { cardIds: ['STAR_14'], avg: -64 },
        ]);
      },
    );

    expect(mcCalled).toBe(false);
    expect(play).toEqual(['STAR_14']);
    expect(bot.lastBranch).toBe('lead:endgame-control-ladder');
  });

  it('leads the Jack before the Six in the report #35 two-card endgame', () => {
    const bot = new BotAI('hard');
    const hand: Card[] = [
      nc(Suit.STAR, NormalRank.SIX),
      nc(Suit.JADE, NormalRank.JACK),
    ];

    const play = bot.choosePlay(hand, emptyTrick, inactiveWish, 2, report22Context({
      playerCardCounts: new Map<PlayerPosition, number>([
        [0, 0],
        [1, 0],
        [2, 2],
        [3, 2],
      ]),
      finishOrder: [0, 1],
      scores: [-260, 260],
    }));

    expect(play).toEqual(['JADE_11']);
    expect(bot.lastBranch).toBe('lead:endgame-control-ladder');
  });
});

describe('BotAI endgame solver diagnostics', () => {
  it('does not rush out before a Grand Tichu partner when solver control is enabled', () => {
    const bot = new BotAI('hard', { useEndgameSolver: true });
    const hand: Card[] = [
      nc(Suit.PAGODA, NormalRank.FIVE),
      nc(Suit.SWORD, NormalRank.FIVE),
    ];

    const play = bot.choosePlay(hand, emptyTrick, inactiveWish, 2, report22Context({
      playerCardCounts: new Map<PlayerPosition, number>([
        [0, 1],
        [1, 6],
        [2, 2],
        [3, 6],
      ]),
      tichuCalls: {
        0: 'grand_tichu',
        1: 'none',
        2: 'none',
        3: 'none',
      } as Record<PlayerPosition, TichuCall>,
    }));

    expect(play).toHaveLength(1);
    expect(play).not.toEqual(['PAGODA_5', 'SWORD_5']);
    expect(bot.lastBranch).toBe('endgame:solver');
    expect(bot.lastEndgameSolverTrace?.mode).toBe('partner-tichu-support');
    expect(bot.lastEndgameSolverTrace?.reason).toContain('low-lead-for-partner');
  });

  it('passes over a winning Grand Tichu partner instead of going out', () => {
    const bot = new BotAI('hard', { useEndgameSolver: true });
    const hand: Card[] = [nc(Suit.PAGODA, NormalRank.FOUR)];

    const play = bot.choosePlay(hand, singleTrick(0, nc(Suit.STAR, NormalRank.THREE)), inactiveWish, 2, report22Context({
      playerCardCounts: new Map<PlayerPosition, number>([
        [0, 1],
        [1, 6],
        [2, 1],
        [3, 6],
      ]),
      tichuCalls: {
        0: 'grand_tichu',
        1: 'none',
        2: 'none',
        3: 'none',
      } as Record<PlayerPosition, TichuCall>,
    }));

    expect(play).toBeNull();
    expect(bot.lastBranch).toBe('endgame:solver');
    expect(bot.lastEndgameSolverTrace?.cardIds).toBeNull();
    expect(bot.lastEndgameSolverTrace?.reason).toContain('partner-winning-pass');
  });

  it('records shadow diagnostics without changing the live move', () => {
    const bot = new BotAI('hard');
    const hand: Card[] = [
      nc(Suit.PAGODA, NormalRank.FIVE),
      nc(Suit.SWORD, NormalRank.FIVE),
    ];

    const play = bot.choosePlay(hand, emptyTrick, inactiveWish, 2, report22Context({
      playerCardCounts: new Map<PlayerPosition, number>([
        [0, 1],
        [1, 6],
        [2, 2],
        [3, 6],
      ]),
      tichuCalls: {
        0: 'grand_tichu',
        1: 'none',
        2: 'none',
        3: 'none',
      } as Record<PlayerPosition, TichuCall>,
    }));

    expect(play).toEqual(['PAGODA_5', 'SWORD_5']);
    expect(bot.lastBranch).toBe('lead:endgame-dump');
    expect(bot.lastEndgameSolverTrace?.mode).toBe('partner-tichu-support');
    expect(bot.lastEndgameSolverTrace?.cardIds).toHaveLength(1);
  });

  it('prefers the control card in a two-card urgent endgame', () => {
    const bot = new BotAI('hard', { useEndgameSolver: true });
    const hand: Card[] = [
      nc(Suit.STAR, NormalRank.SIX),
      nc(Suit.JADE, NormalRank.JACK),
    ];

    const play = bot.choosePlay(hand, emptyTrick, inactiveWish, 2, report22Context({
      playerCardCounts: new Map<PlayerPosition, number>([
        [0, 0],
        [1, 0],
        [2, 2],
        [3, 2],
      ]),
      finishOrder: [0, 1],
    }));

    expect(play).toEqual(['JADE_11']);
    expect(bot.lastBranch).toBe('endgame:solver');
    expect(bot.lastEndgameSolverTrace?.mode).toBe('urgent-endgame');
  });
});

describe('BotAI low-single initiative blocking', () => {
  it('does not let Monte Carlo pass on an opponent low single in the report #20 shape', () => {
    const bot = new BotAI('hard', { useMonteCarlo: true });
    let mcCalled = false;
    const hand: Card[] = [
      nc(Suit.JADE, NormalRank.FIVE),
      nc(Suit.STAR, NormalRank.FIVE),
      nc(Suit.JADE, NormalRank.SIX),
      nc(Suit.JADE, NormalRank.SEVEN),
      nc(Suit.PAGODA, NormalRank.EIGHT),
      nc(Suit.STAR, NormalRank.EIGHT),
      nc(Suit.SWORD, NormalRank.EIGHT),
      nc(Suit.PAGODA, NormalRank.NINE),
      nc(Suit.STAR, NormalRank.NINE),
      nc(Suit.SWORD, NormalRank.NINE),
      nc(Suit.SWORD, NormalRank.TEN),
      nc(Suit.JADE, NormalRank.QUEEN),
      nc(Suit.PAGODA, NormalRank.QUEEN),
      nc(Suit.STAR, NormalRank.QUEEN),
    ];

    const play = bot.choosePlay(
      hand,
      singleTrick(1, nc(Suit.SWORD, NormalRank.TWO)),
      inactiveWish,
      2,
      report20Context(),
      () => {
        mcCalled = true;
        return mcDecision(null, [
          { cardIds: null, avg: 100 },
        ]);
      },
    );

    expect(mcCalled).toBe(false);
    expect(play).toEqual(['JADE_6']);
    expect(bot.lastBranch).toBe('follow:block-low-single-initiative');
  });

  it('uses a real blocker when a one-card opponent led low in the report #32 shape', () => {
    const bot = new BotAI('unfair', { useMonteCarlo: true });
    let mcCalled = false;
    const hand: Card[] = [
      nc(Suit.SWORD, NormalRank.TWO),
      nc(Suit.JADE, NormalRank.THREE),
      nc(Suit.STAR, NormalRank.FOUR),
      nc(Suit.SWORD, NormalRank.FOUR),
      nc(Suit.JADE, NormalRank.FIVE),
      nc(Suit.JADE, NormalRank.SIX),
      nc(Suit.PAGODA, NormalRank.NINE),
      nc(Suit.PAGODA, NormalRank.JACK),
      nc(Suit.SWORD, NormalRank.QUEEN),
      nc(Suit.STAR, NormalRank.KING),
    ];

    const play = bot.choosePlay(
      hand,
      singleTrick(3, nc(Suit.PAGODA, NormalRank.FOUR)),
      inactiveWish,
      2,
      report22Context({
        playerCardCounts: new Map<PlayerPosition, number>([
          [0, 0],
          [1, 8],
          [2, 10],
          [3, 1],
        ]),
        finishOrder: [0],
      }),
      () => {
        mcCalled = true;
        return undefined;
      },
    );

    expect(mcCalled).toBe(false);
    expect(play).toEqual(['SWORD_12']);
    expect(bot.lastBranch).toBe('follow:block-one-card-opponent');
  });

  it('does not force an expensive card just because an opponent led low', () => {
    const bot = new BotAI('hard', { useMonteCarlo: true });
    const hand: Card[] = [
      nc(Suit.JADE, NormalRank.QUEEN),
      nc(Suit.PAGODA, NormalRank.QUEEN),
    ];

    const play = bot.choosePlay(
      hand,
      singleTrick(1, nc(Suit.SWORD, NormalRank.TWO)),
      inactiveWish,
      2,
      report20Context(),
      () => mcDecision(null, [
        { cardIds: ['PAGODA_12'], avg: 0 },
        { cardIds: null, avg: 50 },
      ]),
    );

    expect(play).toBeNull();
    expect(bot.lastBranch).toBe('mc:override');
  });
});

describe('BotAI report-driven lead planning fixes', () => {
  it('does not burn an Ace just because an opponent has a distant Tichu call', () => {
    const bot = new BotAI('medium');
    const hand: Card[] = [
      nc(Suit.STAR, NormalRank.SIX),
      nc(Suit.SWORD, NormalRank.SEVEN),
      nc(Suit.SWORD, NormalRank.EIGHT),
      nc(Suit.PAGODA, NormalRank.TEN),
      nc(Suit.STAR, NormalRank.TEN),
      nc(Suit.SWORD, NormalRank.JACK),
      nc(Suit.SWORD, NormalRank.KING),
      nc(Suit.JADE, NormalRank.ACE),
    ];

    const play = bot.choosePlay(hand, emptyTrick, inactiveWish, 1, report22Context({
      playerCardCounts: new Map<PlayerPosition, number>([
        [0, 8],
        [1, 8],
        [2, 13],
        [3, 13],
      ]),
      tichuCalls: {
        0: 'grand_tichu',
        1: 'none',
        2: 'none',
        3: 'none',
      } as Record<PlayerPosition, TichuCall>,
      scores: [210, 190],
    }));

    expect(play).toEqual(['SWORD_13']);
    expect(bot.lastBranch).toBe('lead:vs-tichu-high');
  });

  it('uses a bigger consecutive-pairs lead when opponents are almost out', () => {
    const bot = new BotAI('medium');
    const hand: Card[] = [
      nc(Suit.SWORD, NormalRank.TWO),
      nc(Suit.PAGODA, NormalRank.THREE),
      nc(Suit.STAR, NormalRank.THREE),
      nc(Suit.STAR, NormalRank.FOUR),
      nc(Suit.SWORD, NormalRank.FOUR),
      nc(Suit.SWORD, NormalRank.SIX),
      nc(Suit.JADE, NormalRank.EIGHT),
      nc(Suit.PAGODA, NormalRank.EIGHT),
      nc(Suit.STAR, NormalRank.QUEEN),
      nc(Suit.STAR, NormalRank.ACE),
    ];

    const play = bot.choosePlay(hand, emptyTrick, inactiveWish, 2, report22Context({
      playerCardCounts: new Map<PlayerPosition, number>([
        [0, 0],
        [1, 2],
        [2, 10],
        [3, 1],
      ]),
      finishOrder: [0],
      scores: [45, 55],
    }));

    expect(play).toEqual(['PAGODA_3', 'STAR_3', 'STAR_4', 'SWORD_4']);
    expect(bot.lastBranch).toBe('lead:race-plan');
  });

  it('does not open with a Phoenix/Ace/King-heavy combo without a finish plan', () => {
    const bot = new BotAI('medium');
    const hand: Card[] = [
      sc(SpecialCardType.PHOENIX),
      nc(Suit.PAGODA, NormalRank.TWO),
      nc(Suit.SWORD, NormalRank.FOUR),
      nc(Suit.JADE, NormalRank.FIVE),
      nc(Suit.PAGODA, NormalRank.FIVE),
      nc(Suit.SWORD, NormalRank.FIVE),
      nc(Suit.JADE, NormalRank.SEVEN),
      nc(Suit.STAR, NormalRank.EIGHT),
      nc(Suit.PAGODA, NormalRank.QUEEN),
      nc(Suit.SWORD, NormalRank.QUEEN),
      nc(Suit.PAGODA, NormalRank.KING),
      nc(Suit.SWORD, NormalRank.KING),
      nc(Suit.SWORD, NormalRank.ACE),
    ];

    const play = bot.choosePlay(hand, emptyTrick, inactiveWish, 3, report22Context({
      playerCardCounts: new Map<PlayerPosition, number>([
        [0, 14],
        [1, 14],
        [2, 13],
        [3, 13],
      ]),
    }));

    expect(play).not.toContain(SpecialCardType.PHOENIX);
    expect(play).not.toContain('PAGODA_13');
    expect(play).not.toContain('SWORD_13');
    expect(play).not.toContain('SWORD_14');
  });
});

describe('BotAI report-driven follow fixes', () => {
  it('spends Dragon to stop a live one-card opponent from keeping control', () => {
    const bot = new BotAI('medium');
    const hand: Card[] = [
      nc(Suit.JADE, NormalRank.THREE),
      nc(Suit.PAGODA, NormalRank.THREE),
      nc(Suit.PAGODA, NormalRank.JACK),
      nc(Suit.STAR, NormalRank.QUEEN),
      sc(SpecialCardType.DRAGON),
    ];

    const play = bot.choosePlay(hand, singleTrick(1, nc(Suit.STAR, NormalRank.ACE)), inactiveWish, 2, report22Context({
      playerCardCounts: new Map<PlayerPosition, number>([
        [0, 3],
        [1, 1],
        [2, 5],
        [3, 2],
      ]),
      scores: [370, 430],
    }));

    expect(play).toEqual([SpecialCardType.DRAGON]);
    expect(bot.lastBranch).toBe('follow:dragon-block-opp-one-card');
  });

  it('still saves Dragon when the winning opponent is already out and the trick is cheap', () => {
    const bot = new BotAI('medium');
    const hand: Card[] = [
      nc(Suit.STAR, NormalRank.FOUR),
      nc(Suit.JADE, NormalRank.SEVEN),
      nc(Suit.JADE, NormalRank.EIGHT),
      nc(Suit.SWORD, NormalRank.NINE),
      nc(Suit.SWORD, NormalRank.ACE),
      sc(SpecialCardType.DRAGON),
    ];
    const trick = reportTrick([
      { position: 2, card: nc(Suit.PAGODA, NormalRank.FOUR) },
      { position: 3, card: nc(Suit.JADE, NormalRank.ACE) },
    ], 3);

    const play = bot.choosePlay(hand, trick, inactiveWish, 0, report22Context({
      playerCardCounts: new Map<PlayerPosition, number>([
        [0, 6],
        [1, 6],
        [2, 3],
        [3, 0],
      ]),
      finishOrder: [3],
      scores: [820, 80],
    }));

    expect(play).toBeNull();
    expect(bot.lastBranch).toBe('follow:pass-dragon-save');
  });

  it('uses the Ace to secure control in the report #17 two-card endgame', () => {
    const bot = new BotAI('medium');
    const hand: Card[] = [
      nc(Suit.PAGODA, NormalRank.QUEEN),
      nc(Suit.STAR, NormalRank.ACE),
    ];
    const trick = reportTrick([
      { position: 3, card: nc(Suit.STAR, NormalRank.THREE) },
      { position: 0, card: nc(Suit.PAGODA, NormalRank.FOUR) },
    ], 0);

    const play = bot.choosePlay(hand, trick, inactiveWish, 3, report22Context({
      playerCardCounts: new Map<PlayerPosition, number>([
        [0, 11],
        [1, 0],
        [2, 0],
        [3, 2],
      ]),
      tichuCalls: {
        0: 'none',
        1: 'grand_tichu',
        2: 'none',
        3: 'none',
      } as Record<PlayerPosition, TichuCall>,
      finishOrder: [1, 2],
      scores: [300, 0],
    }));

    expect(play).toEqual(['STAR_14']);
    expect(bot.lastBranch).toBe('follow:endgame-secure-control');
  });

  it('plays Dragon over partner Phoenix when it goes out and dumps a negative trick', () => {
    const bot = new BotAI('medium');
    const trick = reportTrick([
      { position: 1, card: nc(Suit.PAGODA, NormalRank.NINE) },
      { position: 2, card: nc(Suit.SWORD, NormalRank.QUEEN) },
      { position: 0, card: sc(SpecialCardType.PHOENIX) },
    ], 0);

    const play = bot.choosePlay([sc(SpecialCardType.DRAGON)], trick, inactiveWish, 2, report22Context({
      playerCardCounts: new Map<PlayerPosition, number>([
        [0, 0],
        [1, 0],
        [2, 1],
        [3, 5],
      ]),
      tichuCalls: {
        0: 'tichu',
        1: 'grand_tichu',
        2: 'none',
        3: 'none',
      } as Record<PlayerPosition, TichuCall>,
      finishOrder: [1, 0],
      scores: [55, 45],
    }));

    expect(play).toEqual([SpecialCardType.DRAGON]);
    expect(bot.lastBranch).toBe('follow:dragon-negative-out');
  });

  it('uses pair 9s instead of bombing when a regular pair wins the trick', () => {
    const bot = new BotAI('medium');
    const hand: Card[] = [
      nc(Suit.JADE, NormalRank.TWO),
      nc(Suit.PAGODA, NormalRank.TWO),
      nc(Suit.STAR, NormalRank.TWO),
      nc(Suit.SWORD, NormalRank.TWO),
      nc(Suit.SWORD, NormalRank.EIGHT),
      nc(Suit.JADE, NormalRank.NINE),
      nc(Suit.SWORD, NormalRank.NINE),
      nc(Suit.STAR, NormalRank.QUEEN),
      nc(Suit.SWORD, NormalRank.QUEEN),
      sc(SpecialCardType.DRAGON),
    ];
    const trick: TrickState = {
      plays: [{
        playerPosition: 1,
        combination: {
          type: CombinationType.PAIR,
          cards: [nc(Suit.SWORD, NormalRank.FIVE), nc(Suit.PAGODA, NormalRank.FIVE)],
          rank: 5,
          length: 2,
        },
      }],
      currentWinner: 1,
      passCount: 0,
      passedPlayers: [],
    };

    const play = bot.choosePlay(hand, trick, inactiveWish, 2, report22Context({
      playerCardCounts: new Map<PlayerPosition, number>([
        [0, 12],
        [1, 11],
        [2, 10],
        [3, 6],
      ]),
      tichuCalls: {
        0: 'tichu',
        1: 'grand_tichu',
        2: 'none',
        3: 'none',
      } as Record<PlayerPosition, TichuCall>,
      scores: [55, 45],
    }));

    expect(play).toEqual(['JADE_9', 'SWORD_9']);
    expect(bot.lastBranch).not.toMatch(/^follow:bomb/);
  });

  it('uses an Ace instead of bombing a high-point single trick when Ace is enough', () => {
    const bot = new BotAI('medium');
    const hand: Card[] = [
      nc(Suit.STAR, NormalRank.TWO),
      nc(Suit.SWORD, NormalRank.TWO),
      nc(Suit.JADE, NormalRank.THREE),
      nc(Suit.PAGODA, NormalRank.THREE),
      nc(Suit.SWORD, NormalRank.THREE),
      nc(Suit.JADE, NormalRank.FOUR),
      nc(Suit.PAGODA, NormalRank.FOUR),
      nc(Suit.STAR, NormalRank.FOUR),
      nc(Suit.SWORD, NormalRank.FOUR),
      nc(Suit.SWORD, NormalRank.SIX),
      nc(Suit.STAR, NormalRank.SEVEN),
      nc(Suit.SWORD, NormalRank.NINE),
      nc(Suit.SWORD, NormalRank.ACE),
    ];
    const trick = reportTrick([
      { position: 2, card: sc(SpecialCardType.MAHJONG) },
      { position: 3, card: nc(Suit.STAR, NormalRank.FIVE) },
      { position: 0, card: nc(Suit.SWORD, NormalRank.JACK) },
      { position: 1, card: nc(Suit.PAGODA, NormalRank.QUEEN) },
      { position: 2, card: nc(Suit.JADE, NormalRank.KING) },
    ], 2);

    const play = bot.choosePlay(hand, trick, inactiveWish, 3, report22Context({
      playerCardCounts: new Map<PlayerPosition, number>([
        [0, 13],
        [1, 13],
        [2, 12],
        [3, 13],
      ]),
      scores: [90, 10],
    }));

    expect(play).toEqual(['SWORD_14']);
    expect(bot.lastBranch).not.toMatch(/^follow:bomb/);
  });

  it('blocks a low single from a live Grand Tichu caller even when they have many cards', () => {
    const bot = new BotAI('unfair');
    const hand: Card[] = [
      sc(SpecialCardType.PHOENIX),
      nc(Suit.SWORD, NormalRank.TWO),
      nc(Suit.PAGODA, NormalRank.THREE),
      nc(Suit.STAR, NormalRank.THREE),
      nc(Suit.SWORD, NormalRank.THREE),
      nc(Suit.JADE, NormalRank.FOUR),
      nc(Suit.SWORD, NormalRank.SIX),
      nc(Suit.PAGODA, NormalRank.SEVEN),
      nc(Suit.JADE, NormalRank.EIGHT),
      nc(Suit.STAR, NormalRank.NINE),
      nc(Suit.STAR, NormalRank.TEN),
      nc(Suit.SWORD, NormalRank.TEN),
      nc(Suit.STAR, NormalRank.QUEEN),
      nc(Suit.JADE, NormalRank.ACE),
    ];

    const play = bot.choosePlay(hand, singleTrick(0, nc(Suit.PAGODA, NormalRank.TWO)), inactiveWish, 1, report22Context({
      playerCardCounts: new Map<PlayerPosition, number>([
        [0, 13],
        [1, 14],
        [2, 13],
        [3, 14],
      ]),
      tichuCalls: {
        0: 'grand_tichu',
        1: 'none',
        2: 'none',
        3: 'none',
      } as Record<PlayerPosition, TichuCall>,
      scores: [235, 265],
    }));

    expect(play).toEqual(['JADE_4']);
    expect(bot.lastBranch).toBe('follow:block-low-single-initiative');
  });
});

function mcDecision(
  cardIds: string[] | null,
  candidates: Array<{ cardIds: string[] | null; avg: number; simCount?: number }>,
): MonteCarloDecisionResult {
  const scored = candidates.map((candidate) => {
    const simCount = candidate.simCount ?? 10;
    return {
      cardIds: candidate.cardIds,
      totalScore: candidate.avg * simCount,
      simCount,
      averageScore: candidate.avg,
    };
  });
  return {
    cardIds,
    candidates: scored,
    totalSims: scored.reduce((sum, candidate) => sum + candidate.simCount, 0),
    durationMs: 12,
    filteredCandidateCount: scored.length,
    errorCount: 0,
  };
}

describe('BotAI Monte Carlo advisor mode', () => {
  it('rejects an MC pass when the heuristic has a playable follow', () => {
    const bot = new BotAI('hard', { useMonteCarlo: true, mcOverrideMargin: 5 });
    const hand: Card[] = [
      nc(Suit.PAGODA, NormalRank.THREE),
      nc(Suit.STAR, NormalRank.FOUR),
      nc(Suit.SWORD, NormalRank.SIX),
      nc(Suit.JADE, NormalRank.EIGHT),
      nc(Suit.SWORD, NormalRank.KING),
    ];

    const play = bot.choosePlay(
      hand,
      singleTrick(0, nc(Suit.JADE, NormalRank.TWO)),
      inactiveWish,
      1,
      report22Context(),
      (_candidates, options) => {
        expect(options?.forcedCandidate?.map((c) => c.id)).toEqual(['PAGODA_3']);
        return mcDecision(null, [
          { cardIds: ['PAGODA_3'], avg: 0 },
          { cardIds: null, avg: 100 },
        ]);
      },
    );

    expect(play).toEqual(['PAGODA_3']);
    expect(bot.lastBranch).not.toBe('mc:override');
    expect(bot.lastMonteCarloTrace?.reason).toBe('pass-over-heuristic');
  });

  it('keeps the heuristic move when MC advantage is below the override margin', () => {
    const bot = new BotAI('hard', { useMonteCarlo: true, mcOverrideMargin: 25 });
    const hand: Card[] = [
      nc(Suit.JADE, NormalRank.TWO),
      nc(Suit.PAGODA, NormalRank.FOUR),
      nc(Suit.STAR, NormalRank.SIX),
      nc(Suit.SWORD, NormalRank.EIGHT),
      nc(Suit.STAR, NormalRank.KING),
      nc(Suit.JADE, NormalRank.ACE),
    ];

    const play = bot.choosePlay(
      hand,
      emptyTrick,
      inactiveWish,
      0,
      report22Context(),
      (_candidates, options) => {
        expect(options?.forcedCandidate?.map((c) => c.id)).toEqual(['JADE_2']);
        return mcDecision(['JADE_14'], [
          { cardIds: ['JADE_2'], avg: 90 },
          { cardIds: ['JADE_14'], avg: 105 },
        ]);
      },
    );

    expect(play).toEqual(['JADE_2']);
    expect(bot.lastBranch).not.toBe('mc:override');
    expect(bot.lastMonteCarloTrace?.reason).toBe('low-margin');
    expect(bot.lastMonteCarloTrace?.margin).toBe(15);
  });

  it('accepts an MC override when it clearly beats the heuristic', () => {
    const bot = new BotAI('hard', { useMonteCarlo: true, mcOverrideMargin: 25 });
    const hand: Card[] = [
      nc(Suit.JADE, NormalRank.TWO),
      nc(Suit.PAGODA, NormalRank.FOUR),
      nc(Suit.STAR, NormalRank.SIX),
      nc(Suit.SWORD, NormalRank.EIGHT),
      nc(Suit.STAR, NormalRank.KING),
      nc(Suit.JADE, NormalRank.ACE),
    ];

    const play = bot.choosePlay(
      hand,
      emptyTrick,
      inactiveWish,
      0,
      report22Context(),
      (_candidates, options) => {
        expect(options?.forcedCandidate?.map((c) => c.id)).toEqual(['JADE_2']);
        return mcDecision(['JADE_14'], [
          { cardIds: ['JADE_2'], avg: 80 },
          { cardIds: ['JADE_14'], avg: 120 },
        ]);
      },
    );

    expect(play).toEqual(['JADE_14']);
    expect(bot.lastBranch).toBe('mc:override');
    expect(bot.lastMonteCarloTrace?.accepted).toBe(true);
    expect(bot.lastMonteCarloTrace?.reason).toBe('accepted');
  });
});
