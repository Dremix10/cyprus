/** Production server. No localhost in a TestFlight build; override only for dev via EXPO_PUBLIC_SERVER_URL. */
export const BASE_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? 'https://aegist.dev';

export const DIFFICULTIES = ['easy', 'medium', 'hard', 'extreme', 'unfair'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const SCORE_OPTIONS = [250, 500, 1000] as const;
