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
};

/** Calculate round scores from a round result. */
export function calculateRoundScore(result: RoundResult): RoundScore {
  const { finishOrder, trickPoints, lastPlayerHand, tichuCalls } = result;
  const teamPoints: [number, number] = [0, 0];

  const first = finishOrder[0];
  const second = finishOrder[1];

  // Check for 1-2 (double victory): same team finishes 1st and 2nd
  if (sameTeam(first, second)) {
    teamPoints[getTeam(first)] = 200;
    teamPoints[getTeam(first) === 0 ? 1 : 0] = 0;
  } else {
    // Normal scoring
    // Each team gets points from their won tricks
    teamPoints[0] = sumCardPoints(trickPoints[0]);
    teamPoints[1] = sumCardPoints(trickPoints[1]);

    // Last player gives their hand to the opposing team
    const lastPlayer = finishOrder[3];
    const lastTeam = getTeam(lastPlayer);
    const opposingTeam = lastTeam === 0 ? 1 : 0;
    teamPoints[opposingTeam] += sumCardPoints(lastPlayerHand);
  }

  // Tichu bonuses/penalties
  const tichuBonuses: [number, number] = [0, 0];
  for (const pos of [0, 1, 2, 3] as PlayerPosition[]) {
    const call = tichuCalls[pos];
    const team = getTeam(pos);
    const wentOutFirst = finishOrder[0] === pos;

    if (call === 'tichu') {
      tichuBonuses[team] += wentOutFirst ? TICHU_POINTS : -TICHU_POINTS;
    } else if (call === 'grand_tichu') {
      tichuBonuses[team] += wentOutFirst
        ? GRAND_TICHU_POINTS
        : -GRAND_TICHU_POINTS;
    }
  }

  return {
    teamPoints,
    tichuBonuses,
    totalRound: [
      teamPoints[0] + tichuBonuses[0],
      teamPoints[1] + tichuBonuses[1],
    ],
  };
}
