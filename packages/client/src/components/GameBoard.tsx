import { useState, useEffect, useCallback } from 'react';
import { useGameStore } from '../stores/gameStore.js';
import { useRoomStore } from '../stores/roomStore.js';
import { GamePhase, SpecialCardType, CombinationType, getCardPoints, getRankLabel, sortCards, findPlayableFromHand } from '@cyprus/shared';
import type { Card, Combination, PlayerPosition, RoundScoreBreakdown, TrickState } from '@cyprus/shared';

/** Sort cards for display: full houses show triple first, everything else by rank. */
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
  return sortCards(combo.cards);
}
import { CardComponent } from './CardComponent.js';
import { PlayerHand } from './PlayerHand.js';
import { OpponentHand } from './OpponentHand.js';
import { WishSelector } from './WishSelector.js';
import { ScoreHistory } from './ScoreHistory.js';
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
  const [showLastTrick, setShowLastTrick] = useState(false);

  // When round ends, show last trick for 3 seconds before scoring view
  useEffect(() => {
    if (gameState?.phase === GamePhase.ROUND_SCORING && gameState.lastTrick && gameState.lastTrick.plays.length > 0) {
      setShowLastTrick(true);
      const timer = setTimeout(() => setShowLastTrick(false), 3000);
      return () => clearTimeout(timer);
    }
    setShowLastTrick(false);
  }, [gameState?.phase]);

  if (!gameState) {
    return <div className="game-board">Loading game...</div>;
  }

  const rel = getRelativePositions(gameState.myPosition);
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
          Team A: {gameState.scores[0]} / {gameState.targetScore}
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
          Team B: {gameState.scores[1]} / {gameState.targetScore}
        </span>
      </div>

      {showHistory && gameState.roundHistory && (
        <div className="history-modal-overlay" onClick={() => setShowHistory(false)}>
          <div className="history-modal" onClick={(e) => e.stopPropagation()}>
            <ScoreHistory history={gameState.roundHistory} onClose={() => setShowHistory(false)} />
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
      {gameState.phase === GamePhase.ROUND_SCORING && showLastTrick && (
        <LastTrickView lastTrick={gameState.lastTrick!} rel={rel} />
      )}
      {gameState.phase === GamePhase.ROUND_SCORING && !showLastTrick && <ScoringView />}
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

function GrandTichuView() {
  const gameState = useGameStore((s) => s.gameState)!;
  const grandTichuDecision = useGameStore((s) => s.grandTichuDecision);
  const selectedCards = useGameStore((s) => s.selectedCards);
  const toggleCard = useGameStore((s) => s.toggleCard);
  const [confirming, setConfirming] = useState(false);

  if (!gameState.grandTichuPending) {
    return <p className="info">Waiting for other players to decide...</p>;
  }

  return (
    <div className="phase-view">
      <h3>Grand Tichu?</h3>
      <p className="info">You've seen 8 of your 14 cards.</p>
      <PlayerHand
        cards={gameState.myHand}
        selectedCards={selectedCards}
        onToggle={toggleCard}
        interactive={false}
      />
      <div className="btn-group">
        {confirming ? (
          <>
            <span className="confirm-label">Call Grand Tichu?</span>
            <button className="btn btn-tichu" onClick={() => grandTichuDecision(true)}>
              Yes, call it!
            </button>
            <button className="btn btn-secondary" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button className="btn btn-tichu" onClick={() => setConfirming(true)}>
              Call Grand Tichu!
            </button>
            <button className="btn btn-secondary" onClick={() => grandTichuDecision(false)}>
              Pass
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function TichuCallBadges() {
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

function PassingView() {
  const gameState = useGameStore((s) => s.gameState)!;
  const passCards = useGameStore((s) => s.passCards);
  const callTichu = useGameStore((s) => s.callTichu);
  const hasPassed = gameState.players[gameState.myPosition]?.hasPassed;
  const myInfo = gameState.players[gameState.myPosition];
  const canCallTichu = myInfo?.tichuCall === 'none' && !gameState.hasPlayedCards;

  const rel = getRelativePositions(gameState.myPosition);
  const leftPlayer = gameState.players[rel.left];
  const acrossPlayer = gameState.players[rel.top];
  const rightPlayer = gameState.players[rel.right];

  const [tichuConfirm, setTichuConfirm] = useState(false);

  // Local state for card assignments
  const [assignments, setAssignments] = useState<{
    left: string | null;
    across: string | null;
    right: string | null;
  }>({ left: null, across: null, right: null });
  const [activeCard, setActiveCard] = useState<string | null>(null);

  if (hasPassed) {
    return (
      <div className="phase-view">
        <TichuCallBadges />
        <p className="info">Waiting for others to pass cards...</p>
      </div>
    );
  }

  const assignedCardIds = new Set(
    [assignments.left, assignments.across, assignments.right].filter(Boolean) as string[]
  );

  const handleCardClick = (cardId: string) => {
    // If card is already assigned, unassign it
    if (assignments.left === cardId) {
      setAssignments((a) => ({ ...a, left: null }));
      setActiveCard(null);
      return;
    }
    if (assignments.across === cardId) {
      setAssignments((a) => ({ ...a, across: null }));
      setActiveCard(null);
      return;
    }
    if (assignments.right === cardId) {
      setAssignments((a) => ({ ...a, right: null }));
      setActiveCard(null);
      return;
    }
    // Select or deselect the card
    setActiveCard(activeCard === cardId ? null : cardId);
  };

  const handleSlotClick = (slot: 'left' | 'across' | 'right') => {
    if (!activeCard) return;
    // If this slot already has a card, swap it out
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
      <h3>Pass Cards</h3>
      <p className="info">
        {activeCard
          ? 'Now click a player slot to assign this card'
          : 'Click a card from your hand, then click a player to give it to'}
      </p>

      {/* Drop zone slots */}
      <div className="pass-zones">
        {([
          { slot: 'left' as const, player: leftPlayer, pos: rel.left },
          { slot: 'across' as const, player: acrossPlayer, pos: rel.top },
          { slot: 'right' as const, player: rightPlayer, pos: rel.right },
        ]).map(({ slot, player, pos }) => {
          const assignedId = assignments[slot];
          const assignedCard = assignedId
            ? gameState.myHand.find((c) => c.id === assignedId)
            : null;
          const teammate = isTeammate(pos);

          return (
            <div
              key={slot}
              className={`pass-zone ${teammate ? 'pass-zone-teammate' : 'pass-zone-opponent'} ${activeCard && !assignedId ? 'pass-zone-active' : ''}`}
              onClick={() => !assignedId && handleSlotClick(slot)}
            >
              <div className="pass-zone-header">
                {player.avatar && (
                  <img className="pass-zone-avatar" src={player.avatar} alt={player.nickname} />
                )}
                <span className={`pass-zone-name ${teammate ? 'name-teammate' : 'name-opponent'}`}>
                  {player.nickname}
                </span>
                <span className="pass-zone-relation">
                  {teammate ? 'Partner' : 'Opponent'}
                </span>
              </div>
              <div className="pass-zone-card">
                {assignedCard ? (
                  <div className="pass-zone-assigned" onClick={(e) => { e.stopPropagation(); handleSlotRemove(slot); }}>
                    <CardComponent card={assignedCard} size="small" />
                    <span className="pass-zone-remove">✕</span>
                  </div>
                ) : (
                  <div className="pass-zone-empty">
                    {activeCard ? 'Click to assign' : 'Empty'}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Player hand */}
      <div className="pass-hand">
        {gameState.myHand.map((card) => {
          const isAssigned = assignedCardIds.has(card.id);
          const isActive = activeCard === card.id;
          return (
            <div
              key={card.id}
              className={`pass-hand-card ${isAssigned ? 'pass-hand-assigned' : ''} ${isActive ? 'pass-hand-active' : ''}`}
              onClick={() => !isAssigned && handleCardClick(card.id)}
            >
              <CardComponent card={card} size="normal" />
            </div>
          );
        })}
      </div>

      <div className="btn-group">
        {canPass && (
          <button
            className="btn btn-primary"
            onClick={() =>
              passCards({
                left: assignments.left!,
                across: assignments.across!,
                right: assignments.right!,
              })
            }
          >
            Pass Cards
          </button>
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

function LastTrickView({
  lastTrick,
  rel,
}: {
  lastTrick: TrickState;
  rel: { left: PlayerPosition; top: PlayerPosition; right: PlayerPosition };
}) {
  const gameState = useGameStore((s) => s.gameState);
  if (!gameState) return null;

  const isTeammate = (pos: PlayerPosition) =>
    (pos % 2) === (gameState.myPosition % 2);

  return (
    <div className="playing-layout">
      <div className="layout-top" />
      <div className="layout-middle">
        <div />
        <div className="trick-area">
          <div className="last-trick-label">Round Over</div>
          <div className="trick-cards">
            {lastTrick.plays.slice(-2).map((play, i) => (
              <div key={i} className="trick-play">
                <span className={`trick-player ${isTeammate(play.playerPosition) ? 'name-teammate' : 'name-opponent'}`}>
                  {gameState.players[play.playerPosition]?.nickname}
                </span>
                <div className="trick-combo">
                  {sortForDisplay(play.combination).map((c) => (
                    <CardComponent key={c.id} card={c} size="small" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div />
      </div>
      <div className="layout-bottom" />
    </div>
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

  const isMyTurn = gameState.currentPlayer === gameState.myPosition;
  const myInfo = gameState.players[gameState.myPosition];
  const canCallTichu = myInfo?.tichuCall === 'none' && !gameState.hasPlayedCards;
  const hasTrickOnTable = gameState.currentTrick.plays.length > 0;
  const isDragonGive = gameState.phase === GamePhase.DRAGON_GIVE;
  const isTeammate = (pos: PlayerPosition) => pos % 2 === gameState.myPosition % 2;

  // Check if we need to show the wish selector (I played the Mahjong and haven't wished yet)
  const showWishSelector = gameState.wishPending === gameState.myPosition;
  // Block play/pass while any player's wish is pending or Dog is resolving
  const wishBlocking = (gameState.wishPending !== null && gameState.wishPending !== undefined) || !!gameState.dogPending || !!gameState.trickWonPending;
  // Track which players passed in the current trick
  const passedSet = new Set(gameState.currentTrick.passedPlayers ?? []);


  // Whether the wish forces the player to play (blocks pass button)
  const wishForcesPlay = (() => {
    if (!isMyTurn || !gameState.wish.active || !gameState.wish.wishedRank) return false;
    const trick = gameState.currentTrick;
    if (trick.plays.length === 0) return false;
    const wishedCard = gameState.myHand.find(
      (c) => c.type === 'normal' && c.rank === gameState.wish.wishedRank
    );
    if (!wishedCard) return false;
    const currentTop = trick.plays[trick.plays.length - 1].combination;
    const playable = findPlayableFromHand(gameState.myHand, currentTop, gameState.wish);
    return playable.some((cards) =>
      cards.some((c) => c.type === 'normal' && c.rank === gameState.wish.wishedRank)
    );
  })();

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
              {gameState.currentTrick.plays.slice(-2).map((play, i) => (
                <div key={i} className="trick-play">
                  <span className={`trick-player ${isTeammate(play.playerPosition) ? 'name-teammate' : 'name-opponent'}`}>
                    {gameState.players[play.playerPosition]?.nickname}
                  </span>
                  <div className="trick-combo">
                    {sortForDisplay(play.combination).map((c) => (
                      <CardComponent key={c.id} card={c} size="small" />
                    ))}
                  </div>
                </div>
              ))}
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

      {/* Turn indicator */}
      <div className="turn-indicator">
        {isMyTurn ? (
          <>
            <span className="your-turn">Your turn</span>
            {gameState.turnDeadline && (
              <TurnTimer deadline={gameState.turnDeadline} />
            )}
          </>
        ) : (
          <span className="info">
            {gameState.players[gameState.currentPlayer]?.nickname}'s turn
          </span>
        )}
      </div>

      {/* My hand */}
      <div className="my-hand-row">
        {myInfo?.tichuCall !== 'none' && (
          <span className={`tichu-badge ${myInfo.tichuCall === 'grand_tichu' ? 'tichu-badge-grand' : ''}`}>
            {myInfo.tichuCall === 'grand_tichu' ? 'GRAND TICHU' : 'TICHU'}
          </span>
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
        {!isDragonGive && isMyTurn && !wishBlocking && (
          <div className="play-pass-group">
            <button
              className="btn btn-play"
              onClick={playCards}
              disabled={selectedCards.size === 0}
            >
              Play
            </button>
            {hasTrickOnTable && !wishForcesPlay && (
              <button className="btn btn-pass" onClick={passTurn}>
                Pass
              </button>
            )}
            {wishForcesPlay && (
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

function PointCards({ cards, team }: { cards: Card[]; team: string }) {
  const pointCards = cards.filter((c) => getCardPoints(c) !== 0);
  const total = cards.reduce((sum, c) => sum + getCardPoints(c), 0);

  return (
    <div className="point-cards-panel">
      <div className="point-cards-header">
        <span className="point-cards-team">{team}</span>
        <span className="point-cards-total">{total} pts</span>
      </div>
      <div className="point-cards-list">
        {pointCards.map((c) => (
          <div key={c.id} className="point-card-entry">
            <CardComponent card={c} size="small" />
            <span className="point-card-value">{getCardPoints(c) > 0 ? '+' : ''}{getCardPoints(c)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScoreBreakdown({ breakdown, players }: { breakdown: RoundScoreBreakdown; players: { position: number; nickname: string }[] }) {
  const getName = (pos: number) => players[pos]?.nickname ?? `Player ${pos}`;
  const teamName = (t: 0 | 1) => t === 0 ? 'Team A' : 'Team B';
  const teamClass = (t: 0 | 1) => t === 0 ? 'name-teammate' : 'name-opponent';

  return (
    <div className="breakdown">
      {breakdown.doubleVictory !== null ? (
        <div className="breakdown-item breakdown-highlight">
          <span className={teamClass(breakdown.doubleVictory)}>{teamName(breakdown.doubleVictory)}</span>
          {' '}finished 1st and 2nd: <strong>+200</strong>
        </div>
      ) : (
        <>
          <div className="breakdown-item">
            Card points: <span className={teamClass(0)}>Team A</span> <strong>{breakdown.cardPoints[0]}</strong> &mdash; <span className={teamClass(1)}>Team B</span> <strong>{breakdown.cardPoints[1]}</strong>
          </div>
          {breakdown.lastPlayerHandPoints !== 0 && breakdown.lastPlayerHandTeam !== null && (
            <div className="breakdown-item">
              Last player's remaining cards: <strong>{breakdown.lastPlayerHandPoints > 0 ? '+' : ''}{breakdown.lastPlayerHandPoints}</strong> to <span className={teamClass(breakdown.lastPlayerHandTeam)}>{teamName(breakdown.lastPlayerHandTeam)}</span>
            </div>
          )}
        </>
      )}
      {breakdown.tichuResults.map((t, i) => (
        <div key={i} className={`breakdown-item ${t.success ? 'breakdown-success' : 'breakdown-fail'}`}>
          {getName(t.position)} {t.call === 'grand_tichu' ? 'Grand Tichu' : 'Tichu'}: {t.success ? 'Success' : 'Failed'} <strong>{t.points > 0 ? '+' : ''}{t.points}</strong> for <span className={teamClass(t.team)}>{teamName(t.team)}</span>
        </div>
      ))}
    </div>
  );
}

function ScoringView() {
  const gameState = useGameStore((s) => s.gameState)!;
  const nextRound = useGameStore((s) => s.nextRound);

  return (
    <div className="scoring-layout">
      {gameState.roundTrickCards && (
        <PointCards cards={gameState.roundTrickCards[0]} team="Team A" />
      )}

      <div className="phase-view">
        <h3>Round Over</h3>

        {gameState.roundBreakdown && (
          <ScoreBreakdown breakdown={gameState.roundBreakdown} players={gameState.players} />
        )}

        <div className="scores">
          <div className="score-row">
            <span className="score-team name-teammate">Team A</span>
            <span className="score-round">+{gameState.roundScores[0]}</span>
            <span className="score-total">{gameState.scores[0]}</span>
          </div>
          <div className="score-row">
            <span className="score-team name-opponent">Team B</span>
            <span className="score-round">+{gameState.roundScores[1]}</span>
            <span className="score-total">{gameState.scores[1]}</span>
          </div>
        </div>

        {gameState.roundHistory && gameState.roundHistory.length > 1 && (
          <ScoreHistory history={gameState.roundHistory} />
        )}

        <button className="btn btn-primary" onClick={nextRound}>
          Next Round
        </button>
      </div>

      {gameState.roundTrickCards && (
        <PointCards cards={gameState.roundTrickCards[1]} team="Team B" />
      )}
    </div>
  );
}

function GameOverView() {
  const gameState = useGameStore((s) => s.gameState)!;
  const winner = gameState.scores[0] >= gameState.targetScore ? 'Team A' : 'Team B';

  return (
    <div className="phase-view">
      <h3>Game Over!</h3>
      <p className="winner">{winner} wins!</p>
      <div className="scores">
        <div className="score-row">
          <span className="score-team name-teammate">Team A</span>
          <span className="score-total">{gameState.scores[0]}</span>
        </div>
        <div className="score-row">
          <span className="score-team name-opponent">Team B</span>
          <span className="score-total">{gameState.scores[1]}</span>
        </div>
      </div>

      {gameState.roundHistory && gameState.roundHistory.length > 0 && (
        <ScoreHistory history={gameState.roundHistory} />
      )}
    </div>
  );
}
