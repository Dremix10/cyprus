import type { PublicPlayerState } from '@cyprus/shared';
import { CardComponent } from './CardComponent.js';
import { useAuthStore } from '../stores/authStore.js';
import { AddFriendButton } from './Friends.js';
import { useT } from '../i18n.js';

interface OpponentHandProps {
  player: PublicPlayerState;
  position: 'left' | 'top' | 'right';
  isCurrentTurn: boolean;
  isTeammate?: boolean;
  hasPassed?: boolean;
}

export function OpponentHand({ player, position, isCurrentTurn, isTeammate, hasPassed }: OpponentHandProps) {
  const t = useT();
  const hasRevealedHand = player.hand && player.hand.length > 0;
  const isDisconnected = player.connected === false;
  const authUser = useAuthStore((s) => s.user);
  const showAddFriend = authUser && player.userId && player.userId !== authUser.id;

  return (
    <div className={`opponent-panel opponent-${position} ${isCurrentTurn ? 'opponent-active' : ''} ${isDisconnected ? 'opponent-disconnected' : ''}`}>
      <div className="opponent-info">
        {player.avatar && (
          <img className={`player-avatar ${isDisconnected ? 'avatar-disconnected' : ''}`} src={player.avatar} alt={player.nickname} />
        )}
        <span className={`opponent-name ${isTeammate ? 'name-teammate' : 'name-opponent'}`}>{player.nickname}</span>
        {showAddFriend && <AddFriendButton userId={player.userId!} displayName={player.nickname} />}
        {isDisconnected && <span className="disconnect-badge">{t('opponent.offline')}</span>}
        {player.tichuCall !== 'none' && (
          <span className={`tichu-badge ${player.tichuCall === 'grand_tichu' ? 'tichu-badge-grand' : ''}`}>
            {player.tichuCall === 'grand_tichu' ? t('opponent.grandTichu') : t('opponent.tichu')}
          </span>
        )}
        {hasPassed && !player.isOut && (
          <span className="pass-badge">{t('opponent.pass')}</span>
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
            <span className="out-text">{t('opponent.out')}</span>
          ) : (
            <>
              <span className="card-count-num">{player.cardCount}</span>
              <span className="card-count-label">{t('opponent.cards')}</span>
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
