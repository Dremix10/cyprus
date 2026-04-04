import type { PublicPlayerState } from '@cyprus/shared';

interface OpponentHandProps {
  player: PublicPlayerState;
  position: 'left' | 'top' | 'right';
  isCurrentTurn: boolean;
  isTeammate?: boolean;
}

export function OpponentHand({ player, position, isCurrentTurn, isTeammate }: OpponentHandProps) {
  return (
    <div className={`opponent-panel opponent-${position} ${isCurrentTurn ? 'opponent-active' : ''}`}>
      <div className="opponent-info">
        <span className={`opponent-name ${isTeammate ? 'name-teammate' : 'name-opponent'}`}>{player.nickname}</span>
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
      {player.collectedCards > 0 && (
        <div className="collected-pile">
          <div className="card card-back card-sm collected-card">
            <span className="collected-count">{player.collectedCards}</span>
          </div>
        </div>
      )}
    </div>
  );
}
