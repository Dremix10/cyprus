import { describe, expect, it } from 'vitest';
import { QUICK_GAME } from '@cyprus/shared';
import { matchGroupSize, takeMatchGroups } from '../MatchmakingManager.js';

function player(id: string, targetScore: number, joinedAt: number) {
  return { socketId: id, targetScore, joinedAt };
}

describe('matchmaking lengths', () => {
  it('starts four players of the same length immediately', () => {
    const now = 10_000;
    expect(matchGroupSize([0, 1, 2, 3], now)).toBe(4);
    const groups = takeMatchGroups(
      [0, 1, 2, 3].map((n) => player(`p${n}`, 500, n)),
      now,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(4);
  });

  it('does not seat a quick game with a 1000-point game', () => {
    const now = 0;
    const groups = takeMatchGroups(
      [
        player('a', QUICK_GAME, now),
        player('b', QUICK_GAME, now),
        player('c', 1000, now),
        player('d', 1000, now),
      ],
      now,
    );
    expect(groups).toHaveLength(0);
  });

  it('starts a one-round table on its own once that queue has waited', () => {
    const joined = 0;
    const groups = takeMatchGroups(
      [player('quick', QUICK_GAME, joined), player('long', 1000, joined)],
      60_000,
    );
    expect(groups).toEqual([
      [player('quick', QUICK_GAME, joined)],
      [player('long', 1000, joined)],
    ]);
  });

  it('waits the usual times before filling a short queue with bots', () => {
    expect(matchGroupSize([0, 0, 0], 29_000)).toBe(0);
    expect(matchGroupSize([0, 0, 0], 30_000)).toBe(3);
    expect(matchGroupSize([0, 0], 44_000)).toBe(0);
    expect(matchGroupSize([0, 0], 45_000)).toBe(2);
    expect(matchGroupSize([0], 59_000)).toBe(0);
    expect(matchGroupSize([0], 60_000)).toBe(1);
  });
});