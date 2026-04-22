import { useEffect, useState } from 'react';
import type { PublicPlayerState } from '@cyprus/shared';
import { CardComponent } from './CardComponent.js';
import { useAuthStore } from '../stores/authStore.js';
import { AddFriendButton } from './Friends.js';
import { PlayerAvatar } from './PlayerAvatar.js';
import { useT } from '../i18n.js';

interface OpponentHandProps {
  player: PublicPlayerState;
  position: 'left' | 'top' | 'right';
  isCurrentTurn: boolean;
  isTeammate?: boolean;
  hasPassed?: boolean;
  disconnectDeadline?: number;
}

function DisconnectCountdown({ deadline }: { deadline: number }) {
  const t = useT();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  if (seconds <= 0) return null;
  return <span className="disconnect-countdown">{t('opponent.replacedIn', { seconds })}</span>;
}

export function OpponentHand({ player, position, isCurrentTurn, isTeammate, hasPassed, disconnectDeadline }: OpponentHandProps) {
  const t = useT();
  const hasRevealedHand = player.hand && player.hand.length > 0;
  const isDisconnected = player.connected === false;
  const authUser = useAuthStore((s) => s.user);
  const showAddFriend = authUser && player.userId && player.userId !== authUser.id;

  return (
    <div className={`opponent-panel opponent-${position} ${isCurrentTurn ? 'opponent-active' : ''} ${isDisconnected ? 'opponent-disconnected' : ''}`}>
      <div className="opponent-info">
        {player.avatar && (
          <PlayerAvatar
            avatar={player.avatar}
            alt={player.nickname}
            className={`player-avatar ${isDisconnected ? 'avatar-disconnected' : ''}`}
          />
        )}
        <span className={`opponent-name ${isTeammate ? 'name-teammate' : 'name-opponent'}`}>{player.nickname}</span>
        {showAddFriend && <AddFriendButton userId={player.userId!} displayName={player.nickname} />}
        {isDisconnected && <span className="disconnect-badge">{t('opponent.offline')}</span>}
        {isDisconnected && disconnectDeadline && <DisconnectCountdown deadline={disconnectDeadline} />}
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
