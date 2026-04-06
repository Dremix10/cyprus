import { useGameStore } from '../stores/gameStore.js';
import { GamePhase, SpecialCardType, getCardPoints } from '@cyprus/shared';
import type { Card, PlayerPosition, RoundScoreBreakdown } from '@cyprus/shared';
import { CardComponent } from './CardComponent.js';
import { PlayerHand } from './PlayerHand.js';
import { OpponentHand } from './OpponentHand.js';
import { WishSelector } from './WishSelector.js';

function getRelativePositions(myPos: PlayerPosition) {
  return {
    right: ((myPos + 1) % 4) as PlayerPosition,
    top: ((myPos + 2) % 4) as PlayerPosition,
    left: ((myPos + 3) % 4) as PlayerPosition,
  };
}

export function GameBoard() {
  const gameState = useGameStore((s) => s.gameState);
  const error = useGameStore((s) => s.error);

  if (!gameState) {
    return <div className="game-board">Loading game...</div>;
  }

  const rel = getRelativePositions(gameState.myPosition);

  return (
    <div className="game-board">
      <div className="game-info">
        <span className="name-teammate">
          Team A: {gameState.scores[0]} / {gameState.targetScore}
        </span>
        <span className="phase-label">{formatPhase(gameState.phase)}</span>
        <span className="name-opponent">
          Team B: {gameState.scores[1]} / {gameState.targetScore}
        </span>
      </div>

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

function GrandTichuView() {
  const gameState = useGameStore((s) => s.gameState)!;
  const grandTichuDecision = useGameStore((s) => s.grandTichuDecision);
  const selectedCards = useGameStore((s) => s.selectedCards);
  const toggleCard = useGameStore((s) => s.toggleCard);

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
        <button className="btn btn-tichu" onClick={() => grandTichuDecision(true)}>
          Call Grand Tichu!
        </button>
        <button className="btn btn-secondary" onClick={() => grandTichuDecision(false)}>
          Pass
        </button>
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
  const selectedCards = useGameStore((s) => s.selectedCards);
  const toggleCard = useGameStore((s) => s.toggleCard);
  const passCards = useGameStore((s) => s.passCards);
  const callTichu = useGameStore((s) => s.callTichu);
  const hasPassed = gameState.players[gameState.myPosition]?.hasPassed;
  const myInfo = gameState.players[gameState.myPosition];
  const canCallTichu = myInfo?.tichuCall === 'none' && !gameState.hasPlayedCards;

  if (hasPassed) {
    return (
      <div className="phase-view">
        <TichuCallBadges />
        <p className="info">Waiting for others to pass cards...</p>
      </div>
    );
  }

  const selectedArray = [...selectedCards];
  const canPass = selectedArray.length === 3;

  return (
    <div className="phase-view">
      <TichuCallBadges />
      <h3>Pass Cards</h3>
      <p className="info">Select 3 cards: one for left, across, and right.</p>
      <PlayerHand
        cards={gameState.myHand}
        selectedCards={selectedCards}
        onToggle={toggleCard}
      />
      {canPass && (
        <div className="pass-preview">
          <div className="pass-slot pass-opponent">
            <span className="pass-label name-opponent">Left</span>
            <CardComponent card={gameState.myHand.find(c => c.id === selectedArray[0])!} size="small" />
          </div>
          <div className="pass-slot pass-teammate">
            <span className="pass-label name-teammate">Partner</span>
            <CardComponent card={gameState.myHand.find(c => c.id === selectedArray[1])!} size="small" />
          </div>
          <div className="pass-slot pass-opponent">
            <span className="pass-label name-opponent">Right</span>
            <CardComponent card={gameState.myHand.find(c => c.id === selectedArray[2])!} size="small" />
          </div>
        </div>
      )}
      <div className="btn-group">
        {canPass && (
          <button
            className="btn btn-primary"
            onClick={() =>
              passCards({
                left: selectedArray[0],
                across: selectedArray[1],
                right: selectedArray[2],
              })
            }
          >
            Pass Cards
          </button>
        )}
        {canCallTichu && (
          <button className="btn btn-tichu" onClick={callTichu}>
            Tichu!
          </button>
        )}
      </div>
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

  const isMyTurn = gameState.currentPlayer === gameState.myPosition;
  const myInfo = gameState.players[gameState.myPosition];
  const canCallTichu = myInfo?.tichuCall === 'none' && !gameState.hasPlayedCards;
  const hasTrickOnTable = gameState.currentTrick.plays.length > 0;
  const isDragonGive = gameState.phase === GamePhase.DRAGON_GIVE;
  const isTeammate = (pos: PlayerPosition) => pos % 2 === gameState.myPosition % 2;

  // Check if we need to show the wish selector
  const lastPlay = gameState.currentTrick.plays[gameState.currentTrick.plays.length - 1];
  const showWishSelector =
    lastPlay &&
    lastPlay.playerPosition === gameState.myPosition &&
    lastPlay.combination.cards.some(
      (c) => c.type === 'special' && c.specialType === SpecialCardType.MAHJONG
    ) &&
    !gameState.wish.active;

  return (
    <div className="playing-layout">
      {/* Top opponent (partner) */}
      <div className="layout-top">
        <OpponentHand
          player={gameState.players[rel.top]}
          position="top"
          isCurrentTurn={gameState.currentPlayer === rel.top}
          isTeammate={isTeammate(rel.top)}
        />
      </div>

      {/* Middle row: left, trick area, right */}
      <div className="layout-middle">
        <OpponentHand
          player={gameState.players[rel.left]}
          position="left"
          isCurrentTurn={gameState.currentPlayer === rel.left}
          isTeammate={isTeammate(rel.left)}
        />

        <div className="trick-area">
          {gameState.wish.active && (
            <div className="wish-indicator">
              Wish: {gameState.wish.wishedRank}
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
                    {play.combination.cards.map((c) => (
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
        />
      </div>

      {/* Turn indicator */}
      <div className="turn-indicator">
        {isMyTurn ? (
          <span className="your-turn">Your turn</span>
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
        {isDragonGive && (
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
        {!isDragonGive && isMyTurn && (
          <div className="play-pass-group">
            <button
              className="btn btn-play"
              onClick={playCards}
              disabled={selectedCards.size === 0}
            >
              Play
            </button>
            {hasTrickOnTable && (
              <button className="btn btn-pass" onClick={passTurn}>
                Pass
              </button>
            )}
          </div>
        )}
        {canCallTichu && (
          <button className="btn btn-tichu" onClick={callTichu}>
            Tichu!
          </button>
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
    </div>
  );
}
