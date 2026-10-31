import { useState, useEffect, useCallback } from 'react';
import { useGameStore } from '../stores/gameStore.js';
import { useRoomStore } from '../stores/roomStore.js';
import { GamePhase, SpecialCardType, getRankLabel, sortCards, sortCombinationForDisplay, getPhoenixDisplayLabel, isQuickGame } from '@cyprus/shared';
import type { PlayerPosition } from '@cyprus/shared';
import { useT } from '../i18n.js';

import { CardComponent } from './CardComponent.js';
import { PlayerHand } from './PlayerHand.js';
import { OpponentHand } from './OpponentHand.js';
import { PlayerAvatar } from './PlayerAvatar.js';
import { WishSelector } from './WishSelector.js';
import { ScoreHistory } from './ScoreHistory.js';
import { QuickGuideButton } from './QuickGuide.js';
import { GrandTichuView, PassingView, ScoringView, GameOverView } from './PhaseViews.js';
import { ReportBotPlayButton } from './ReportBotPlayPanel.js';
import { HintButton } from './HintButton.js';
import { isMuted, setMuted, subscribeMuted } from '../sounds.js';

function getRelativePositions(myPos: PlayerPosition) {
  return {
    right: ((myPos + 1) % 4) as PlayerPosition,
    top: ((myPos + 2) % 4) as PlayerPosition,
    left: ((myPos + 3) % 4) as PlayerPosition,
  };
}

function SoundToggle({ variant = 'icon' }: { variant?: 'icon' | 'row' }) {
  const t = useT();
  const [muted, setMutedState] = useState(isMuted);
  useEffect(() => subscribeMuted(() => setMutedState(isMuted())), []);
  const toggle = useCallback(() => {
    setMuted(!isMuted());
  }, []);

  if (variant === 'row') {
    return (
      <button type="button" className="game-settings-row" onClick={toggle}>
        {muted ? t('game.soundOff') : t('game.soundOn')}
      </button>
    );
  }

  return (
    <button className="sound-toggle" onClick={toggle} title={muted ? t('game.unmute') : t('game.mute')}>
      {muted ? '\uD83D\uDD07' : '\uD83D\uDD0A'}
    </button>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        fill="currentColor"
        d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7.2 7.2 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.49-.42h-3.84a.5.5 0 0 0-.49.42l-.36 2.54c-.59.24-1.14.55-1.63.94l-2.39-.96a.5.5 0 0 0-.61.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.83 14.52a.5.5 0 0 0-.12.64l1.92 3.32c.14.23.42.32.64.22l2.39-.96c.49.4 1.04.72 1.63.94l.36 2.54c.05.24.26.42.5.42h3.84c.24 0 .45-.18.5-.42l.36-2.54c.59-.22 1.14-.54 1.63-.94l2.39.96c.22.1.5 0 .64-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z"
      />
    </svg>
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [leaveConfirm, setLeaveConfirm] = useState(false);

  useEffect(() => {
    if (!settingsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSettingsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settingsOpen]);

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
          {t('game.yourTeam')}: {gameState.scores[myTeam]}{isQuickGame(gameState.targetScore) ? '' : ` / ${gameState.targetScore}`}
        </span>
        <span className="phase-label">
          {roomCode && <span className="room-code-badge">{roomCode}</span>}
          <span className="game-phase-title">
            {formatPhase(gameState.phase)}
            {isQuickGame(gameState.targetScore) ? ` · ${t('game.oneRound')}` : ''}
          </span>
          <span className="game-controls">
            <SoundToggle />
            <QuickGuideButton />
            {hasHistory && (
              <button className="history-btn" onClick={() => setShowHistory(true)} title={t('game.scoreHistory')}>
                {'\uD83D\uDCCA'}
              </button>
            )}
            <HintButton />
            {!gameState.isSpectator && <ReportBotPlayButton />}
            <button className="leave-btn" onClick={() => gameState.isSpectator ? reset() : setLeaveConfirm(true)}>
              {gameState.isSpectator ? 'Exit' : t('game.exit')}
            </button>
          </span>
        </span>
        <span className="name-opponent">
          {t('game.opponents')}: {gameState.scores[1 - myTeam]}{isQuickGame(gameState.targetScore) ? '' : ` / ${gameState.targetScore}`}
        </span>
        <button
          type="button"
          className="game-settings-btn"
          aria-label={t('game.settings')}
          aria-haspopup="dialog"
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen(true)}
        >
          <GearIcon />
        </button>
      </div>
      {gameState.botDifficulty && (
        <div className="bot-difficulty-label">
          {t('game.bots', { difficulty: t(`lobby.${gameState.botDifficulty}`) })}
        </div>
      )}

      {settingsOpen && (
        <div className="game-settings-overlay" onClick={() => setSettingsOpen(false)}>
          <div
            className="game-settings-sheet"
            role="dialog"
            aria-label={t('game.settings')}
            onClick={(e) => e.stopPropagation()}
          >
            <h3>{t('game.settings')}</h3>
            <SoundToggle variant="row" />
            <button
              type="button"
              className="game-settings-row"
              onClick={() => {
                setSettingsOpen(false);
                setShowHistory(true);
              }}
            >
              {t('game.scoreHistory')}
            </button>
            {!gameState.isSpectator && <ReportBotPlayButton variant="row" />}
            <button type="button" className="game-settings-row game-settings-close" onClick={() => setSettingsOpen(false)}>
              {t('score.close')}
            </button>
          </div>
        </div>
      )}

      {showHistory && (
        <div className="history-modal-overlay" onClick={() => setShowHistory(false)}>
          <div className="history-modal" onClick={(e) => e.stopPropagation()}>
            <ScoreHistory history={gameState.roundHistory ?? []} myTeam={myTeam} onClose={() => setShowHistory(false)} />
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
  const hintRecommendedPass = useGameStore((s) => s.hintRecommendedPass);
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

  const dogLead = gameState.dogLead ?? null;
  const activeSeat = dogLead?.to ?? gameState.currentPlayer;
  const isMyTurn = activeSeat === gameState.myPosition;
  const dogLeadName = dogLead ? gameState.players[dogLead.to]?.nickname || '' : '';
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
  const hasActionBar = isDragonGive || (isMyTurn && canAct) || canCallTichu;

  return (
    <div className={`playing-layout ${hasActionBar ? 'playing-layout-has-actions' : ''}`}>
      {/* Top opponent (partner) */}
      <div className="layout-top">
        <OpponentHand
          player={gameState.players[rel.top]}
          position="top"
          isCurrentTurn={activeSeat === rel.top}
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
          isCurrentTurn={activeSeat === rel.left}
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
                        const phoenixLabel = getPhoenixDisplayLabel(play.combination, prevRank);
                        return sortCombinationForDisplay(play.combination).map((c) => (
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
          ) : dogLead ? (
            <div className="trick-cards dog-lead-notice">
              <div className="trick-play trick-play-latest">
                <span className={`trick-player ${isTeammate(dogLead.from) ? 'name-teammate' : 'name-opponent'}`}>
                  {gameState.players[dogLead.from]?.nickname}
                </span>
                <div className="trick-combo">
                  <CardComponent card={dogLead.card} size="small" />
                </div>
              </div>
            </div>
          ) : (
            <span className="no-trick">
              {isMyTurn ? t('game.yourLead') : t('game.playerLead', { name: gameState.players[gameState.currentPlayer]?.nickname || '' })}
            </span>
          )}
          {dogLead && (
            <span className="dog-lead-label">{t('game.dogLead', { name: dogLeadName })}</span>
          )}
        </div>

        <OpponentHand
          player={gameState.players[rel.right]}
          position="right"
          isCurrentTurn={activeSeat === rel.right}
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
            {t('game.playerTurn', { name: gameState.players[activeSeat]?.nickname || '' })}
          </span>
        )}
        {gameState.turnDeadline && !gameState.dogPending && (
          <TurnTimer deadline={gameState.turnDeadline} />
        )}
      </div>

      {/* My hand */}
      <div className={`my-hand-row ${dogLead?.to === gameState.myPosition ? 'dog-lead-target' : ''}`}>
        {myInfo?.tichuCall !== 'none' && (
          <span className={`tichu-badge ${myInfo.tichuCall === 'grand_tichu' ? 'tichu-badge-grand' : ''}`}>
            {myInfo.tichuCall === 'grand_tichu' ? 'GRAND TICHU' : 'TICHU'}
          </span>
        )}
        {myInfo?.isOut && myInfo.finishOrder !== null && (
          <span className="my-finish-badge">#{myInfo.finishOrder}</span>
        )}
        <PlayerHand
          cards={sortCards(gameState.myHand)}
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
      <div className="btn-group game-action-bar">
        {hasActionBar && (
          <div className="action-player-info">
            {myInfo?.avatar && (
              <PlayerAvatar avatar={myInfo.avatar} alt={myInfo.nickname} className="player-avatar action-player-avatar" />
            )}
            <span className="action-player-name">{myInfo?.nickname}</span>
          </div>
        )}
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
              <button
                className={`btn btn-pass ${gameState.mustPass ? 'btn-pass-recommended' : ''} ${hintRecommendedPass ? 'btn-pass-hint' : ''}`}
                onClick={passTurn}
              >
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
