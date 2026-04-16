import { useState, useEffect, useCallback } from 'react';
import { useGameStore } from '../stores/gameStore.js';
import { useRoomStore } from '../stores/roomStore.js';
import { GamePhase, SpecialCardType, CombinationType, getRankLabel, sortCards } from '@cyprus/shared';
import type { Card, Combination, PlayerPosition } from '@cyprus/shared';
import { useT } from '../i18n.js';

/** Sort cards for display: Phoenix placed at its effective position in the combo. */
function sortForDisplay(combo: Combination): Card[] {
  if (combo.type === CombinationType.FULL_HOUSE) {
    const phoenix = combo.cards.find((c) => c.type === 'special' && c.specialType === SpecialCardType.PHOENIX);
    const normalCards = combo.cards.filter((c) => c !== phoenix || !phoenix);
    const rankCounts = new Map<number, Card[]>();
    for (const c of normalCards) {
      const rank = c.type === 'normal' ? c.rank : 0;
      const group = rankCounts.get(rank) ?? [];
      group.push(c);
      rankCounts.set(rank, group);
    }
    // Phoenix completes whichever group is smaller (the pair needs one more)
    if (phoenix) {
      let smallestGroup: Card[] | null = null;
      for (const group of rankCounts.values()) {
        if (!smallestGroup || group.length < smallestGroup.length) {
          smallestGroup = group;
        }
      }
      if (smallestGroup) smallestGroup.push(phoenix);
    }
    const groups = [...rankCounts.values()].sort((a, b) => b.length - a.length);
    return groups.flat();
  }

  // For combos with Phoenix, figure out the rank it fills and sort it there
  const phoenix = combo.cards.find((c) => c.type === 'special' && c.specialType === SpecialCardType.PHOENIX);
  if (phoenix && combo.cards.length > 1) {
    const others = combo.cards.filter((c) => c !== phoenix);
    const sorted = sortCards(others);

    const getCardRank = (c: Card) => c.type === 'normal' ? c.rank : (c.type === 'special' && c.specialType === SpecialCardType.MAHJONG ? 1 : 0);

    if (combo.type === CombinationType.STRAIGHT || combo.type === CombinationType.CONSECUTIVE_PAIRS) {
      const ranks = sorted.map(getCardRank);
      const minRank = Math.min(...ranks);
      const maxRank = Math.max(...ranks);

      // Find the gap rank that Phoenix fills
      let phoenixRank = maxRank + 1; // default: extends at top
      if (combo.type === CombinationType.STRAIGHT) {
        for (let r = minRank; r <= maxRank; r++) {
          if (!ranks.includes(r)) { phoenixRank = r; break; }
        }
      } else {
        // Consecutive pairs: each rank should appear twice; find the one with only 1
        const rankCounts = new Map<number, number>();
        for (const r of ranks) rankCounts.set(r, (rankCounts.get(r) ?? 0) + 1);
        // Check for a rank gap (missing rank entirely)
        for (let r = minRank; r <= maxRank; r++) {
          if (!rankCounts.has(r)) { phoenixRank = r; break; }
        }
        // Check for a rank with only 1 card (Phoenix completes the pair)
        if (phoenixRank === maxRank + 1) {
          for (const [r, count] of rankCounts) {
            if (count === 1) { phoenixRank = r; break; }
          }
        }
      }

      // Insert Phoenix at the right position
      const insertIdx = sorted.findIndex((c) => getCardRank(c) > phoenixRank);
      if (insertIdx === -1) {
        sorted.push(phoenix);
      } else {
        sorted.splice(insertIdx, 0, phoenix);
      }
      return sorted;
    }

    // For pairs/triples: Phoenix matches the rank of the others
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
  const t = useT();
  const [muted, setMutedState] = useState(isMuted);
  const toggle = useCallback(() => {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
  }, [muted]);

  return (
    <button className="sound-toggle" onClick={toggle} title={muted ? t('game.unmute') : t('game.mute')}>
      {muted ? '\uD83D\uDD07' : '\uD83D\uDD0A'}
    </button>
  );
}

export function GameBoard() {
  const t = useT();
  const gameState = useGameStore((s) => s.gameState);
  const error = useGameStore((s) => s.error);
  const skipRound = useGameStore((s) => s.skipRound);
  const roomNotification = useRoomStore((s) => s.error);
  const roomCode = useRoomStore((s) => s.roomCode);
  const reset = useRoomStore((s) => s.reset);
  const [showHistory, setShowHistory] = useState(false);
  const [leaveConfirm, setLeaveConfirm] = useState(false);

  if (!gameState) {
    return <div className="game-board">{t('game.loading')}</div>;
  }

  const rel = getRelativePositions(gameState.myPosition);
  const myTeam = gameState.myPosition % 2 === 0 ? 0 : 1;
  const hasHistory = gameState.roundHistory && gameState.roundHistory.length > 0;
  const myPlayer = gameState.players[gameState.myPosition];
  const canSkip = gameState.isSolo && myPlayer.isOut &&
    (gameState.phase === GamePhase.PLAYING || gameState.phase === GamePhase.DRAGON_GIVE);

  const formatPhase = (phase: GamePhase): string => {
    switch (phase) {
      case GamePhase.GRAND_TICHU: return t('game.grandTichu');
      case GamePhase.PASSING: return t('game.cardPassing');
      case GamePhase.PLAYING: return t('game.playing');
      case GamePhase.DRAGON_GIVE: return t('game.dragonGive');
      case GamePhase.ROUND_SCORING: return t('game.roundOver');
      case GamePhase.GAME_OVER: return t('game.gameOver');
      default: return phase;
    }
  };

  return (
    <div className="game-board">
      {roomNotification && (
        <div className={`game-toast ${roomNotification.includes('disconnected') ? 'game-toast-warn' : 'game-toast-info'}`}>
          {roomNotification}
        </div>
      )}
      <div className="game-info">
        <span className="name-teammate">
          {t('game.yourTeam')}: {gameState.scores[myTeam]} / {gameState.targetScore}
        </span>
        <span className="phase-label">
          {roomCode && <span className="room-code-badge">{roomCode}</span>}
          {formatPhase(gameState.phase)}
          <SoundToggle />
          {hasHistory && (
            <button className="history-btn" onClick={() => setShowHistory(true)} title={t('game.scoreHistory')}>
              {'\uD83D\uDCCA'}
            </button>
          )}
          <button className="leave-btn" onClick={() => setLeaveConfirm(true)}>
            {t('game.exit')}
          </button>
        </span>
        <span className="name-opponent">
          {t('game.opponents')}: {gameState.scores[1 - myTeam]} / {gameState.targetScore}
        </span>
      </div>
      {gameState.botDifficulty && (
        <div className="bot-difficulty-label">
          {t('game.bots', { difficulty: gameState.botDifficulty.charAt(0).toUpperCase() + gameState.botDifficulty.slice(1) })}
        </div>
      )}

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
            <p>{t('game.leaveConfirm')}</p>
            <div className="leave-modal-buttons">
              <button className="btn btn-danger" onClick={reset}>{t('game.yesLeave')}</button>
              <button className="btn btn-secondary" onClick={() => setLeaveConfirm(false)}>{t('game.cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {gameState.phase === GamePhase.GRAND_TICHU && <GrandTichuView />}
      {gameState.phase === GamePhase.PASSING && <PassingView />}
      {(gameState.phase === GamePhase.PLAYING ||
        gameState.phase === GamePhase.DRAGON_GIVE) && (
        <>
          <PlayingLayout rel={rel} />
          {canSkip && (
            <button className="btn btn-olympus btn-skip" onClick={skipRound}>
              {t('game.skip')}
            </button>
          )}
        </>
      )}
      {gameState.phase === GamePhase.ROUND_SCORING && <ScoringView />}
      {gameState.phase === GamePhase.GAME_OVER && <GameOverView />}
    </div>
  );
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
  const t = useT();
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
  useEffect(() => {
    if (!gameState || gameState.currentPlayer !== gameState.myPosition) return;
    if (!gameState.wish.active || gameState.wish.wishedRank === null) return;
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
      setPlayerOutName(`${t('game.playerOut', { name })}${order ? ` #${order}` : ''}`);
      const timer = setTimeout(() => setPlayerOutName(null), 2000);
      return () => clearTimeout(timer);
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
              {t('game.wish', { rank: gameState.wish.wishedRank !== null ? getRankLabel(gameState.wish.wishedRank) : '' })}
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
              {isMyTurn ? t('game.yourLead') : t('game.playerLead', { name: gameState.players[gameState.currentPlayer]?.nickname || '' })}
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
          <span className="your-turn">{t('game.yourTurn')}</span>
        ) : (
          <span className="info">
            {t('game.playerTurn', { name: gameState.players[gameState.currentPlayer]?.nickname || '' })}
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
            <span className="info">{t('game.giveDragonTo')}</span>
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
            {t('game.playerChoosingDragon', { name: gameState.players[gameState.currentTrick.currentWinner!]?.nickname || '' })}
          </span>
        )}
        {!isDragonGive && isMyTurn && canAct && (
          <div className="play-pass-group">
            <button
              className="btn btn-play"
              onClick={playCards}
              disabled={selectedCards.size === 0}
            >
              {t('game.play')}
            </button>
            {canPass && !mustPlayWish && (
              <button className="btn btn-pass" onClick={passTurn}>
                {t('game.pass')}
              </button>
            )}
            {mustPlayWish && (
              <span className="wish-forced-label">{t('game.wishActive')}</span>
            )}
          </div>
        )}
        {canCallTichu && !tichuConfirm && (
          <button className="btn btn-tichu" onClick={() => setTichuConfirm(true)}>
            {t('game.tichu')}
          </button>
        )}
        {canCallTichu && tichuConfirm && (
          <>
            <span className="confirm-label">{t('game.callTichu')}</span>
            <button className="btn btn-tichu" onClick={callTichu}>
              {t('game.yesCallIt')}
            </button>
            <button className="btn btn-secondary" onClick={() => setTichuConfirm(false)}>
              {t('game.cancel')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// PointCards, ScoreBreakdown, ScoringView, GameOverView → extracted to PhaseViews.tsx
