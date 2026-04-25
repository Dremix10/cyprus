import { useState } from 'react';
import { useGameStore, type ReportableBotPlay } from '../stores/gameStore.js';
import { useAuthStore } from '../stores/authStore.js';

function botName(position: number): string {
  // Mirror the server's Greek-themed bot avatars; falls back to "Bot N" if unknown.
  const names = ['Bot Zeus', 'Bot Hera', 'Bot Athena', 'Bot Apollo'];
  return names[position] ?? `Bot ${position}`;
}

function relativeTime(at: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - at) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
}

export function ReportBotPlayButton() {
  const user = useAuthStore((s) => s.user);
  const plays = useGameStore((s) => s.reportableBotPlays);
  const [open, setOpen] = useState(false);

  if (!user) return null; // sign-in required to report

  return (
    <>
      <button
        className="btn btn-small btn-report-bot"
        onClick={() => setOpen(true)}
        title="Flag a bot play that looked wrong"
        disabled={plays.length === 0}
      >
        Report bot play
      </button>
      {open && <ReportBotPlayModal onClose={() => setOpen(false)} />}
    </>
  );
}

function ReportBotPlayModal({ onClose }: { onClose: () => void }) {
  const plays = useGameStore((s) => s.reportableBotPlays);
  const reportBotPlay = useGameStore((s) => s.reportBotPlay);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);

  return (
    <div className="report-bot-overlay" onClick={onClose}>
      <div className="report-bot-modal" onClick={(e) => e.stopPropagation()}>
        <div className="report-bot-header">
          <h3>Recent bot plays</h3>
          <button className="btn btn-small" onClick={onClose}>Close</button>
        </div>
        <p className="report-bot-hint">
          Click ⚑ next to a play that looked wrong. Reports help us improve the bots.
        </p>
        {plays.length === 0 ? (
          <p className="report-bot-empty">No bot plays this round yet.</p>
        ) : (
          <ul className="report-bot-list">
            {plays.map((p) => (
              <ReportRow
                key={p.eventId}
                play={p}
                isConfirming={confirmingId === p.eventId}
                onAskConfirm={() => setConfirmingId(p.eventId)}
                onCancelConfirm={() => setConfirmingId(null)}
                onSubmit={async () => {
                  setConfirmingId(null);
                  await reportBotPlay(p.eventId);
                }}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ReportRow({
  play,
  isConfirming,
  onAskConfirm,
  onCancelConfirm,
  onSubmit,
}: {
  play: ReportableBotPlay;
  isConfirming: boolean;
  onAskConfirm: () => void;
  onCancelConfirm: () => void;
  onSubmit: () => void;
}) {
  const sending = play.reportStatus === 'sending';
  const reported = play.reportStatus === 'reported';
  const errored = play.reportStatus === 'error';

  return (
    <li className="report-bot-row">
      <span className="report-bot-name">{botName(play.position)}</span>
      <span className="report-bot-summary">{play.combinationSummary}</span>
      <span className="report-bot-time">{relativeTime(play.at)}</span>
      {reported ? (
        <span className="report-bot-flagged">Reported</span>
      ) : isConfirming ? (
        <span className="report-bot-confirm">
          <button className="btn btn-small btn-primary" onClick={onSubmit} disabled={sending}>
            {sending ? '…' : 'Yes'}
          </button>
          <button className="btn btn-small" onClick={onCancelConfirm} disabled={sending}>
            No
          </button>
        </span>
      ) : (
        <button className="btn btn-small btn-flag" onClick={onAskConfirm} title="Report this play" disabled={sending}>
          ⚑
        </button>
      )}
      {errored && <span className="report-bot-error">{play.errorMessage ?? 'Failed'}</span>}
    </li>
  );
}
