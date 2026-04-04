import { useGameStore } from '../stores/gameStore.js';
import { GamePhase, SpecialCardType } from '@cyprus/shared';
import type { PlayerPosition } from '@cyprus/shared';
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
        <span>
          Team A: {gameState.scores[0]}
        </span>
        <span className="phase-label">{formatPhase(gameState.phase)}</span>
        <span>
          Team B: {gameState.scores[1]}
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
    return <p className="info">Waiting for others to pass cards...</p>;
  }

  const selectedArray = [...selectedCards];
  const canPass = selectedArray.length === 3;

  return (
    <div className="phase-view">
      <h3>Pass Cards</h3>
      <p className="info">Select 3 cards: one for left, across, and right.</p>
      <PlayerHand
        cards={gameState.myHand}
        selectedCards={selectedCards}
        onToggle={toggleCard}
      />
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
        />
      </div>

      {/* Middle row: left, trick area, right */}
      <div className="layout-middle">
        <OpponentHand
          player={gameState.players[rel.left]}
          position="left"
          isCurrentTurn={gameState.currentPlayer === rel.left}
        />

        <div className="trick-area">
          {gameState.wish.active && (
            <div className="wish-indicator">
              Wish: {gameState.wish.wishedRank}
            </div>
          )}
          {gameState.currentTrick.plays.length > 0 ? (
            <div className="trick-cards">
              {gameState.currentTrick.plays.map((play, i) => (
                <div key={i} className="trick-play">
                  <span className="trick-player">
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
      <PlayerHand
        cards={gameState.myHand}
        selectedCards={selectedCards}
        onToggle={toggleCard}
      />

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
          <>
            <button
              className="btn btn-primary"
              onClick={playCards}
              disabled={selectedCards.size === 0}
            >
              Play
            </button>
            {hasTrickOnTable && (
              <button className="btn btn-secondary" onClick={passTurn}>
                Pass
              </button>
            )}
          </>
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

function ScoringView() {
  const gameState = useGameStore((s) => s.gameState)!;
  const nextRound = useGameStore((s) => s.nextRound);

  return (
    <div className="phase-view">
      <h3>Round Over</h3>
      <div className="scores">
        <div className="score-row">
          <span className="score-team">Team A</span>
          <span className="score-round">+{gameState.roundScores[0]}</span>
          <span className="score-total">{gameState.scores[0]}</span>
        </div>
        <div className="score-row">
          <span className="score-team">Team B</span>
          <span className="score-round">+{gameState.roundScores[1]}</span>
          <span className="score-total">{gameState.scores[1]}</span>
        </div>
      </div>
      <button className="btn btn-primary" onClick={nextRound}>
        Next Round
      </button>
    </div>
  );
}

function GameOverView() {
  const gameState = useGameStore((s) => s.gameState)!;
  const winner = gameState.scores[0] >= 1000 ? 'Team A' : 'Team B';

  return (
    <div className="phase-view">
      <h3>Game Over!</h3>
      <p className="winner">{winner} wins!</p>
      <div className="scores">
        <div className="score-row">
          <span className="score-team">Team A</span>
          <span className="score-total">{gameState.scores[0]}</span>
        </div>
        <div className="score-row">
          <span className="score-team">Team B</span>
          <span className="score-total">{gameState.scores[1]}</span>
        </div>
      </div>
    </div>
  );
}
