import { useRoomStore } from '../stores/roomStore.js';
import { useT } from '../i18n.js';

export function MatchmakingQueue() {
  const leaveMatchmaking = useRoomStore((s) => s.leaveMatchmaking);
  const queueInfo = useRoomStore((s) => s.queueInfo);

  const t = useT();
  const elapsed = queueInfo?.elapsed ?? 0;
  const playersInQueue = queueInfo?.playersInQueue ?? 1;
  const secondsElapsed = Math.floor(elapsed / 1000);
  const secondsRemaining = Math.max(0, 60 - secondsElapsed);

  return (
    <div className="queue-fullscreen">
      <div className="queue-bg-overlay" />
      <div className="queue-content">
        <div className="queue-card">
          <h2 className="queue-title">{t('matchmaking.searching')}</h2>

          <div className="queue-spinner">
            <div className="queue-spinner-ring" />
          </div>

          <div className="queue-info">
            <p className="queue-players">
              {playersInQueue === 1 ? t('matchmaking.playerInQueue') : t('matchmaking.playersInQueue', { count: playersInQueue })}
            </p>
            <p className="queue-timer">
              {secondsRemaining > 0
                ? t('matchmaking.startingIn', { seconds: secondsRemaining })
                : t('matchmaking.startingSoon')}
            </p>
          </div>

          <button className="btn btn-olympus btn-cancel" onClick={leaveMatchmaking}>
            {t('matchmaking.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
