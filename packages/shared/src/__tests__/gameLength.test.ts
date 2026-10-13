import { describe, expect, it } from 'vitest';
import { isQuickGame, normalizeTargetScore, QUICK_GAME, winningTeam } from '../gameLength.js';

describe('game length', () => {
  it('treats 0 as a one-round game and leaves real targets alone', () => {
    expect(isQuickGame(QUICK_GAME)).toBe(true);
    expect(isQuickGame(250)).toBe(false);
    expect(normalizeTargetScore(0)).toBe(0);
    expect(normalizeTargetScore(250)).toBe(250);
    expect(normalizeTargetScore(500)).toBe(500);
    expect(normalizeTargetScore(1000)).toBe(1000);
  });

  it('still keeps other scores inside 250 to 10000', () => {
    expect(normalizeTargetScore(100)).toBe(250);
    expect(normalizeTargetScore(99999)).toBe(10000);
    expect(normalizeTargetScore(750)).toBe(750);
    expect(normalizeTargetScore(Number.NaN)).toBe(1000);
    expect(normalizeTargetScore(undefined)).toBe(1000);
  });

  it('names the team with more points, and a tie when they match', () => {
    expect(winningTeam([120, 80])).toBe(0);
    expect(winningTeam([-50, 25])).toBe(1);
    expect(winningTeam([50, 50])).toBeNull();
  });
});
