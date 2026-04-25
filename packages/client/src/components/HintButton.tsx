import { useGameStore } from '../stores/gameStore.js';

export function HintButton() {
  const gameState = useGameStore((s) => s.gameState);
  const hintStatus = useGameStore((s) => s.hintStatus);
  const hintError = useGameStore((s) => s.hintError);
  const hintRecommendedPass = useGameStore((s) => s.hintRecommendedPass);
  const requestHint = useGameStore((s) => s.requestHint);

  // Solo only, my turn, playing phase.
  if (!gameState) return null;
  if (!gameState.isSolo) return null;
  if (gameState.phase !== 'PLAYING') return null;
  if (gameState.currentPlayer !== gameState.myPosition) return null;
  if (gameState.isSpectator) return null;

  const disabled = hintStatus === 'loading' || hintStatus === 'used';
  const title =
    hintStatus === 'loading'
      ? 'Thinking…'
      : hintStatus === 'used'
        ? hintRecommendedPass
          ? 'Hint suggests passing'
          : 'Hint applied — recommended cards selected'
        : hintError ?? 'Get a hint (solo only)';

  return (
    <button
      className={`hint-btn ${hintStatus === 'used' ? 'hint-btn-used' : ''} ${hintStatus === 'loading' ? 'hint-btn-loading' : ''}`}
      onClick={() => requestHint()}
      disabled={disabled}
      title={title}
      aria-label="Hint"
    >
      <span className="hint-bulb" aria-hidden>{'💡'}</span>
      {hintStatus === 'used' && hintRecommendedPass && (
        <span className="hint-label">pass</span>
      )}
    </button>
  );
}
