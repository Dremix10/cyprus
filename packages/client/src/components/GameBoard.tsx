import { useState, useEffect, useCallback } from 'react';
import { useGameStore } from '../stores/gameStore.js';
import { useRoomStore } from '../stores/roomStore.js';
import { GamePhase, SpecialCardType, CombinationType, getRankLabel, sortCards } from '@cyprus/shared';
import type { Card, Combination, PlayerPosition } from '@cyprus/shared';

/** Sort cards for display: Phoenix placed at its effective position in the combo. */
function sortForDisplay(combo: Combination): Card[] {
  if (combo.type === CombinationType.FULL_HOUSE) {
    const rankCounts = new Map<number, Card[]>();
    for (const c of combo.cards) {
      const rank = c.type === 'normal' ? c.rank : 0;
      const group = rankCounts.get(rank) ?? [];
      group.push(c);
      rankCounts.set(rank, group);
    }
    const groups = [...rankCounts.values()].sort((a, b) => b.length - a.length);
    return groups.flat();
  }

  // For combos with Phoenix, figure out the gap it fills and sort it there
  const phoenix = combo.cards.find((c) => c.type === 'special' && c.specialType === SpecialCardType.PHOENIX);
  if (phoenix && combo.cards.length > 1) {
    const others = combo.cards.filter((c) => c !== phoenix);
    const sorted = sortCards(others);
    const ranks = sorted.map((c) => c.type === 'normal' ? c.rank : (c.specialType === SpecialCardType.MAHJONG ? 1 : 0));

    // Find the gap in the sequence (for straights) or the rank Phoenix substitutes
    if (combo.type === CombinationType.STRAIGHT) {
      // Find missing rank in the straight sequence
      const minRank = Math.min(...ranks);
      const maxRank = Math.max(...ranks);
      let gapIdx = sorted.length; // default: append at end
      for (let r = minRank; r <= maxRank; r++) {
        if (!ranks.includes(r)) {
          // Phoenix fills this rank — insert at this position
          gapIdx = sorted.findIndex((c) => (c.type === 'normal' ? c.rank : 1) > r);
          if (gapIdx === -1) gapIdx = sorted.length;
          break;
        }
      }
      // If no gap found (Phoenix extends the straight), put it at the end
      sorted.splice(gapIdx, 0, phoenix);
      return sorted;
    }

    // For pairs/triples: Phoenix matches the rank of the others
    // Sort it next to its pair/triple partners
    sorted.push(phoenix);
    return sorted;
  }

  return sortCards(combo.cards);
}
import { CardComponent } from './CardComponent.js';
import { PlayerHand } from './PlayerHand.js';
import { OpponentHand } from './OpponentHand.js';
import { WishSelector } from './WishSelector.js';
import { ScoreHistory } from './ScoreHistory.js';
import { GrandTichuView, PassingView, ScoringView, GameOverView, TichuCallBadges, PointCards, ScoreBreakdown } from './PhaseViews.js';
import { isMuted, setMuted } from '../sounds.js';

function getRelativePositions(myPos: PlayerPosition) {
  return {
    right: ((myPos + 1) % 4) as PlayerPosition,
    top: ((myPos + 2) % 4) as PlayerPosition,
    left: ((myPos + 3) % 4) as PlayerPosition,
  };
}

function SoundToggle() {
  const [muted, setMutedState] = useState(isMuted);
  const toggle = useCallback(() => {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
  }, [muted]);

  return (
    <button className="sound-toggle" onClick={toggle} title={muted ? 'Unmute' : 'Mute'}>
      {muted ? '\uD83D\uDD07' : '\uD83D\uDD0A'}
    </button>
  );
}

export function GameBoard() {
  const gameState = useGameStore((s) => s.gameState);
  const error = useGameStore((s) => s.error);
  const roomNotification = useRoomStore((s) => s.error);
  const roomCode = useRoomStore((s) => s.roomCode);
  const reset = useRoomStore((s) => s.reset);
  const [showHistory, setShowHistory] = useState(false);
  const [leaveConfirm, setLeaveConfirm] = useState(false);

  if (!gameState) {
    return <div className="game-board">Loading game...</div>;
  }

  const rel = getRelativePositions(gameState.myPosition);
  const myTeam = gameState.myPosition % 2 === 0 ? 0 : 1;
  const hasHistory = gameState.roundHistory && gameState.roundHistory.length > 0;

  return (
    <div className="game-board">
      {roomNotification && (
        <div className={`game-toast ${roomNotification.includes('disconnected') ? 'game-toast-warn' : 'game-toast-info'}`}>
          {roomNotification}
        </div>
      )}
      <div className="game-info">
        <span className="name-teammate">
          Your Team: {gameState.scores[myTeam]} / {gameState.targetScore}
        </span>
        <span className="phase-label">
          {roomCode && <span className="room-code-badge">{roomCode}</span>}
          {formatPhase(gameState.phase)}
          <SoundToggle />
          {hasHistory && (
            <button className="history-btn" onClick={() => setShowHistory(true)} title="Score History">
              {'\uD83D\uDCCA'}
            </button>
          )}
          <button className="leave-btn" onClick={() => setLeaveConfirm(true)}>
            Exit
          </button>
        </span>
        <span className="name-opponent">
          Opponents: {gameState.scores[1 - myTeam]} / {gameState.targetScore}
        </span>
      </div>

      {showHistory && gameState.roundHistory && (
        <div className="history-modal-overlay" onClick={() => setShowHistory(false)}>
          <div className="history-modal" onClick={(e) => e.stopPropagation()}>
            <ScoreHistory history={gameState.roundHistory} myTeam={myTeam} onClose={() => setShowHistory(false)} />
          </div>
        </div>
      )}

      {leaveConfirm && (
        <div className="history-modal-overlay" onClick={() => setLeaveConfirm(false)}>
          <div className="leave-modal" onClick={(e) => e.stopPropagation()}>
            <p>Are you sure you want to leave the game?</p>
            <div className="leave-modal-buttons">
              <button className="btn btn-danger" onClick={reset}>Yes, leave</button>
              <button className="btn btn-secondary" onClick={() => setLeaveConfirm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {gameState.phase === GamePhase.GRAND_TICHU && <GrandTichuView />}
      {gameState.phase === GamePhase.PASSING && <PassingView />}
      {(gameState.phase === GamePhase.PLAYING ||
        gameState.phase === GamePhase.DRAGON_GIVE) && (
        <PlayingLayout rel={rel} />
      )}
      {gameState.phase === GamePhase.ROUND_SCORING && <ScoringView />}
      {gameState.phase === GamePhase.GAME_OVER && <GameOverView />}
    </div>
  );
}

function formatPhase(phase: GamePhase): string {
  switch (phase) {
    case GamePhase.GRAND_TICHU: return 'Grand Tichu';
    case GamePhase.PASSING: return 'Card Passing';
    case GamePhase.PLAYING: return 'Playing';
    case GamePhase.DRAGON_GIVE: return 'Dragon Give';
    case GamePhase.ROUND_SCORING: return 'Round Over';
    case GamePhase.GAME_OVER: return 'Game Over';
    default: return phase;
  }
}

function TurnTimer({ deadline }: { deadline: number }) {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
  );

  useEffect(() => {
    setSecondsLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0) clearInterval(interval);
    }, 250);
    return () => clearInterval(interval);
  }, [deadline]);

  const urgent = secondsLeft <= 10;

  return (
    <span className={`turn-timer ${urgent ? 'turn-timer-urgent' : ''}`}>
      {secondsLeft}s
    </span>
  );
}

function PlayingLayout({
  rel,
}: {
  rel: { left: PlayerPosition; top: PlayerPosition; right: PlayerPosition };
}) {
  const gameState = useGameStore((s) => s.gameState)!;
  const selectedCards = useGameStore((s) => s.selectedCards);
  const toggleCard = useGameStore((s) => s.toggleCard);
  const playCards = useGameStore((s) => s.playCards);
  const passTurn = useGameStore((s) => s.passTurn);
  const callTichu = useGameStore((s) => s.callTichu);
  const dragonGive = useGameStore((s) => s.dragonGive);
  const lastEvent = useGameStore((s) => s.lastEvent);
  const setSelectedCards = useGameStore((s) => s.setSelectedCards);

  const [tichuConfirm, setTichuConfirm] = useState(false);
  const [bombShake, setBombShake] = useState(false);
  const [trickCollecting, setTrickCollecting] = useState(false);
  const [playerOutName, setPlayerOutName] = useState<string | null>(null);

  // Wish enforcement: clear selection when wish is active so player can choose freely
  // The "Wish active — you must play!" label and disabled pass button guide the player.
  // Server validates that the played combo includes the wished rank.
  useEffect(() => {
    if (!gameState || gameState.currentPlayer !== gameState.myPosition) return;
    if (!gameState.wish.active || gameState.wish.wishedRank === null) return;
    // Clear any stale selection so the player starts fresh
    setSelectedCards(new Set());
  }, [gameState?.currentPlayer, gameState?.wish.active, gameState?.wish.wishedRank]);

  // Bomb shake effect
  useEffect(() => {
    if (lastEvent?.type === 'BOMB') {
      setBombShake(true);
      const t = setTimeout(() => setBombShake(false), 500);
      return () => clearTimeout(t);
    }
  }, [lastEvent]);

  // Trick-won collection animation
  useEffect(() => {
    if (lastEvent?.type === 'TRICK_WON') {
      setTrickCollecting(true);
      const t = setTimeout(() => setTrickCollecting(false), 400);
      return () => clearTimeout(t);
    }
  }, [lastEvent]);

  // Player out animation
  useEffect(() => {
    if (lastEvent?.type === 'PLAYER_OUT' && lastEvent.playerPosition !== undefined) {
      const name = gameState.players[lastEvent.playerPosition]?.nickname ?? 'Player';
      const order = lastEvent.data?.place ?? gameState.players[lastEvent.playerPosition]?.finishOrder;
      setPlayerOutName(`${name} is out!${order ? ` #${order}` : ''}`);
      const t = setTimeout(() => setPlayerOutName(null), 2000);
      return () => clearTimeout(t);
    }
  }, [lastEvent]);

  const isMyTurn = gameState.currentPlayer === gameState.myPosition;
  const myInfo = gameState.players[gameState.myPosition];
  const isDragonGive = gameState.phase === GamePhase.DRAGON_GIVE;
  const isTeammate = (pos: PlayerPosition) => pos % 2 === gameState.myPosition % 2;
  const showWishSelector = gameState.wishPending === gameState.myPosition;
  const passedSet = new Set(gameState.currentTrick.passedPlayers ?? []);

  // All action flags computed server-side — single source of truth
  const canAct = gameState.canAct ?? true;
  const canPass = gameState.canPass ?? false;
  const canCallTichu = gameState.canCallTichu ?? false;
  const mustPlayWish = gameState.mustPlayWish ?? false;

  return (
    <div className="playing-layout">
      {/* Top opponent (partner) */}
      <div className="layout-top">
        <OpponentHand
          player={gameState.players[rel.top]}
          position="top"
          isCurrentTurn={gameState.currentPlayer === rel.top}
          isTeammate={isTeammate(rel.top)}
          hasPassed={passedSet.has(rel.top)}
        />
      </div>

      {/* Middle row: left, trick area, right */}
      <div className="layout-middle">
        <OpponentHand
          player={gameState.players[rel.left]}
          position="left"
          isCurrentTurn={gameState.currentPlayer === rel.left}
          isTeammate={isTeammate(rel.left)}
          hasPassed={passedSet.has(rel.left)}
        />

        <div className={`trick-area ${bombShake ? 'trick-bomb-shake' : ''} ${trickCollecting ? 'trick-collecting' : ''}`}>
          {gameState.wish.active && (
            <div className="wish-indicator">
              Wish: {gameState.wish.wishedRank !== null ? getRankLabel(gameState.wish.wishedRank) : ''}
            </div>
          )}
          {gameState.currentTrick.plays.length > 0 ? (
            <div className="trick-cards">
              {gameState.currentTrick.plays.slice(-2).map((play, i, arr) => {
                const isWinning = play.playerPosition === gameState.currentTrick.currentWinner;
                const isLatest = i === arr.length - 1;
                const isOlder = !isLatest;
                return (
                  <div key={i} className={`trick-play ${isWinning ? 'trick-play-winning' : ''} ${isOlder ? 'trick-play-older' : ''} ${isLatest ? 'trick-play-latest' : ''}`}>
                    <span className={`trick-player ${isTeammate(play.playerPosition) ? 'name-teammate' : 'name-opponent'}`}>
                      {gameState.players[play.playerPosition]?.nickname}
                      {isWinning && <span className="trick-winner-icon" title="Winning">★</span>}
                    </span>
                    <div className={`trick-combo ${play.combination.cards.length >= 6 ? 'trick-combo-long' : ''}`}>
                      {sortForDisplay(play.combination).map((c) => (
                        <CardComponent key={c.id} card={c} size="small" />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <span className="no-trick">
              {isMyTurn ? 'Your lead' : `${gameState.players[gameState.currentPlayer]?.nickname}'s lead`}
            </span>
          )}
        </div>

        <OpponentHand
          player={gameState.players[rel.right]}
          position="right"
          isCurrentTurn={gameState.currentPlayer === rel.right}
          isTeammate={isTeammate(rel.right)}
          hasPassed={passedSet.has(rel.right)}
        />
      </div>

      {/* Player out announcement */}
      {playerOutName && (
        <div className="player-out-toast">{playerOutName}</div>
      )}

      {/* Turn indicator */}
      <div className="turn-indicator">
        {isMyTurn ? (
          <span className="your-turn">Your turn</span>
        ) : (
          <span className="info">
            {gameState.players[gameState.currentPlayer]?.nickname}'s turn
          </span>
        )}
        {gameState.turnDeadline && (
          <TurnTimer deadline={gameState.turnDeadline} />
        )}
      </div>

      {/* My hand */}
      <div className="my-hand-row">
        {myInfo?.tichuCall !== 'none' && (
          <span className={`tichu-badge ${myInfo.tichuCall === 'grand_tichu' ? 'tichu-badge-grand' : ''}`}>
            {myInfo.tichuCall === 'grand_tichu' ? 'GRAND TICHU' : 'TICHU'}
          </span>
        )}
        {myInfo?.isOut && myInfo.finishOrder !== null && (
          <span className="my-finish-badge">#{myInfo.finishOrder}</span>
        )}
        <PlayerHand
          cards={gameState.myHand}
          selectedCards={selectedCards}
          onToggle={toggleCard}
          lockedCards={undefined}
          receivedCards={gameState.receivedCards}
        />
        {myInfo.collectedCards > 0 && (
          <div className="collected-pile my-collected">
            <div className="card card-back card-sm collected-card">
              <span className="collected-count">{myInfo.collectedCards}</span>
            </div>
          </div>
        )}
      </div>

      {/* Wish selector */}
      {showWishSelector && <WishSelector />}

      {/* Action buttons */}
      <div className="btn-group">
        {isDragonGive && gameState.currentTrick.currentWinner === gameState.myPosition && (
          <>
            <span className="info">Give the Dragon trick to:</span>
            {gameState.players
              .filter((p) => p.position % 2 !== gameState.myPosition % 2)
              .map((p) => (
                <button
                  key={p.position}
                  className="btn btn-secondary"
                  onClick={() => dragonGive(p.position)}
                >
                  {p.nickname}
                </button>
              ))}
          </>
        )}
        {isDragonGive && gameState.currentTrick.currentWinner !== gameState.myPosition && (
          <span className="info">
            {gameState.players[gameState.currentTrick.currentWinner!]?.nickname} is choosing who to give the Dragon trick to...
          </span>
        )}
        {!isDragonGive && isMyTurn && canAct && (
          <div className="play-pass-group">
            <button
              className="btn btn-play"
              onClick={playCards}
              disabled={selectedCards.size === 0}
            >
              Play
            </button>
            {canPass && !mustPlayWish && (
              <button className="btn btn-pass" onClick={passTurn}>
                Pass
              </button>
            )}
            {mustPlayWish && (
              <span className="wish-forced-label">Wish active — you must play!</span>
            )}
          </div>
        )}
        {canCallTichu && !tichuConfirm && (
          <button className="btn btn-tichu" onClick={() => setTichuConfirm(true)}>
            Tichu!
          </button>
        )}
        {canCallTichu && tichuConfirm && (
          <>
            <span className="confirm-label">Call Tichu?</span>
            <button className="btn btn-tichu" onClick={callTichu}>
              Yes, call it!
            </button>
            <button className="btn btn-secondary" onClick={() => setTichuConfirm(false)}>
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// PointCards, ScoreBreakdown, ScoringView, GameOverView → extracted to PhaseViews.tsx
