import { useState } from 'react';
import { useGameStore } from '../stores/gameStore.js';
import { useRoomStore } from '../stores/roomStore.js';
import type { PlayerPosition, RoundScoreBreakdown } from '@cyprus/shared';
import { getCardPoints, getRankLabel } from '@cyprus/shared';
import { CardComponent } from './CardComponent.js';
import { PlayerHand } from './PlayerHand.js';
import { PlayerAvatar } from './PlayerAvatar.js';
import { ScoreHistory } from './ScoreHistory.js';
import { useT } from '../i18n.js';

// ─── Shared Helpers ─────────────────────────────────────────────────

export function TichuCallBadges() {
  const gameState = useGameStore((s) => s.gameState)!;
  const callers = gameState.players.filter((p) => p.tichuCall !== 'none');
  if (callers.length === 0) return null;

  return (
    <div className="tichu-call-list">
      {callers.map((p) => (
        <div key={p.position} className="tichu-call-entry">
          <span className="tichu-call-name">{p.nickname}</span>
          <span className={`tichu-badge ${p.tichuCall === 'grand_tichu' ? 'tichu-badge-grand' : ''}`}>
            {p.tichuCall === 'grand_tichu' ? 'GRAND TICHU' : 'TICHU'}
          </span>
        </div>
      ))}
    </div>
  );
}

export function PointCards({ cards, team }: { cards: import('@cyprus/shared').Card[]; team: string }) {
  const totalPoints = cards.reduce((sum, c) => sum + getCardPoints(c), 0);
  const t = useT();

  return (
    <div className="point-cards-panel">
      <h4>{t('phase.pointCards', { team, points: totalPoints })}</h4>
      <div className="point-cards-grid">
        {cards.filter((c) => getCardPoints(c) !== 0).map((c) => {
          const pts = getCardPoints(c);
          return (
            <div key={c.id} className="point-card-entry">
              <CardComponent card={c} size="small" />
              <span className={`point-card-value${pts < 0 ? ' point-card-negative' : ''}`}>
                {pts > 0 ? `+${pts}` : pts}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ScoreBreakdown({ breakdown, players, myTeam }: {
  breakdown: RoundScoreBreakdown;
  players: { position: number; nickname: string; tichuCall: string }[];
  myTeam: number;
}) {
  const t = useT();
  const teams = [
    { label: t('game.yourTeam'), idx: myTeam, className: 'name-teammate' },
    { label: t('game.opponents'), idx: 1 - myTeam, className: 'name-opponent' },
  ];

  return (
    <div className="score-breakdown">
      {teams.map(({ label, idx, className }) => (
        <div key={idx} className="breakdown-team">
          <h4 className={className}>{label}</h4>
          <div className="breakdown-line">{t('phase.cardPoints', { points: breakdown.cardPoints[idx] })}</div>
          {breakdown.doubleVictory === idx && (
            <div className="breakdown-line breakdown-highlight">{t('phase.doubleVictory')}</div>
          )}
          {breakdown.tichuResults
            .filter((r) => r.team === idx)
            .map((r, i) => {
              const player = players.find((p) => p.position === r.position);
              const label2 = r.call === 'grand_tichu' ? 'Grand Tichu' : 'Tichu';
              const points = r.call === 'grand_tichu' ? 200 : 100;
              return (
                <div key={i} className={`breakdown-line ${r.success ? 'breakdown-highlight' : 'breakdown-penalty'}`}>
                  {player?.nickname}: {label2} {r.success ? `+${points}` : `-${points}`}
                </div>
              );
            })}
        </div>
      ))}
    </div>
  );
}

// ─── Grand Tichu Phase ──────────────────────────────────────────────

export function GrandTichuView() {
  const t = useT();
  const gameState = useGameStore((s) => s.gameState)!;
  const grandTichuDecision = useGameStore((s) => s.grandTichuDecision);
  const selectedCards = useGameStore((s) => s.selectedCards);
  const toggleCard = useGameStore((s) => s.toggleCard);
  const [confirming, setConfirming] = useState(false);

  if (!gameState.grandTichuPending) {
    const myTeam = gameState.myPosition % 2;
    const waiting = gameState.players.filter((p) => !p.grandTichuDecided);
    const names = waiting.map((p) => p.nickname).join(', ');
    return (
      <p className="info">
        {t('phase.waitingFor', { names })}
      </p>
    );
  }

  return (
    <div className="phase-view">
      <h3>{t('phase.grandTichuQuestion')}</h3>
      <p className="info">{t('phase.seen8Cards')}</p>
      <PlayerHand cards={gameState.myHand} selectedCards={selectedCards} onToggle={toggleCard} interactive={false} />
      <div className="btn-group">
        {confirming ? (
          <>
            <span className="confirm-label">{t('phase.callGrandTichu')}</span>
            <button className="btn btn-tichu" onClick={() => grandTichuDecision(true)}>{t('game.yesCallIt')}</button>
            <button className="btn btn-secondary" onClick={() => setConfirming(false)}>{t('game.cancel')}</button>
          </>
        ) : (
          <>
            <button className="btn btn-tichu" onClick={() => setConfirming(true)}>{t('phase.callGrandTichuBtn')}</button>
            <button className="btn btn-secondary" onClick={() => grandTichuDecision(false)}>{t('phase.pass')}</button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Passing Phase ──────────────────────────────────────────────────

function getRelativePositions(myPos: PlayerPosition) {
  return {
    right: ((myPos + 1) % 4) as PlayerPosition,
    top: ((myPos + 2) % 4) as PlayerPosition,
    left: ((myPos + 3) % 4) as PlayerPosition,
  };
}

export function PassingView() {
  const t = useT();
  const gameState = useGameStore((s) => s.gameState)!;
  const passCards = useGameStore((s) => s.passCards);
  const undoPassCards = useGameStore((s) => s.undoPassCards);
  const callTichu = useGameStore((s) => s.callTichu);
  const hasPassed = gameState.players[gameState.myPosition]?.hasPassed;
  const myInfo = gameState.players[gameState.myPosition];
  const canCallTichu = myInfo?.tichuCall === 'none' && !gameState.hasPlayedCards;
  const readyCount = gameState.players.filter((p) => p.hasPassed).length;

  const rel = getRelativePositions(gameState.myPosition);
  const leftPlayer = gameState.players[rel.left];
  const acrossPlayer = gameState.players[rel.top];
  const rightPlayer = gameState.players[rel.right];

  const [tichuConfirm, setTichuConfirm] = useState(false);
  const [assignments, setAssignments] = useState<{
    left: string | null; across: string | null; right: string | null;
  }>({ left: null, across: null, right: null });
  const [activeCard, setActiveCard] = useState<string | null>(null);

  if (hasPassed) {
    const waiting = gameState.players.filter((p) => !p.hasPassed);
    const names = waiting.map((p) => p.nickname).join(', ');
    return (
      <div className="phase-view">
        <TichuCallBadges />
        <div className="pass-ready-counter">{readyCount}/4 ready</div>
        <p className="info">
          {t('phase.waitingFor', { names })}
        </p>
        <button className="btn btn-secondary" onClick={() => { undoPassCards(); setAssignments({ left: null, across: null, right: null }); }}>
          Change Cards
        </button>
      </div>
    );
  }

  const assignedCardIds = new Set(
    [assignments.left, assignments.across, assignments.right].filter(Boolean) as string[]
  );

  const handleCardClick = (cardId: string) => {
    if (assignments.left === cardId) { setAssignments((a) => ({ ...a, left: null })); setActiveCard(null); return; }
    if (assignments.across === cardId) { setAssignments((a) => ({ ...a, across: null })); setActiveCard(null); return; }
    if (assignments.right === cardId) { setAssignments((a) => ({ ...a, right: null })); setActiveCard(null); return; }
    setActiveCard(activeCard === cardId ? null : cardId);
  };

  const handleSlotClick = (slot: 'left' | 'across' | 'right') => {
    if (!activeCard) return;
    setAssignments((a) => ({ ...a, [slot]: activeCard }));
    setActiveCard(null);
  };

  const handleSlotRemove = (slot: 'left' | 'across' | 'right') => {
    setAssignments((a) => ({ ...a, [slot]: null }));
  };

  const canPass = assignments.left && assignments.across && assignments.right;
  const isTeammate = (pos: PlayerPosition) => pos % 2 === gameState.myPosition % 2;

  return (
    <div className="phase-view">
      <TichuCallBadges />
      <div className="pass-ready-counter">{readyCount}/4 ready</div>
      <h3>{t('phase.passCards')}</h3>
      <p className="info">
        {activeCard ? t('phase.nowClickPlayer') : t('phase.clickCardThenPlayer')}
      </p>

      <div className="pass-zones">
        {([
          { slot: 'left' as const, player: leftPlayer, pos: rel.left },
          { slot: 'across' as const, player: acrossPlayer, pos: rel.top },
          { slot: 'right' as const, player: rightPlayer, pos: rel.right },
        ]).map(({ slot, player, pos }) => {
          const assignedId = assignments[slot];
          const assignedCard = assignedId ? gameState.myHand.find((c) => c.id === assignedId) : null;
          const teammate = isTeammate(pos);

          return (
            <div key={slot} className={`pass-zone ${teammate ? 'pass-zone-teammate' : 'pass-zone-opponent'} ${activeCard && !assignedId ? 'pass-zone-active' : ''}`} onClick={() => !assignedId && handleSlotClick(slot)}>
              <div className="pass-zone-header">
                {player.avatar && <PlayerAvatar avatar={player.avatar} alt={player.nickname} className="pass-zone-avatar" />}
                <span className={`pass-zone-name ${teammate ? 'name-teammate' : 'name-opponent'}`}>{player.nickname}</span>
                <span className="pass-zone-relation">{teammate ? t('phase.partner') : t('phase.opponent')}</span>
              </div>
              <div className="pass-zone-card">
                {assignedCard ? (
                  <div className="pass-zone-assigned" onClick={(e) => { e.stopPropagation(); handleSlotRemove(slot); }}>
                    <CardComponent card={assignedCard} size="small" />
                    <span className="pass-zone-remove">✕</span>
                  </div>
                ) : (
                  <div className="pass-zone-empty">{activeCard ? t('phase.clickToAssign') : t('phase.empty')}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="pass-hand">
        {gameState.myHand.map((card) => {
          const isAssigned = assignedCardIds.has(card.id);
          const isActive = activeCard === card.id;
          return (
            <div key={card.id} className={`pass-hand-card ${isAssigned ? 'pass-hand-assigned' : ''} ${isActive ? 'pass-hand-active' : ''}`} onClick={() => !isAssigned && handleCardClick(card.id)}>
              <CardComponent card={card} size="normal" />
            </div>
          );
        })}
      </div>

      <div className="btn-group">
        {canPass && (
          <button className="btn btn-primary" onClick={() => passCards({ left: assignments.left!, across: assignments.across!, right: assignments.right! })}>
            {t('phase.passCards')}
          </button>
        )}
        {canCallTichu && !tichuConfirm && (
          <button className="btn btn-tichu" onClick={() => setTichuConfirm(true)}>{t('phase.callTichuBtn')}</button>
        )}
        {canCallTichu && tichuConfirm && (
          <>
            <span className="confirm-label">{t('phase.callTichuQuestion')}</span>
            <button className="btn btn-tichu" onClick={callTichu}>{t('game.yesCallIt')}</button>
            <button className="btn btn-secondary" onClick={() => setTichuConfirm(false)}>{t('game.cancel')}</button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Round Scoring Phase ────────────────────────────────────────────

export function ScoringView() {
  const t = useT();
  const gameState = useGameStore((s) => s.gameState)!;
  const nextRound = useGameStore((s) => s.nextRound);
  const myTeam = gameState.myPosition % 2 === 0 ? 0 : 1;

  return (
    <div className="scoring-layout">
      {gameState.roundTrickCards && <PointCards cards={gameState.roundTrickCards[myTeam]} team={t('game.yourTeam')} />}

      <div className="phase-view">
        <h3>{t('phase.roundOver')}</h3>
        {gameState.roundBreakdown && (
          <ScoreBreakdown breakdown={gameState.roundBreakdown} players={gameState.players} myTeam={myTeam} />
        )}
        <div className="scores">
          <div className="score-row">
            <span className="score-team name-teammate">{t('game.yourTeam')}</span>
            <span className="score-round">+{gameState.roundScores[myTeam]}</span>
            <span className="score-total">{gameState.scores[myTeam]}</span>
          </div>
          <div className="score-row">
            <span className="score-team name-opponent">{t('game.opponents')}</span>
            <span className="score-round">+{gameState.roundScores[1 - myTeam]}</span>
            <span className="score-total">{gameState.scores[1 - myTeam]}</span>
          </div>
        </div>
        {gameState.roundHistory && gameState.roundHistory.length > 1 && (
          <ScoreHistory history={gameState.roundHistory} myTeam={myTeam} />
        )}
        {!gameState.isSpectator && (
          <button className="btn btn-primary" onClick={nextRound}>{t('phase.nextRound')}</button>
        )}
      </div>

      {gameState.roundTrickCards && <PointCards cards={gameState.roundTrickCards[1 - myTeam]} team={t('game.opponents')} />}
    </div>
  );
}

// ─── Game Over Phase ────────────────────────────────────────────────

export function GameOverView() {
  const t = useT();
  const gameState = useGameStore((s) => s.gameState)!;
  const reset = useRoomStore((s) => s.reset);
  const myTeam = gameState.myPosition % 2 === 0 ? 0 : 1;
  const winnerTeam = gameState.scores[0] >= gameState.targetScore ? 0 : 1;
  const iWon = winnerTeam === myTeam;

  const finishPlayers = gameState.finishOrder.map((pos, i) => ({
    position: pos,
    nickname: gameState.players[pos]?.nickname ?? `Player ${pos}`,
    order: i + 1,
    isTeammate: pos % 2 === myTeam % 2,
  }));

  const tichuCallers = gameState.players.filter((p) => p.tichuCall !== 'none');

  return (
    <div className={`phase-view game-over-view ${iWon ? 'game-over-win' : 'game-over-loss'}`}>
      <div className="game-over-banner">
        <h2 className={iWon ? 'winner' : 'loser'}>{iWon ? t('phase.victory') : t('phase.defeat')}</h2>
        <p className="game-over-subtitle">{iWon ? t('phase.yourTeamWins') : t('phase.opponentsWin')}</p>
      </div>

      <div className="scores">
        <div className="score-row">
          <span className="score-team name-teammate">{t('game.yourTeam')}</span>
          <span className="score-total">{gameState.scores[myTeam]}</span>
        </div>
        <div className="score-row">
          <span className="score-team name-opponent">{t('game.opponents')}</span>
          <span className="score-total">{gameState.scores[1 - myTeam]}</span>
        </div>
      </div>

      {finishPlayers.length > 0 && (
        <div className="game-over-finish">
          <h4>{t('phase.finishOrder')}</h4>
          <div className="finish-list">
            {finishPlayers.map((p) => (
              <div key={p.position} className={`finish-entry ${p.isTeammate ? 'name-teammate' : 'name-opponent'}`}>
                <span className="finish-order">#{p.order}</span>
                <span>{p.nickname}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tichuCallers.length > 0 && (
        <div className="game-over-tichu">
          {tichuCallers.map((p) => (
            <div key={p.position} className="tichu-result-entry">
              <span>{p.nickname}</span>
              <span className={`tichu-badge ${p.tichuCall === 'grand_tichu' ? 'tichu-badge-grand' : ''}`}>
                {p.tichuCall === 'grand_tichu' ? 'GRAND TICHU' : 'TICHU'}
              </span>
            </div>
          ))}
        </div>
      )}

      {gameState.roundHistory && gameState.roundHistory.length > 0 && (
        <ScoreHistory history={gameState.roundHistory} myTeam={myTeam} />
      )}

      <button className="btn btn-primary btn-play-again" onClick={reset}>
        {gameState.isSpectator ? 'Back to Games' : t('phase.backToLobby')}
      </button>
    </div>
  );
}
