import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildApiHeaders } from './http.ts';
import {
  leaderboardUrl,
  loadLeaderboard,
  parseLeaderboard,
  publicLeaderboardHeaders,
} from './leaderboard.ts';

const human = {
  user_id: 4,
  username: 'christos',
  display_name: 'Christos',
  games_played: 75,
  games_won: 40,
  games_lost: 35,
  first_out_count: 12,
  tichu_calls: 8,
  tichu_successes: 3,
  grand_tichu_calls: 2,
  grand_tichu_successes: 1,
  double_victories: 4,
  total_rounds: 200,
  disconnects: 0,
  rating: 1100,
  elo: 1121,
  elo_peak: 1200,
  elo_games: 70,
  is_bot: 0,
};

const bot = {
  user_id: -4,
  username: 'extreme-bot',
  display_name: 'Extreme Bot',
  games_played: 10,
  games_won: 6,
  games_lost: 4,
  first_out_count: 1,
  tichu_calls: 0,
  tichu_successes: 0,
  grand_tichu_calls: 0,
  grand_tichu_successes: 0,
  double_victories: 0,
  total_rounds: 20,
  disconnects: 0,
  rating: 1000,
  elo: 1040,
  elo_peak: 1040,
  elo_games: 10,
  is_bot: 1,
};

describe('leaderboard URL', () => {
  it('points at the production list with or without a trailing slash', () => {
    assert.equal(leaderboardUrl('https://aegist.dev'), 'https://aegist.dev/api/leaderboard?limit=50');
    assert.equal(leaderboardUrl('https://aegist.dev/'), 'https://aegist.dev/api/leaderboard?limit=50');
    assert.equal(leaderboardUrl('https://aegist.dev', 1000), 'https://aegist.dev/api/leaderboard?limit=100');
  });
});

describe('public leaderboard request', () => {
  it('is a simple GET with Accept only', () => {
    assert.deepEqual(publicLeaderboardHeaders(), { Accept: 'application/json' });
    const get = buildApiHeaders({ method: 'GET', token: 'secret' });
    assert.equal(get['Content-Type'], undefined);
    assert.equal(get.Authorization, 'Bearer secret');
    const post = buildApiHeaders({ method: 'POST', token: 'secret' });
    assert.equal(post['Content-Type'], 'application/json');
  });

  it('parses the production array, including bot ids', () => {
    const rows = parseLeaderboard([human, bot]);
    assert.equal(rows[0].display_name, 'Christos');
    assert.equal(rows[0].elo, 1121);
    assert.equal(rows[0].is_bot, 0);
    assert.equal(rows[1].user_id, -4);
    assert.equal(rows[1].display_name, 'Extreme Bot');
    assert.equal(rows[1].is_bot, 1);
  });

  it('rejects HTML and a non-array body', async () => {
    assert.throws(() => parseLeaderboard({ players: [human] }));
    await assert.rejects(() =>
      loadLeaderboard({
        baseUrl: 'https://aegist.dev',
        signedIn: false,
        fetchImpl: async () =>
          new Response('<!doctype html><html></html>', {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
          }),
      }),
    );
  });

  it('keeps the public rows when personal stats fail', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.includes('/api/leaderboard/me')) {
        return new Response('nope', { status: 500 });
      }
      if (url.includes('/api/leaderboard/history')) {
        return new Response('<!doctype html><html></html>', { status: 200, headers: { 'Content-Type': 'text/html' } });
      }
      return new Response(JSON.stringify([human, bot]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const loaded = await loadLeaderboard({
      baseUrl: 'https://aegist.dev/',
      token: 'phone-token',
      signedIn: true,
      fetchImpl,
    });

    assert.equal(loaded.rows.length, 2);
    assert.equal(loaded.rows[1].user_id, -4);
    assert.equal(loaded.mine, null);
    assert.deepEqual(loaded.history, []);

    const pub = calls[0];
    assert.equal(pub.url, 'https://aegist.dev/api/leaderboard?limit=50');
    assert.equal(pub.init?.method, 'GET');
    assert.equal(pub.init?.credentials, 'omit');
    assert.deepEqual(pub.init?.headers, { Accept: 'application/json' });
    const personal = calls[1].init?.headers as Record<string, string>;
    assert.equal(personal.Authorization, 'Bearer phone-token');
    assert.equal(personal['Content-Type'], undefined);
  });
});
