import type { RoundHistoryEntry } from '@cyprus/shared';
import { useT } from '../i18n.js';

interface ScoreHistoryProps {
  history: RoundHistoryEntry[];
  myTeam?: number;
  onClose?: () => void;
}

export function ScoreHistory({ history, myTeam = 0, onClose }: ScoreHistoryProps) {
  const t = useT();

  if (history.length === 0) {
    return (
      <div className="score-history">
        <p className="info">{t('score.noRounds')}</p>
      </div>
    );
  }

  return (
    <div className="score-history">
      <div className="score-history-header">
        <h3>{t('score.scoreHistory')}</h3>
        {onClose && (
          <button className="btn btn-small" onClick={onClose}>{t('score.close')}</button>
        )}
      </div>
      <div className="score-table-wrapper">
      <table className="score-table">
        <thead>
          <tr>
            <th>{t('score.round')}</th>
            <th className="name-teammate">{t('score.yourTeam')}</th>
            <th className="name-opponent">{t('score.opponents')}</th>
            <th>{t('score.notes')}</th>
          </tr>
        </thead>
        <tbody>
          {history.map((entry) => (
            <tr key={entry.round}>
              <td className="score-round-num">{entry.round}</td>
              <td className={`score-cell ${entry.teamScores[myTeam] > 0 ? 'score-positive' : ''} ${entry.teamScores[myTeam] < 0 ? 'score-negative' : ''}`}>
                <span className="score-delta">{entry.teamScores[myTeam] > 0 ? '+' : ''}{entry.teamScores[myTeam]}</span>
                <span className="score-total">{entry.runningTotals[myTeam]}</span>
              </td>
              <td className={`score-cell ${entry.teamScores[1 - myTeam] > 0 ? 'score-positive' : ''} ${entry.teamScores[1 - myTeam] < 0 ? 'score-negative' : ''}`}>
                <span className="score-delta">{entry.teamScores[1 - myTeam] > 0 ? '+' : ''}{entry.teamScores[1 - myTeam]}</span>
                <span className="score-total">{entry.runningTotals[1 - myTeam]}</span>
              </td>
              <td className="score-notes">
                {entry.doubleVictory !== null && (
                  <span className={`score-badge ${entry.doubleVictory === myTeam ? 'badge-team-a' : 'badge-team-b'}`}>
                    1-2
                  </span>
                )}
                {entry.tichuResults.map((t, i) => (
                  <span
                    key={i}
                    className={`score-badge ${t.success ? 'badge-success' : 'badge-fail'}`}
                  >
                    {t.call === 'grand_tichu' ? 'GT' : 'T'} {t.success ? '\u2713' : '\u2717'}
                  </span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
