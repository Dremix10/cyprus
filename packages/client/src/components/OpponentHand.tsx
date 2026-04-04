import type { PublicPlayerState } from '@cyprus/shared';

interface OpponentHandProps {
  player: PublicPlayerState;
  position: 'left' | 'top' | 'right';
  isCurrentTurn: boolean;
}

export function OpponentHand({ player, position, isCurrentTurn }: OpponentHandProps) {
  return (
    <div className={`opponent-panel opponent-${position} ${isCurrentTurn ? 'opponent-active' : ''}`}>
      <div className="opponent-info">
        <span className="opponent-name">{player.nickname}</span>
        {player.tichuCall !== 'none' && (
          <span className="tichu-badge">{player.tichuCall === 'grand_tichu' ? 'GT' : 'T'}</span>
        )}
        {player.isOut && (
          <span className="out-badge">#{player.finishOrder}</span>
        )}
      </div>
      <div className="opponent-card-count">
        {player.isOut ? (
          <span className="out-text">Out</span>
        ) : (
          <>
            <span className="card-count-num">{player.cardCount}</span>
            <span className="card-count-label">cards</span>
          </>
        )}
      </div>
    </div>
  );
}
