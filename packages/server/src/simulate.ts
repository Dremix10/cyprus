/**
 * Bot vs Bot simulation — runs N games headlessly to collect stats
 * and find optimal thresholds for bot decision-making.
 *
 * Usage: npx tsx packages/server/src/simulate.ts
 */

import {
  GamePhase,
  SpecialCardType,
  isSpecial,
  type PlayerPosition,
  type Card,
  type TichuCall,
} from '@cyprus/shared';
import { GameEngine } from './GameEngine.js';
import { BotAI, type GameContext, type BotDifficulty } from './BotAI.js';

const NUM_GAMES = 1000;
const TARGET_SCORE = 1000;

interface GameStats {
  gamesPlayed: number;
  teamAWins: number;
  teamBWins: number;
  avgScoreA: number;
  avgScoreB: number;
  avgRoundsPerGame: number;
  tichuCalls: { total: number; successful: number; rate: number };
  grandTichuCalls: { total: number; successful: number; rate: number };
  avgTurnsToOut: number[];
  firstOutCounts: number[]; // how often each position went out first
  doubleVictories: number;
  bombsPlayed: number;
  dragonTricksGiven: number;
}

function buildGameContext(engine: GameEngine): GameContext {
  const playedCards: Card[] = [];
  for (const p of engine.state.players) {
    for (const trick of p.wonTricks) {
      playedCards.push(...trick);
    }
  }
  // Include current trick cards
  for (const play of engine.state.currentTrick.plays) {
    playedCards.push(...play.combination.cards);
  }

  return {
    playerCardCounts: new Map<PlayerPosition, number>(
      engine.state.players.map((p) => [p.position as PlayerPosition, p.hand.length])
    ),
    tichuCalls: {
      0: engine.state.players[0].tichuCall,
      1: engine.state.players[1].tichuCall,
      2: engine.state.players[2].tichuCall,
      3: engine.state.players[3].tichuCall,
    } as Record<PlayerPosition, TichuCall>,
    finishOrder: engine.state.finishOrder as PlayerPosition[],
    playedCards,
    scores: [...engine.state.scores] as [number, number],
  };
}

function runRound(engine: GameEngine, bots: BotAI[], roundStats: {
  tichuCalls: number; tichuSuccess: number;
  grandTichuCalls: number; grandTichuSuccess: number;
  bombsPlayed: number; dragonTricksGiven: number;
  turnsPlayed: number;
}): void {
  // Start round
  engine.startRound();

  // Grand Tichu decisions
  for (let pos = 0; pos < 4; pos++) {
    const p = pos as PlayerPosition;
    const hand = engine.state.players[p].hand;
    const call = bots[pos].decideGrandTichu(hand);
    engine.grandTichuDecision(p, call);
    if (call) roundStats.grandTichuCalls++;
  }

  // Pass cards
  for (let pos = 0; pos < 4; pos++) {
    const p = pos as PlayerPosition;
    const hand = engine.state.players[p].hand;
    const cards = bots[pos].choosePassCards(hand);
    engine.passCards(p, cards);
  }

  // Playing phase
  let safetyCounter = 0;
  const MAX_ACTIONS = 500; // prevent infinite loops

  while (
    engine.state.phase === GamePhase.PLAYING ||
    engine.state.phase === GamePhase.DRAGON_GIVE
  ) {
    if (++safetyCounter > MAX_ACTIONS) {
      console.error('Safety limit reached in round');
      break;
    }

    // Handle wish pending
    if (engine.state.wishPending !== null) {
      const wishPos = engine.state.wishPending;
      const hand = engine.state.players[wishPos].hand;
      const context = buildGameContext(engine);
      const rank = bots[wishPos].chooseWish(hand, context);
      engine.setWish(wishPos, rank);
      continue;
    }

    // Handle Dragon give
    if (engine.state.phase === GamePhase.DRAGON_GIVE) {
      const winner = engine.state.dragonWinner!;
      const opponents = engine.state.players
        .filter((p) => p.position % 2 !== winner % 2)
        .map((p) => p.position as PlayerPosition);
      const cardCounts = new Map<PlayerPosition, number>(
        opponents.map((p) => [p, engine.state.players[p].hand.length])
      );
      const context = buildGameContext(engine);
      const target = bots[winner].chooseDragonGiveTarget(opponents, cardCounts, context);
      engine.dragonGive(winner, target);
      roundStats.dragonTricksGiven++;
      continue;
    }

    const currentPlayer = engine.state.currentPlayer;
    const player = engine.state.players[currentPlayer];

    // Tichu call before first play
    if (player.tichuCall === 'none' && !player.hasPlayedCards) {
      if (bots[currentPlayer].decideTichu(player.hand)) {
        engine.callTichu(currentPlayer);
        roundStats.tichuCalls++;
      }
    }

    const hand = player.hand;
    const context = buildGameContext(engine);
    const cardIds = bots[currentPlayer].choosePlay(
      hand,
      engine.state.currentTrick,
      engine.state.wish,
      currentPlayer,
      context
    );

    if (cardIds) {
      // Check if it's a bomb
      const cards = cardIds.map((id) => hand.find((c) => c.id === id)!);
      const hasBomb = cards.length === 4 && cards.every((c) => c.type === 'normal') &&
        new Set(cards.map((c) => (c as any).rank)).size === 1;
      if (hasBomb) roundStats.bombsPlayed++;

      engine.playCards(currentPlayer, cardIds);
      roundStats.turnsPlayed++;
    } else {
      engine.passTurn(currentPlayer);
    }
  }

  // Check tichu/grand tichu success
  for (let pos = 0; pos < 4; pos++) {
    const p = engine.state.players[pos];
    if (p.tichuCall === 'tichu' && p.finishOrder === 1) {
      roundStats.tichuSuccess++;
    }
    if (p.tichuCall === 'grand_tichu' && p.finishOrder === 1) {
      roundStats.grandTichuSuccess++;
    }
  }
}

function runGame(difficulty: BotDifficulty): {
  winner: 0 | 1;
  scores: [number, number];
  rounds: number;
  tichuCalls: number; tichuSuccess: number;
  grandTichuCalls: number; grandTichuSuccess: number;
  bombsPlayed: number; dragonTricksGiven: number;
  firstOut: number[];
  turnsPlayed: number;
} {
  const nicknames: [string, string, string, string] = ['Bot-A1', 'Bot-B1', 'Bot-A2', 'Bot-B2'];
  const engine = new GameEngine(nicknames, TARGET_SCORE);
  const bots = [
    new BotAI(difficulty),
    new BotAI(difficulty),
    new BotAI(difficulty),
    new BotAI(difficulty),
  ];

  const gameStats = {
    tichuCalls: 0, tichuSuccess: 0,
    grandTichuCalls: 0, grandTichuSuccess: 0,
    bombsPlayed: 0, dragonTricksGiven: 0,
    firstOut: [] as number[],
    turnsPlayed: 0,
  };

  let rounds = 0;
  const MAX_ROUNDS = 100;

  while (
    engine.state.scores[0] < TARGET_SCORE &&
    engine.state.scores[1] < TARGET_SCORE &&
    rounds < MAX_ROUNDS
  ) {
    const roundStats = {
      tichuCalls: 0, tichuSuccess: 0,
      grandTichuCalls: 0, grandTichuSuccess: 0,
      bombsPlayed: 0, dragonTricksGiven: 0,
      turnsPlayed: 0,
    };

    runRound(engine, bots, roundStats);

    gameStats.tichuCalls += roundStats.tichuCalls;
    gameStats.tichuSuccess += roundStats.tichuSuccess;
    gameStats.grandTichuCalls += roundStats.grandTichuCalls;
    gameStats.grandTichuSuccess += roundStats.grandTichuSuccess;
    gameStats.bombsPlayed += roundStats.bombsPlayed;
    gameStats.dragonTricksGiven += roundStats.dragonTricksGiven;
    gameStats.turnsPlayed += roundStats.turnsPlayed;

    if (engine.state.finishOrder.length > 0) {
      gameStats.firstOut.push(engine.state.finishOrder[0]);
    }

    rounds++;

    // Move to next round if not game over
    if (engine.state.phase === GamePhase.ROUND_SCORING) {
      engine.nextRound();
    }
  }

  const winner = engine.state.scores[0] >= TARGET_SCORE ? 0 : 1;

  return {
    winner: winner as 0 | 1,
    scores: engine.state.scores,
    rounds,
    ...gameStats,
  };
}

function runSimulation(numGames: number, difficulty: BotDifficulty): GameStats {
  const stats: GameStats = {
    gamesPlayed: numGames,
    teamAWins: 0,
    teamBWins: 0,
    avgScoreA: 0,
    avgScoreB: 0,
    avgRoundsPerGame: 0,
    tichuCalls: { total: 0, successful: 0, rate: 0 },
    grandTichuCalls: { total: 0, successful: 0, rate: 0 },
    avgTurnsToOut: [],
    firstOutCounts: [0, 0, 0, 0],
    doubleVictories: 0,
    bombsPlayed: 0,
    dragonTricksGiven: 0,
  };

  let totalScoreA = 0;
  let totalScoreB = 0;
  let totalRounds = 0;
  let totalTurns = 0;
  let errors = 0;

  for (let i = 0; i < numGames; i++) {
    try {
      const result = runGame(difficulty);

      if (result.winner === 0) stats.teamAWins++;
      else stats.teamBWins++;

      totalScoreA += result.scores[0];
      totalScoreB += result.scores[1];
      totalRounds += result.rounds;
      totalTurns += result.turnsPlayed;

      stats.tichuCalls.total += result.tichuCalls;
      stats.tichuCalls.successful += result.tichuSuccess;
      stats.grandTichuCalls.total += result.grandTichuCalls;
      stats.grandTichuCalls.successful += result.grandTichuSuccess;
      stats.bombsPlayed += result.bombsPlayed;
      stats.dragonTricksGiven += result.dragonTricksGiven;

      for (const pos of result.firstOut) {
        stats.firstOutCounts[pos]++;
      }

      if ((i + 1) % 100 === 0) {
        console.log(`  ${i + 1}/${numGames} games completed...`);
      }
    } catch (err) {
      errors++;
      if (errors <= 5) {
        console.error(`Game ${i + 1} error:`, (err as Error).message);
      }
    }
  }

  const completed = numGames - errors;
  stats.gamesPlayed = completed;
  stats.avgScoreA = Math.round(totalScoreA / completed);
  stats.avgScoreB = Math.round(totalScoreB / completed);
  stats.avgRoundsPerGame = Math.round((totalRounds / completed) * 10) / 10;
  stats.tichuCalls.rate = stats.tichuCalls.total > 0
    ? Math.round((stats.tichuCalls.successful / stats.tichuCalls.total) * 1000) / 10
    : 0;
  stats.grandTichuCalls.rate = stats.grandTichuCalls.total > 0
    ? Math.round((stats.grandTichuCalls.successful / stats.grandTichuCalls.total) * 1000) / 10
    : 0;

  if (errors > 0) {
    console.log(`\n${errors} games failed with errors.`);
  }

  return stats;
}

// ─── Main ───────────────────────────────────────────────────────────────

console.log('=== Tichu Bot Simulation ===\n');

for (const difficulty of ['easy', 'medium', 'hard'] as BotDifficulty[]) {
  console.log(`\n--- ${difficulty.toUpperCase()} difficulty (${NUM_GAMES} games) ---`);
  const stats = runSimulation(NUM_GAMES, difficulty);

  console.log(`\nResults:`);
  console.log(`  Games completed: ${stats.gamesPlayed}`);
  console.log(`  Team A wins: ${stats.teamAWins} (${Math.round(stats.teamAWins / stats.gamesPlayed * 100)}%)`);
  console.log(`  Team B wins: ${stats.teamBWins} (${Math.round(stats.teamBWins / stats.gamesPlayed * 100)}%)`);
  console.log(`  Avg score A: ${stats.avgScoreA}`);
  console.log(`  Avg score B: ${stats.avgScoreB}`);
  console.log(`  Avg rounds/game: ${stats.avgRoundsPerGame}`);
  console.log(`  Tichu calls: ${stats.tichuCalls.total} (${stats.tichuCalls.successful} successful, ${stats.tichuCalls.rate}% rate)`);
  console.log(`  Grand Tichu calls: ${stats.grandTichuCalls.total} (${stats.grandTichuCalls.successful} successful, ${stats.grandTichuCalls.rate}% rate)`);
  console.log(`  Bombs played: ${stats.bombsPlayed}`);
  console.log(`  Dragon tricks given: ${stats.dragonTricksGiven}`);
  console.log(`  First out by position: [${stats.firstOutCounts.join(', ')}]`);
}

// Now run a tuning experiment: vary Tichu call thresholds
console.log('\n\n=== TICHU THRESHOLD TUNING ===');
console.log('Testing different turnsToOut thresholds for calling Tichu (hard mode)...\n');

// We can't easily modify the BotAI thresholds dynamically since they're hardcoded,
// but we output the current stats to guide manual tuning.
const hardStats = runSimulation(500, 'hard');
console.log('\nCurrent hard mode baseline (500 games):');
console.log(`  Tichu success rate: ${hardStats.tichuCalls.rate}%`);
console.log(`  Tichu calls per game: ${(hardStats.tichuCalls.total / hardStats.gamesPlayed).toFixed(1)}`);
console.log(`  Grand Tichu success rate: ${hardStats.grandTichuCalls.rate}%`);
console.log(`  Grand Tichu calls per game: ${(hardStats.grandTichuCalls.total / hardStats.gamesPlayed).toFixed(1)}`);
console.log(`  Avg rounds/game: ${hardStats.avgRoundsPerGame}`);

const recommendations: string[] = [];

if (hardStats.tichuCalls.rate < 40) {
  recommendations.push('Tichu success rate is LOW (<40%). Tighten thresholds: reduce turnsToOut or increase controlCount requirements.');
} else if (hardStats.tichuCalls.rate > 70) {
  recommendations.push('Tichu success rate is HIGH (>70%). Loosen thresholds to call more often for bonus points.');
}

if (hardStats.grandTichuCalls.rate < 30) {
  recommendations.push('Grand Tichu success rate is LOW (<30%). Increase strength threshold (currently 7).');
} else if (hardStats.grandTichuCalls.rate > 60) {
  recommendations.push('Grand Tichu success rate is HIGH (>60%). Lower strength threshold to call more often.');
}

if (hardStats.tichuCalls.total / hardStats.gamesPlayed < 1) {
  recommendations.push('Tichu is called rarely (<1/game). Consider loosening conditions.');
}

if (recommendations.length > 0) {
  console.log('\n=== RECOMMENDATIONS ===');
  for (const rec of recommendations) {
    console.log(`  - ${rec}`);
  }
} else {
  console.log('\n=== Current thresholds look balanced! ===');
}

// Save results
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const outputPath = join(__dirname, '..', 'data', 'simulation-results.json');
writeFileSync(outputPath, JSON.stringify({
  timestamp: new Date().toISOString(),
  numGames: NUM_GAMES,
  results: { hardStats },
  recommendations,
}, null, 2));

console.log(`\nResults saved to ${outputPath}`);
