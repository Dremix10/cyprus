import { useState, useEffect, useCallback } from 'react';
import { useGameStore } from '../stores/gameStore.js';
import { useRoomStore } from '../stores/roomStore.js';
import { GamePhase, SpecialCardType, CombinationType, getRankLabel, sortCards } from '@cyprus/shared';
import type { Card, Combination, PlayerPosition } from '@cyprus/shared';
import { useT } from '../i18n.js';

/** Get the effective rank label for Phoenix in a combo. For singles, pass the previous play's rank. */
function getPhoenixLabel(combo: Combination, prevRank?: number): string | null {
  const phoenix = combo.cards.find((c) => c.type === 'special' && c.specialType === SpecialCardType.PHOENIX);
  if (!phoenix) return null;

  // Phoenix as single — show the rank it beats (prevRank + 0.5, displayed as the rank it sits above)
  if (combo.cards.length === 1 && prevRank !== undefined) {
    return getRankLabel(prevRank) + '½';
  }
  if (combo.cards.length <= 1) return null;

  const getCardRank = (c: Card) => c.type === 'normal' ? c.rank : (c.type === 'special' && c.specialType === SpecialCardType.MAHJONG ? 1 : 0);
  const others = combo.cards.filter((c) => c !== phoenix);
  const ranks = others.map(getCardRank);

  if (combo.type === CombinationType.STRAIGHT) {
    const minRank = Math.min(...ranks);
    const maxRank = Math.max(...ranks);
    // Default: extend up, unless top is ACE (14) — then extend down
    let phoenixRank = maxRank >= 14 ? minRank - 1 : maxRank + 1;
    for (let r = minRank; r <= maxRank; r++) {
      if (!ranks.includes(r)) { phoenixRank = r; break; }
    }
    return getRankLabel(phoenixRank);
  }
  if (combo.type === CombinationType.CONSECUTIVE_PAIRS) {
    const rankCounts = new Map<number, number>();
    for (const r of ranks) rankCounts.set(r, (rankCounts.get(r) ?? 0) + 1);
    const minRank = Math.min(...ranks);
    const maxRank = Math.max(...ranks);
    let phoenixRank = maxRank + 1;
    // Prefer a rank missing from the run entirely
    for (let r = minRank; r <= maxRank; r++) {
      if (!rankCounts.has(r)) { phoenixRank = r; break; }
    }
    // Otherwise fill the rank that's only present once
    if (phoenixRank === maxRank + 1) {
      for (const [r, count] of rankCounts) {
        if (count === 1) { phoenixRank = r; break; }
      }
    }
    return getRankLabel(phoenixRank);
  }
  if (combo.type === CombinationType.PAIR || combo.type === CombinationType.TRIPLE || combo.type === CombinationType.FULL_HOUSE) {
    // Phoenix matches the rank of the other cards in its group
    const rankCounts = new Map<number, number>();
    for (const r of ranks) rankCounts.set(r, (rankCounts.get(r) ?? 0) + 1);
    // FULL_HOUSE 2+2+Phoenix tiebreaker: Phoenix joins the HIGHER pair (matches engine rule)
    if (combo.type === CombinationType.FULL_HOUSE && rankCounts.size === 2) {
      const [r1, r2] = [...rankCounts.keys()];
      if (rankCounts.get(r1) === 2 && rankCounts.get(r2) === 2) {
        return getRankLabel(Math.max(r1, r2));
      }
    }
    // Find the rank with fewer cards (Phoenix completes it)
    let minCount = Infinity;
    let phoenixRank = ranks[0];
    for (const [r, count] of rankCounts) {
      if (count < minCount) { minCount = count; phoenixRank = r; }
    }
    return getRankLabel(phoenixRank);
  }
  return null;
}

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
    // Phoenix completes whichever group is smaller (the pair needs one more).
    // For 2+2+Phoenix, join the HIGHER-ranked pair to match engine rule.
    if (phoenix) {
      const entries = [...rankCounts.entries()];
      const minLen = Math.min(...entries.map(([, g]) => g.length));
      const candidates = entries.filter(([, g]) => g.length === minLen);
      const targetRank = Math.max(...candidates.map(([r]) => r));
      const targetGroup = rankCounts.get(targetRank);
      if (targetGroup) targetGroup.push(phoenix);
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

      // Find the gap rank that Phoenix fills.
      // Default: extend up, unless top is ACE (straights only) — then extend down.
      let phoenixRank = combo.type === CombinationType.STRAIGHT && maxRank >= 14
        ? minRank - 1
        : maxRank + 1;
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
import { PlayerAvatar } from './PlayerAvatar.js';
import { WishSelector } from './WishSelector.js';
import { ScoreHistory } from './ScoreHistory.js';
import { QuickGuideButton } from './QuickGuide.js';
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
      {gameState.isSpectator && (
        <div className="game-toast game-toast-info">
          Spectating
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
          <QuickGuideButton />
          {hasHistory && (
            <button className="history-btn" onClick={() => setShowHistory(true)} title={t('game.scoreHistory')}>
              {'\uD83D\uDCCA'}
            </button>
          )}
          <button className="leave-btn" onClick={() => gameState.isSpectator ? reset() : setLeaveConfirm(true)}>
            {gameState.isSpectator ? 'Exit' : t('game.exit')}
          </button>
        </span>
        <span className="name-opponent">
          {t('game.opponents')}: {gameState.scores[1 - myTeam]} / {gameState.targetScore}
        </span>
      </div>
      {gameState.botDifficulty && (
        <div className="bot-difficulty-label">
          {t('game.bots', { difficulty: t(`lobby.${gameState.botDifficulty}`) })}
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

      {gameState.phase === GamePhase.GRAND_TICHU && (gameState.isSpectator
        ? <p className="info">Players deciding on Grand Tichu...</p>
        : <GrandTichuView />)}
      {gameState.phase === GamePhase.PASSING && (gameState.isSpectator
        ? <p className="info">Players passing cards...</p>
        : <PassingView />)}
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

  // Auto-pass when server says we have no legal play.
  useEffect(() => {
    if (!gameState?.mustPass) return;
    if (gameState.currentPlayer !== gameState.myPosition) return;
    const timer = setTimeout(() => {
      if (useGameStore.getState().gameState?.mustPass) passTurn();
    }, 900);
    return () => clearTimeout(timer);
  }, [gameState?.mustPass, gameState?.currentPlayer, gameState?.myPosition, passTurn]);

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
          disconnectDeadline={gameState.disconnectDeadlines?.[rel.top]}
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
          disconnectDeadline={gameState.disconnectDeadlines?.[rel.left]}
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
                      {(() => {
                        const playIdx = gameState.currentTrick.plays.indexOf(play);
                        const prevRank = playIdx > 0 ? gameState.currentTrick.plays[playIdx - 1].combination.rank : undefined;
                        const phoenixLabel = getPhoenixLabel(play.combination, prevRank);
                        return sortForDisplay(play.combination).map((c) => (
                          <div key={c.id} className="trick-card-wrap">
                            <CardComponent card={c} size="small" />
                            {phoenixLabel && c.type === 'special' && c.specialType === SpecialCardType.PHOENIX && (
                              <span className="phoenix-rank-badge">{phoenixLabel}</span>
                            )}
                          </div>
                        ));
                      })()}
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
          disconnectDeadline={gameState.disconnectDeadlines?.[rel.right]}
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
        {myInfo?.avatar && (
          <div className="my-player-info">
            <PlayerAvatar avatar={myInfo.avatar} alt={myInfo.nickname} className="player-avatar" />
            <span className="my-name">{myInfo.nickname}</span>
          </div>
        )}
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
