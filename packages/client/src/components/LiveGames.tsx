import { useState, useEffect } from 'react';
import { useRoomStore } from '../stores/roomStore.js';

interface LiveGame {
  roomCode: string;
  players: Array<{ nickname: string; position: number; isBot: boolean }>;
  scores: [number, number];
  targetScore: number;
  phase: string;
  round: number;
  botDifficulty: string;
  startedAt: number;
}

export function LiveGames({ onBack }: { onBack: () => void }) {
  const [games, setGames] = useState<LiveGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const spectateRoom = useRoomStore((s) => s.spectateRoom);

  const fetchGames = async () => {
    try {
      const res = await fetch('/api/live-games');
      if (res.ok) {
        const data = await res.json();
        setGames(data);
        setError(null);
      } else {
        setError('Failed to load games');
      }
    } catch {
      setError('Connection failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGames();
    const interval = setInterval(fetchGames, 5000); // Refresh every 5s
    return () => clearInterval(interval);
  }, []);

  const humanPlayers = (g: LiveGame) => g.players.filter(p => !p.isBot);
  const botCount = (g: LiveGame) => g.players.filter(p => p.isBot).length;

  return (
    <div className="live-games">
      <div className="live-games-header">
        <h2>Live Games</h2>
        <button className="btn-link" onClick={onBack}>Back to Lobby</button>
      </div>

      {loading && <p className="live-games-status">Loading...</p>}
      {error && <p className="live-games-status error">{error}</p>}
      {!loading && games.length === 0 && (
        <p className="live-games-status">No active games right now</p>
      )}

      <div className="live-games-list">
        {games.map((g) => (
          <div key={g.roomCode} className="live-game-card">
            <div className="live-game-info">
              <div className="live-game-top">
                <span className="live-game-code">{g.roomCode}</span>
                <span className="live-game-phase">{formatPhase(g.phase)}</span>
                <span className="live-game-round">Round {g.round}</span>
              </div>
              <div className="live-game-scores">
                <span className="live-game-score">{g.scores[0]}</span>
                <span className="live-game-vs">—</span>
                <span className="live-game-score">{g.scores[1]}</span>
                <span className="live-game-target">/ {g.targetScore}</span>
              </div>
              <div className="live-game-players">
                {humanPlayers(g).map((p) => (
                  <span key={p.position} className="live-game-player">{p.nickname}</span>
                ))}
                {botCount(g) > 0 && (
                  <span className="live-game-bots">+{botCount(g)} bot{botCount(g) > 1 ? 's' : ''}</span>
                )}
              </div>
            </div>
            <button
              className="btn btn-olympus btn-spectate"
              onClick={() => spectateRoom(g.roomCode)}
            >
              Watch
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatPhase(phase: string): string {
  switch (phase) {
    case 'GRAND_TICHU': return 'Grand Tichu';
    case 'PASSING': return 'Passing';
    case 'PLAYING': return 'Playing';
    case 'DRAGON_GIVE': return 'Dragon Give';
    case 'ROUND_SCORING': return 'Scoring';
    case 'GAME_OVER': return 'Game Over';
    default: return phase;
  }
}
