import type { PublicPlayerState } from '@cyprus/shared';
import { CardComponent } from './CardComponent.js';

interface OpponentHandProps {
  player: PublicPlayerState;
  position: 'left' | 'top' | 'right';
  isCurrentTurn: boolean;
  isTeammate?: boolean;
  hasPassed?: boolean;
}

export function OpponentHand({ player, position, isCurrentTurn, isTeammate, hasPassed }: OpponentHandProps) {
  const hasRevealedHand = player.hand && player.hand.length > 0;

  return (
    <div className={`opponent-panel opponent-${position} ${isCurrentTurn ? 'opponent-active' : ''}`}>
      <div className="opponent-info">
        {player.avatar && (
          <img className="player-avatar" src={player.avatar} alt={player.nickname} />
        )}
        <span className={`opponent-name ${isTeammate ? 'name-teammate' : 'name-opponent'}`}>{player.nickname}</span>
        {player.tichuCall !== 'none' && (
          <span className={`tichu-badge ${player.tichuCall === 'grand_tichu' ? 'tichu-badge-grand' : ''}`}>
            {player.tichuCall === 'grand_tichu' ? 'GRAND TICHU' : 'TICHU'}
          </span>
        )}
        {hasPassed && !player.isOut && (
          <span className="pass-badge">PASS</span>
        )}
        {player.isOut && (
          <span className="out-badge">#{player.finishOrder}</span>
        )}
      </div>
      {hasRevealedHand ? (
        <div className="revealed-hand">
          {player.hand!.map((c) => (
            <CardComponent key={c.id} card={c} size="small" />
          ))}
        </div>
      ) : (
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
      )}
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
