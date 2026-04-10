import { useState, useEffect } from 'react';
import type { LeaderboardEntry, MyLeaderboardStats } from '@cyprus/shared';
import { useAuthStore } from '../stores/authStore.js';

type GameHistoryEntry = {
  game_id: number;
  ended_at: string;
  won: boolean;
  myScore: number;
  opponentScore: number;
  botDifficulty: string | null;
};

export function Leaderboard({ onBack }: { onBack: () => void }) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [myStats, setMyStats] = useState<MyLeaderboardStats | null>(null);
  const [gameHistory, setGameHistory] = useState<GameHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const authUser = useAuthStore((s) => s.user);

  useEffect(() => {
    setLoading(true);
    const fetches: Promise<void>[] = [
      fetch('/api/leaderboard?limit=50')
        .then((r) => r.json())
        .then((data) => setEntries(data)),
    ];
    if (authUser) {
      fetches.push(
        fetch('/api/leaderboard/me')
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => setMyStats(data)),
        fetch('/api/leaderboard/history')
          .then((r) => (r.ok ? r.json() : []))
          .then((data) => setGameHistory(data)),
      );
    }
    Promise.all(fetches).finally(() => setLoading(false));
  }, [authUser]);

  const winRate = (e: LeaderboardEntry) =>
    e.games_played > 0 ? Math.round((e.games_won / e.games_played) * 100) : 0;

  return (
    <div className="leaderboard-fullscreen">
      <div className="lobby-bg-clouds" />
      <div className="lobby-bg-overlay" />

      <div className="leaderboard-content">
        <div className="leaderboard-header">
          <h1 className="title-greek">Leaderboard</h1>
          <p className="subtitle-greek">Hall of Champions</p>
        </div>

        {myStats && myStats.games_played > 0 && (
          <div className="leaderboard-my-stats">
            <h3>Your Stats</h3>
            <div className="my-stats-grid">
              <div className="stat-item">
                <span className="stat-value">{myStats.rank > 0 ? `#${myStats.rank}` : 'Unranked'}</span>
                <span className="stat-label">Rank</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{Math.round(myStats.rating)}</span>
                <span className="stat-label">Rating</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{myStats.games_won}/{myStats.games_played}</span>
                <span className="stat-label">W/L</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{winRate(myStats)}%</span>
                <span className="stat-label">Win Rate</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">
                  {myStats.tichu_calls > 0
                    ? `${myStats.tichu_successes}/${myStats.tichu_calls}`
                    : '—'}
                </span>
                <span className="stat-label">Tichu</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">
                  {myStats.grand_tichu_calls > 0
                    ? `${myStats.grand_tichu_successes}/${myStats.grand_tichu_calls}`
                    : '—'}
                </span>
                <span className="stat-label">Grand</span>
              </div>
            </div>
            {gameHistory.length > 0 && (
              <div className="game-history-row">
                <span className="stat-label">Recent</span>
                <div className="game-history-dots">
                  {gameHistory.map((g) => (
                    <span
                      key={g.game_id}
                      className={`game-dot ${g.won ? 'game-dot-win' : 'game-dot-loss'}`}
                      title={`${g.won ? 'Win' : 'Loss'} — ${g.myScore}-${g.opponentScore}${g.botDifficulty ? ` (${g.botDifficulty} bots)` : ''}`}
                    >
                      {g.won ? 'W' : 'L'}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {loading ? (
          <p className="leaderboard-loading">Loading...</p>
        ) : entries.length === 0 ? (
          <p className="leaderboard-empty">No ranked players yet. Play at least 3 online games to appear!</p>
        ) : (
          <div className="leaderboard-table-wrapper">
            <table className="leaderboard-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Player</th>
                  <th>Rating</th>
                  <th>W/L</th>
                  <th>Win%</th>
                  <th>1st Out</th>
                  <th>Tichu</th>
                  <th>Grand</th>
                  <th>DV</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr
                    key={e.user_id}
                    className={
                      myStats && e.user_id === myStats.user_id ? 'leaderboard-row-me' : ''
                    }
                  >
                    <td className="rank-cell">
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                    </td>
                    <td className="name-cell">{e.display_name}</td>
                    <td className="rating-cell">{Math.round(e.rating)}</td>
                    <td>{e.games_won}/{e.games_played}</td>
                    <td>{winRate(e)}%</td>
                    <td>{e.first_out_count}</td>
                    <td>
                      {e.tichu_calls > 0
                        ? `${e.tichu_successes}/${e.tichu_calls}`
                        : '—'}
                    </td>
                    <td>
                      {e.grand_tichu_calls > 0
                        ? `${e.grand_tichu_successes}/${e.grand_tichu_calls}`
                        : '—'}
                    </td>
                    <td>{e.double_victories}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <button className="btn btn-olympus btn-back-lobby" onClick={onBack}>
          Back to Lobby
        </button>
      </div>
    </div>
  );
}
