import { useState } from 'react';
import { useRoomStore } from '../stores/roomStore.js';
import type { PlayerPosition } from '@cyprus/shared';

const TEAM_LABELS: Record<PlayerPosition, string> = {
  0: 'Team A',
  1: 'Team B',
  2: 'Team A',
  3: 'Team B',
};

export function WaitingRoom() {
  const roomCode = useRoomStore((s) => s.roomCode);
  const roomState = useRoomStore((s) => s.roomState);
  const nickname = useRoomStore((s) => s.nickname);
  const sitAt = useRoomStore((s) => s.sitAt);
  const startGame = useRoomStore((s) => s.startGame);
  const reset = useRoomStore((s) => s.reset);
  const error = useRoomStore((s) => s.error);
  const [copied, setCopied] = useState(false);

  const copyRoomCode = () => {
    if (roomCode) {
      navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!roomState) {
    return <div className="waiting-room">Connecting...</div>;
  }

  const myPlayer = roomState.players.find((p) => p.nickname === nickname);

  return (
    <div className="waiting-room">
      <div className="room-header">
        <h2>
          Room: {roomCode}
          <button className="btn-copy" onClick={copyRoomCode} title="Copy room code">
            {copied ? '✓' : '⧉'}
          </button>
        </h2>
        <button className="btn btn-small" onClick={reset}>
          Leave
        </button>
      </div>

      <p className="room-code-hint">
        Share this code with friends to join!
      </p>

      <div className="seats-grid">
        {([0, 1, 2, 3] as PlayerPosition[]).map((pos) => {
          const seated = roomState.players.find((p) => p.position === pos);
          const isMe = seated?.nickname === nickname;
          const isEmpty = !seated;

          return (
            <div
              key={pos}
              className={`seat ${isMe ? 'seat-me' : ''} ${isEmpty ? 'seat-empty' : ''}`}
              onClick={() => isEmpty && sitAt(pos)}
            >
              <div className="seat-label">{TEAM_LABELS[pos]}</div>
              <div className="seat-player">
                {seated ? (
                  <>
                    <span className="player-name">{seated.nickname}</span>
                    {!seated.connected && <span className="disconnected">(disconnected)</span>}
                  </>
                ) : (
                  <span className="empty-seat">Empty</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="waiting-actions">
        {roomState.isStartable && myPlayer && (
          <button className="btn btn-primary" onClick={startGame}>
            Start Game
          </button>
        )}
        {!roomState.isStartable && (
          <p className="info">Waiting for at least 2 players...</p>
        )}
        {roomState.isStartable && roomState.players.length < 4 && (
          <p className="info">Empty seats will be filled by bots</p>
        )}
      </div>

      {error && <p className="error">{error}</p>}
    </div>
  );
}
