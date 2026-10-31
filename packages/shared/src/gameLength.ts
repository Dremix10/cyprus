/** One round. The team with more points wins. */
export const QUICK_GAME = 0;

export const TARGET_PRESETS = [250, 500, 1000] as const;

export const GAME_LENGTHS = [QUICK_GAME, ...TARGET_PRESETS] as const;

/** Online matchmaking plays to one length for now, so the small player pool isn't split. */
export const MATCHMAKING_TARGET_SCORE = 500;

/** A quick game moves ELO by a third of a full game. */
export const QUICK_GAME_ELO_WEIGHT = 1 / 3;

export type GameLength = (typeof GAME_LENGTHS)[number];

export function isQuickGame(targetScore: number): boolean {
  return targetScore === QUICK_GAME;
}

/**
 * Keep a quick game as 0. Anything else stays inside the usual 250–10000 range.
 * A missing or nonsense value becomes the normal 1000-point game.
 */
export function normalizeTargetScore(raw: number | null | undefined): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 1000;
  if (raw === QUICK_GAME) return QUICK_GAME;
  const rounded = Math.round(raw);
  if (rounded < 250) return 250;
  if (rounded > 10000) return 10000;
  return rounded;
}

/** The team with more points, or null when the scores are equal. */
export function winningTeam(scores: [number, number]): 0 | 1 | null {
  if (scores[0] > scores[1]) return 0;
  if (scores[1] > scores[0]) return 1;
  return null;
}
