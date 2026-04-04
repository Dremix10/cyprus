import { describe, it, expect } from 'vitest';
import {
  sumCardPoints,
  getTeam,
  sameTeam,
  getPartner,
  calculateRoundScore,
} from '../scoring.js';
import { Suit, NormalRank, SpecialCardType } from '../types/card.js';
import type { NormalCard, SpecialCard } from '../types/card.js';
import type { RoundResult } from '../scoring.js';

function nc(suit: Suit, rank: NormalRank): NormalCard {
  return { type: 'normal', suit, rank, id: `${suit}_${rank}` };
}

function sc(specialType: SpecialCardType): SpecialCard {
  return { type: 'special', specialType, id: specialType };
}

describe('sumCardPoints', () => {
  it('sums point values correctly', () => {
    const cards = [
      nc(Suit.JADE, NormalRank.FIVE),   // 5
      nc(Suit.STAR, NormalRank.TEN),    // 10
      nc(Suit.SWORD, NormalRank.KING),  // 10
      nc(Suit.PAGODA, NormalRank.TWO),  // 0
    ];
    expect(sumCardPoints(cards)).toBe(25);
  });

  it('handles Dragon and Phoenix', () => {
    const cards = [sc(SpecialCardType.DRAGON), sc(SpecialCardType.PHOENIX)];
    expect(sumCardPoints(cards)).toBe(0); // 25 + (-25)
  });
});

describe('team helpers', () => {
  it('getTeam returns correct teams', () => {
    expect(getTeam(0)).toBe(0);
    expect(getTeam(1)).toBe(1);
    expect(getTeam(2)).toBe(0);
    expect(getTeam(3)).toBe(1);
  });

  it('sameTeam checks correctly', () => {
    expect(sameTeam(0, 2)).toBe(true);
    expect(sameTeam(1, 3)).toBe(true);
    expect(sameTeam(0, 1)).toBe(false);
    expect(sameTeam(0, 3)).toBe(false);
  });

  it('getPartner returns opposite seat', () => {
    expect(getPartner(0)).toBe(2);
    expect(getPartner(1)).toBe(3);
    expect(getPartner(2)).toBe(0);
    expect(getPartner(3)).toBe(1);
  });
});

describe('calculateRoundScore', () => {
  it('awards 200-0 for double victory (1-2 finish)', () => {
    const result: RoundResult = {
      finishOrder: [0, 2, 1, 3],
      trickPoints: [[], []],
      lastPlayerHand: [],
      tichuCalls: { 0: 'none', 1: 'none', 2: 'none', 3: 'none' },
    };
    const score = calculateRoundScore(result);
    expect(score.teamPoints).toEqual([200, 0]);
  });

  it('adds Tichu bonus for going out first', () => {
    const result: RoundResult = {
      finishOrder: [0, 2, 1, 3],
      trickPoints: [[], []],
      lastPlayerHand: [],
      tichuCalls: { 0: 'tichu', 1: 'none', 2: 'none', 3: 'none' },
    };
    const score = calculateRoundScore(result);
    expect(score.tichuBonuses[0]).toBe(100);
    expect(score.totalRound[0]).toBe(300);
  });

  it('penalizes failed Tichu', () => {
    const result: RoundResult = {
      finishOrder: [1, 0, 2, 3],
      trickPoints: [[], []],
      lastPlayerHand: [],
      tichuCalls: { 0: 'tichu', 1: 'none', 2: 'none', 3: 'none' },
    };
    const score = calculateRoundScore(result);
    expect(score.tichuBonuses[0]).toBe(-100);
  });

  it('handles Grand Tichu bonus', () => {
    const result: RoundResult = {
      finishOrder: [0, 1, 2, 3],
      trickPoints: [
        [nc(Suit.JADE, NormalRank.FIVE)],
        [nc(Suit.STAR, NormalRank.TEN)],
      ],
      lastPlayerHand: [],
      tichuCalls: { 0: 'grand_tichu', 1: 'none', 2: 'none', 3: 'none' },
    };
    const score = calculateRoundScore(result);
    expect(score.tichuBonuses[0]).toBe(200);
  });

  it('gives last player hand to opposing team in normal scoring', () => {
    const result: RoundResult = {
      finishOrder: [0, 1, 2, 3],
      trickPoints: [[], []],
      lastPlayerHand: [nc(Suit.JADE, NormalRank.KING)], // 10 points
      tichuCalls: { 0: 'none', 1: 'none', 2: 'none', 3: 'none' },
    };
    const score = calculateRoundScore(result);
    // Player 3 (team 1) is last; their hand goes to opposing team (team 0)
    expect(score.teamPoints[0]).toBe(10);
  });
});
