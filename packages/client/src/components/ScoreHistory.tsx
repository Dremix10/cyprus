import type { RoundHistoryEntry } from '@cyprus/shared';

interface ScoreHistoryProps {
  history: RoundHistoryEntry[];
  onClose?: () => void;
}

export function ScoreHistory({ history, onClose }: ScoreHistoryProps) {
  if (history.length === 0) {
    return (
      <div className="score-history">
        <p className="info">No rounds played yet.</p>
      </div>
    );
  }

  return (
    <div className="score-history">
      <div className="score-history-header">
        <h3>Score History</h3>
        {onClose && (
          <button className="btn btn-small" onClick={onClose}>Close</button>
        )}
      </div>
      <div className="score-table-wrapper">
      <table className="score-table">
        <thead>
          <tr>
            <th>Round</th>
            <th className="name-teammate">Team A</th>
            <th className="name-opponent">Team B</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {history.map((entry) => (
            <tr key={entry.round}>
              <td className="score-round-num">{entry.round}</td>
              <td className={`score-cell ${entry.teamScores[0] > 0 ? 'score-positive' : ''} ${entry.teamScores[0] < 0 ? 'score-negative' : ''}`}>
                <span className="score-delta">{entry.teamScores[0] > 0 ? '+' : ''}{entry.teamScores[0]}</span>
                <span className="score-total">{entry.runningTotals[0]}</span>
              </td>
              <td className={`score-cell ${entry.teamScores[1] > 0 ? 'score-positive' : ''} ${entry.teamScores[1] < 0 ? 'score-negative' : ''}`}>
                <span className="score-delta">{entry.teamScores[1] > 0 ? '+' : ''}{entry.teamScores[1]}</span>
                <span className="score-total">{entry.runningTotals[1]}</span>
              </td>
              <td className="score-notes">
                {entry.doubleVictory !== null && (
                  <span className={`score-badge ${entry.doubleVictory === 0 ? 'badge-team-a' : 'badge-team-b'}`}>
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
