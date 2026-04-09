import { useRoomStore } from '../stores/roomStore.js';

export function MatchmakingQueue() {
  const leaveMatchmaking = useRoomStore((s) => s.leaveMatchmaking);
  const queueInfo = useRoomStore((s) => s.queueInfo);

  const elapsed = queueInfo?.elapsed ?? 0;
  const playersInQueue = queueInfo?.playersInQueue ?? 1;
  const secondsElapsed = Math.floor(elapsed / 1000);
  const secondsRemaining = Math.max(0, 60 - secondsElapsed);

  return (
    <div className="queue-fullscreen">
      <div className="queue-bg-overlay" />
      <div className="queue-content">
        <div className="queue-card">
          <h2 className="queue-title">Searching for Players</h2>

          <div className="queue-spinner">
            <div className="queue-spinner-ring" />
          </div>

          <div className="queue-info">
            <p className="queue-players">
              {playersInQueue} {playersInQueue === 1 ? 'player' : 'players'} in queue
            </p>
            <p className="queue-timer">
              {secondsRemaining > 0
                ? `Starting in ${secondsRemaining}s or when 4 players ready`
                : 'Starting soon...'}
            </p>
          </div>

          <button className="btn btn-olympus btn-cancel" onClick={leaveMatchmaking}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
