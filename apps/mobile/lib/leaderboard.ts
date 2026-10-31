/**
 * Public leaderboard fetch for the iPhone app.
 * Production returns a JSON array from GET /api/leaderboard. The request stays
 * a simple GET (Accept only) so iOS does not fail it, and a bad personal-stats
 * response cannot throw away rows that already loaded.
 */

export type LeaderboardRow = {
  user_id: number;
  username: string;
  display_name: string;
  games_played: number;
  games_won: number;
  games_lost: number;
  first_out_count: number;
  tichu_calls: number;
  tichu_successes: number;
  grand_tichu_calls: number;
  grand_tichu_successes: number;
  double_victories: number;
  total_rounds: number;
  disconnects: number;
  rating: number;
  elo: number;
  elo_peak: number;
  elo_games: number;
  is_bot?: number;
};

export type MyLeaderboardRow = LeaderboardRow & { rank: number };

export type LeaderboardHistoryEntry = {
  game_id: number;
  ended_at: string;
  won: boolean;
  /** Equal final scores (possible in a quick game). Never also `won`. */
  tied: boolean;
  myScore: number;
  opponentScore: number;
  botDifficulty: string | null;
};

export type LeaderboardLoad = {
  rows: LeaderboardRow[];
  mine: MyLeaderboardRow | null;
  history: LeaderboardHistoryEntry[];
};

export function leaderboardUrl(baseUrl: string, limit = 50): string {
  const root = baseUrl.trim().replace(/\/+$/, '');
  const url = new URL('/api/leaderboard', `${root}/`);
  const n = Number.isFinite(limit) ? Math.min(100, Math.max(1, Math.trunc(limit))) : 50;
  url.searchParams.set('limit', String(n));
  return url.toString();
}

/** Simple GET. No Content-Type, no Authorization, no custom client header. */
export function publicLeaderboardHeaders(): Record<string, string> {
  return { Accept: 'application/json' };
}

function num(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function botFlag(value: unknown): number | undefined {
  if (value == null) return undefined;
  return value === true || value === 1 || value === '1' ? 1 : 0;
}

function asRow(row: unknown): LeaderboardRow {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new Error('Leaderboard row is missing user_id');
  }
  const record = row as Record<string, unknown>;
  if (!('user_id' in record) || !Number.isFinite(num(record.user_id, NaN))) {
    throw new Error('Leaderboard row is missing user_id');
  }
  const username = typeof record.username === 'string' ? record.username : '';
  const displayName = typeof record.display_name === 'string' ? record.display_name.trim() : '';
  return {
    user_id: num(record.user_id),
    username,
    display_name: displayName || username || 'Player',
    games_played: num(record.games_played),
    games_won: num(record.games_won),
    games_lost: num(record.games_lost),
    first_out_count: num(record.first_out_count),
    tichu_calls: num(record.tichu_calls),
    tichu_successes: num(record.tichu_successes),
    grand_tichu_calls: num(record.grand_tichu_calls),
    grand_tichu_successes: num(record.grand_tichu_successes),
    double_victories: num(record.double_victories),
    total_rounds: num(record.total_rounds),
    disconnects: num(record.disconnects),
    rating: num(record.rating),
    elo: num(record.elo),
    elo_peak: num(record.elo_peak),
    elo_games: num(record.elo_games),
    is_bot: botFlag(record.is_bot),
  };
}

export function parseLeaderboard(payload: unknown): LeaderboardRow[] {
  if (!Array.isArray(payload)) throw new Error('Leaderboard response was not a list');
  return payload.map(asRow);
}

export function parseMine(payload: unknown): MyLeaderboardRow | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  try {
    return { ...asRow(payload), rank: num((payload as Record<string, unknown>).rank) };
  } catch {
    return null;
  }
}

export function parseHistory(payload: unknown): LeaderboardHistoryEntry[] {
  if (!Array.isArray(payload)) return [];
  const games: LeaderboardHistoryEntry[] = [];
  for (const item of payload) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const gameId = num(row.game_id, NaN);
    if (!Number.isFinite(gameId)) continue;
    const myScore = num(row.myScore);
    const opponentScore = num(row.opponentScore);
    // Older servers don't send `tied`; equal scores are a tie there too.
    const tied = typeof row.tied === 'boolean' ? row.tied : myScore === opponentScore;
    games.push({
      game_id: gameId,
      ended_at: typeof row.ended_at === 'string' ? row.ended_at : '',
      won: !tied && Boolean(row.won),
      tied,
      myScore,
      opponentScore,
      botDifficulty: typeof row.botDifficulty === 'string' ? row.botDifficulty : null,
    });
  }
  return games;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Leaderboard response was not JSON');
  }
}

async function readOptional<T>(settled: PromiseSettledResult<Response>, parse: (payload: unknown) => T): Promise<T | null> {
  if (settled.status !== 'fulfilled' || !settled.value.ok) return null;
  try {
    return parse(await readJson(settled.value));
  } catch {
    return null;
  }
}

export async function loadLeaderboard(options: {
  baseUrl: string;
  token?: string | null;
  signedIn: boolean;
  fetchImpl?: typeof fetch;
  limit?: number;
}): Promise<LeaderboardLoad> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(leaderboardUrl(options.baseUrl, options.limit ?? 50), {
    method: 'GET',
    headers: publicLeaderboardHeaders(),
    credentials: 'omit',
  });
  if (!response.ok) throw new Error('Leaderboard unavailable');
  const rows = parseLeaderboard(await readJson(response));

  let mine: MyLeaderboardRow | null = null;
  let history: LeaderboardHistoryEntry[] = [];
  if (options.signedIn) {
    const root = options.baseUrl.trim().replace(/\/+$/, '');
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (options.token) headers.Authorization = `Bearer ${options.token}`;
    const [mineRes, historyRes] = await Promise.allSettled([
      fetchImpl(`${root}/api/leaderboard/me`, { method: 'GET', headers, credentials: 'omit' }),
      fetchImpl(`${root}/api/leaderboard/history`, { method: 'GET', headers, credentials: 'omit' }),
    ]);
    mine = await readOptional(mineRes, parseMine);
    history = (await readOptional(historyRes, parseHistory)) ?? [];
  }
  return { rows, mine, history };
}
