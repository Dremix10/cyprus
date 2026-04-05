import type { Card } from './types/card.js';
import type { PlayerPosition, TichuCall } from './types/player.js';
import { getCardPoints } from './cards.js';
import { TICHU_POINTS, GRAND_TICHU_POINTS } from './constants.js';

/** Sum point values of a set of cards. */
export function sumCardPoints(cards: Card[]): number {
  return cards.reduce((sum, card) => sum + getCardPoints(card), 0);
}

/** Get the team index (0 or 1) for a player position. Positions 0,2 = Team 0; Positions 1,3 = Team 1. */
export function getTeam(position: PlayerPosition): 0 | 1 {
  return (position % 2) as 0 | 1;
}

/** Check if two positions are on the same team. */
export function sameTeam(a: PlayerPosition, b: PlayerPosition): boolean {
  return getTeam(a) === getTeam(b);
}

/** Get the partner position. */
export function getPartner(position: PlayerPosition): PlayerPosition {
  return ((position + 2) % 4) as PlayerPosition;
}

export type RoundResult = {
  finishOrder: PlayerPosition[];
  trickPoints: [Card[], Card[]]; // cards won by each team
  lastPlayerHand: Card[]; // remaining cards of the 4th-place player
  tichuCalls: Record<PlayerPosition, TichuCall>;
};

export type RoundScore = {
  teamPoints: [number, number];
  tichuBonuses: [number, number];
  totalRound: [number, number];
  breakdown: RoundScoreBreakdown;
};

export type RoundScoreBreakdown = {
  doubleVictory: 0 | 1 | null; // which team got 1-2, or null
  cardPoints: [number, number]; // points from won tricks
  lastPlayerHandPoints: number; // points transferred from last player's hand
  lastPlayerHandTeam: 0 | 1 | null; // which team received the last player's hand
  tichuResults: {
    position: PlayerPosition;
    call: 'tichu' | 'grand_tichu';
    success: boolean;
    points: number; // +100/+200 or -100/-200
    team: 0 | 1;
  }[];
};

/** Calculate round scores from a round result. */
export function calculateRoundScore(result: RoundResult): RoundScore {
  const { finishOrder, trickPoints, lastPlayerHand, tichuCalls } = result;
  const teamPoints: [number, number] = [0, 0];

  const first = finishOrder[0];
  const second = finishOrder[1];
  const isDoubleVictory = sameTeam(first, second);

  const breakdown: RoundScoreBreakdown = {
    doubleVictory: null,
    cardPoints: [0, 0],
    lastPlayerHandPoints: 0,
    lastPlayerHandTeam: null,
    tichuResults: [],
  };

  // Check for 1-2 (double victory): same team finishes 1st and 2nd
  if (isDoubleVictory) {
    const winTeam = getTeam(first);
    teamPoints[winTeam] = 200;
    teamPoints[winTeam === 0 ? 1 : 0] = 0;
    breakdown.doubleVictory = winTeam;
  } else {
    // Normal scoring
    const cardPts0 = sumCardPoints(trickPoints[0]);
    const cardPts1 = sumCardPoints(trickPoints[1]);
    teamPoints[0] = cardPts0;
    teamPoints[1] = cardPts1;
    breakdown.cardPoints = [cardPts0, cardPts1];

    // Last player gives their hand to the opposing team
    const lastPlayer = finishOrder[3];
    const lastTeam = getTeam(lastPlayer);
    const opposingTeam = lastTeam === 0 ? 1 : 0;
    const handPoints = sumCardPoints(lastPlayerHand);
    teamPoints[opposingTeam] += handPoints;
    breakdown.lastPlayerHandPoints = handPoints;
    breakdown.lastPlayerHandTeam = opposingTeam;
  }

  // Tichu bonuses/penalties
  const tichuBonuses: [number, number] = [0, 0];
  for (const pos of [0, 1, 2, 3] as PlayerPosition[]) {
    const call = tichuCalls[pos];
    const team = getTeam(pos);
    const wentOutFirst = finishOrder[0] === pos;

    if (call === 'tichu') {
      const points = wentOutFirst ? TICHU_POINTS : -TICHU_POINTS;
      tichuBonuses[team] += points;
      breakdown.tichuResults.push({ position: pos, call: 'tichu', success: wentOutFirst, points, team });
    } else if (call === 'grand_tichu') {
      const points = wentOutFirst ? GRAND_TICHU_POINTS : -GRAND_TICHU_POINTS;
      tichuBonuses[team] += points;
      breakdown.tichuResults.push({ position: pos, call: 'grand_tichu', success: wentOutFirst, points, team });
    }
  }

  return {
    teamPoints,
    tichuBonuses,
    totalRound: [
      teamPoints[0] + tichuBonuses[0],
      teamPoints[1] + tichuBonuses[1],
    ],
    breakdown,
  };
}
