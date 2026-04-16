import { useState } from 'react';
import { useRoomStore } from '../stores/roomStore.js';
import { useT } from '../i18n.js';
import type { PlayerPosition } from '@cyprus/shared';

export function WaitingRoom() {
  const t = useT();
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
    return <div className="waiting-room">{t('waiting.connecting')}</div>;
  }

  const TEAM_LABELS: Record<PlayerPosition, string> = {
    0: t('waiting.teamA'),
    1: t('waiting.teamB'),
    2: t('waiting.teamA'),
    3: t('waiting.teamB'),
  };

  const myPlayer = roomState.players.find((p) => p.nickname === nickname);

  return (
    <div className="waiting-room">
      <div className="room-header">
        <h2>
          {t('waiting.room', { code: roomCode || '' })}
          <button className="btn-copy" onClick={copyRoomCode} title="Copy room code">
            {copied ? '✓' : '⧉'}
          </button>
        </h2>
        <button className="btn btn-small" onClick={reset}>
          {t('waiting.leave')}
        </button>
      </div>

      <p className="room-code-hint">
        {t('waiting.shareCode')}
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
                    {!seated.connected && <span className="disconnected">{t('waiting.disconnected')}</span>}
                  </>
                ) : (
                  <span className="empty-seat">{t('waiting.empty')}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="waiting-actions">
        {roomState.isStartable && myPlayer && (
          <button className="btn btn-primary" onClick={startGame}>
            {t('waiting.startGame')}
          </button>
        )}
        {!roomState.isStartable && (
          <p className="info">{t('waiting.waitingForPlayers')}</p>
        )}
        {roomState.isStartable && roomState.players.length < 4 && (
          <p className="info">{t('waiting.emptySeats')}</p>
        )}
      </div>

      {error && <p className="error">{error}</p>}
    </div>
  );
}
