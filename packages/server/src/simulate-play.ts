/**
 * Comprehensive bot play strategy simulation — 10,000 games
 * Tests variations in play logic to find optimal parameters.
 *
 * Usage: npx tsx packages/server/src/simulate-play.ts
 */

import {
  GamePhase,
  SpecialCardType,
  CombinationType,
  isSpecial,
  findPlayableFromHand,
  detectCombination,
  type PlayerPosition,
  type Card,
  type TichuCall,
} from '@cyprus/shared';
import { GameEngine } from './GameEngine.js';
import { BotAI, type GameContext, type BotDifficulty } from './BotAI.js';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function buildGameContext(engine: GameEngine): GameContext {
  const playedCards: Card[] = [];
  for (const p of engine.state.players) {
    for (const trick of p.wonTricks) {
      playedCards.push(...trick);
    }
  }
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

interface RoundStats {
  tichuCalls: number; tichuSuccess: number;
  grandTichuCalls: number; grandTichuSuccess: number;
  bombsPlayed: number; dragonTricksGiven: number;
  turnsPlayed: number; passCount: number;
  partnerLetWin: number;
}

function runRound(engine: GameEngine, bots: BotAI[], stats: RoundStats): void {
  engine.startRound();

  for (let pos = 0; pos < 4; pos++) {
    const p = pos as PlayerPosition;
    const call = bots[pos].decideGrandTichu(engine.state.players[p].hand);
    engine.grandTichuDecision(p, call);
    if (call) stats.grandTichuCalls++;
  }

  // Build tichuCalls from current engine state for pass logic
  const tichuCalls: Record<PlayerPosition, TichuCall> = {
    0: engine.state.players[0].tichuCall,
    1: engine.state.players[1].tichuCall,
    2: engine.state.players[2].tichuCall,
    3: engine.state.players[3].tichuCall,
  };

  for (let pos = 0; pos < 4; pos++) {
    const p = pos as PlayerPosition;
    const cards = bots[pos].choosePassCards(engine.state.players[p].hand, p, tichuCalls);
    engine.passCards(p, cards);
  }

  let safety = 0;
  while (
    (engine.state.phase === GamePhase.PLAYING || engine.state.phase === GamePhase.DRAGON_GIVE) &&
    ++safety < 500
  ) {
    if (engine.state.trickWonPending) {
      engine.completeTrickWon();
      continue;
    }
    if (engine.state.roundEndPending) {
      engine.completeRoundEnd();
      continue;
    }

    if (engine.state.dogPending) {
      engine.resolveDog();
      continue;
    }

    if (engine.state.wishPending !== null) {
      const wishPos = engine.state.wishPending;
      const context = buildGameContext(engine);
      const rank = bots[wishPos].chooseWish(engine.state.players[wishPos].hand, context);
      engine.setWish(wishPos, rank);
      continue;
    }

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
      stats.dragonTricksGiven++;
      continue;
    }

    const cp = engine.state.currentPlayer;
    const player = engine.state.players[cp];

    if (player.tichuCall === 'none' && !player.hasPlayedCards) {
      if (bots[cp].decideTichu(player.hand)) {
        engine.callTichu(cp);
        stats.tichuCalls++;
      }
    }

    const context = buildGameContext(engine);
    const cardIds = bots[cp].choosePlay(
      player.hand, engine.state.currentTrick, engine.state.wish, cp, context
    );

    if (cardIds) {
      // Check if this play is a bomb before playing
      const playedCards = cardIds.map((id) => player.hand.find((c) => c.id === id)!).filter(Boolean);
      const combo = detectCombination(playedCards);
      if (combo && (combo.type === CombinationType.FOUR_OF_A_KIND_BOMB || combo.type === CombinationType.STRAIGHT_FLUSH_BOMB)) {
        stats.bombsPlayed++;
      }
      engine.playCards(cp, cardIds);
      stats.turnsPlayed++;
    } else {
      // Wish enforcement: if bot wants to pass but wish forces a play, find a valid combo
      if (engine.state.wish.active && engine.state.wish.wishedRank !== null) {
        const currentTop = engine.state.currentTrick.plays.length > 0
          ? engine.state.currentTrick.plays[engine.state.currentTrick.plays.length - 1].combination
          : null;
        const playable = findPlayableFromHand(player.hand, currentTop, engine.state.wish);
        const wishedPlay = playable.find((cards) =>
          cards.some((c) => c.type === 'normal' && c.rank === engine.state.wish.wishedRank)
        );
        if (wishedPlay) {
          engine.playCards(cp, wishedPlay.map((c) => c.id));
          stats.turnsPlayed++;
          continue;
        }
      }
      engine.passTurn(cp);
      stats.passCount++;
    }
  }

  for (const p of engine.state.players) {
    if (p.tichuCall === 'tichu' && p.finishOrder === 1) stats.tichuSuccess++;
    if (p.tichuCall === 'grand_tichu' && p.finishOrder === 1) stats.grandTichuSuccess++;
  }
}

interface GameResult {
  winner: 0 | 1;
  scores: [number, number];
  rounds: number;
  stats: RoundStats;
  doubleVictories: number;
  firstOutPositions: number[];
}

function runGame(difficulty: BotDifficulty): GameResult {
  const nicknames: [string, string, string, string] = ['A1', 'B1', 'A2', 'B2'];
  const engine = new GameEngine(nicknames, 1000);
  const bots = Array.from({ length: 4 }, () => new BotAI(difficulty));

  const stats: RoundStats = {
    tichuCalls: 0, tichuSuccess: 0,
    grandTichuCalls: 0, grandTichuSuccess: 0,
    bombsPlayed: 0, dragonTricksGiven: 0,
    turnsPlayed: 0, passCount: 0, partnerLetWin: 0,
  };

  let rounds = 0;
  let doubleVictories = 0;
  const firstOutPositions: number[] = [];

  while (engine.state.scores[0] < 1000 && engine.state.scores[1] < 1000 && rounds < 100) {
    runRound(engine, bots, stats);
    if (engine.state.finishOrder.length >= 2) {
      const first = engine.state.finishOrder[0];
      const second = engine.state.finishOrder[1];
      if (first % 2 === second % 2) doubleVictories++;
      firstOutPositions.push(first);
    }
    rounds++;
    if (engine.state.phase === GamePhase.ROUND_SCORING) engine.nextRound();
  }

  return {
    winner: engine.state.scores[0] >= 1000 ? 0 : 1,
    scores: engine.state.scores,
    rounds,
    stats,
    doubleVictories,
    firstOutPositions,
  };
}

function runBatch(numGames: number, difficulty: BotDifficulty, label: string) {
  let wins = [0, 0];
  let totalScores = [0, 0];
  let totalRounds = 0;
  let totalTurns = 0;
  let totalPasses = 0;
  let totalBombs = 0;
  let totalDragons = 0;
  let totalDoubleVictories = 0;
  let totalTichuCalls = 0;
  let totalTichuSuccess = 0;
  let totalGTCalls = 0;
  let totalGTSuccess = 0;
  let firstOutCounts = [0, 0, 0, 0];
  let errors = 0;
  let totalGames = 0;
  const errorBreakdown = new Map<string, number>();

  const startTime = Date.now();

  for (let i = 0; i < numGames; i++) {
    try {
      const result = runGame(difficulty);
      wins[result.winner]++;
      totalScores[0] += result.scores[0];
      totalScores[1] += result.scores[1];
      totalRounds += result.rounds;
      totalTurns += result.stats.turnsPlayed;
      totalPasses += result.stats.passCount;
      totalBombs += result.stats.bombsPlayed;
      totalDragons += result.stats.dragonTricksGiven;
      totalDoubleVictories += result.doubleVictories;
      totalTichuCalls += result.stats.tichuCalls;
      totalTichuSuccess += result.stats.tichuSuccess;
      totalGTCalls += result.stats.grandTichuCalls;
      totalGTSuccess += result.stats.grandTichuSuccess;
      for (const pos of result.firstOutPositions) firstOutCounts[pos]++;
      totalGames++;
    } catch (e) {
      errors++;
      const msg = (e as Error).message?.slice(0, 100) ?? 'unknown';
      if (!errorBreakdown.has(msg)) errorBreakdown.set(msg, 0);
      errorBreakdown.set(msg, errorBreakdown.get(msg)! + 1);
    }

    if ((i + 1) % 1000 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`  ${i + 1}/${numGames} (${elapsed}s)`);
    }
  }

  const n = totalGames;
  const avgRounds = totalRounds / n;
  const playRate = totalTurns / (totalTurns + totalPasses);
  const passRate = totalPasses / (totalTurns + totalPasses);
  const bombsPerGame = totalBombs / n;
  const dragonsPerGame = totalDragons / n;
  const doubleVicPerGame = totalDoubleVictories / n;
  const tichuRate = totalTichuCalls > 0 ? totalTichuSuccess / totalTichuCalls : 0;
  const gtRate = totalGTCalls > 0 ? totalGTSuccess / totalGTCalls : 0;
  const tichuPerGame = totalTichuCalls / n;
  const gtPerGame = totalGTCalls / n;
  // Net expected value per game from tichu calls
  const tichuNetPerGame = (totalTichuSuccess * 100 - (totalTichuCalls - totalTichuSuccess) * 100) / n;
  const gtNetPerGame = (totalGTSuccess * 200 - (totalGTCalls - totalGTSuccess) * 200) / n;

  const report = {
    label,
    games: n,
    errors,
    winRate: [wins[0] / n, wins[1] / n],
    avgScores: [totalScores[0] / n, totalScores[1] / n],
    avgRounds,
    playRate: Math.round(playRate * 1000) / 10,
    passRate: Math.round(passRate * 1000) / 10,
    bombsPerGame: Math.round(bombsPerGame * 10) / 10,
    dragonsPerGame: Math.round(dragonsPerGame * 10) / 10,
    doubleVictoriesPerGame: Math.round(doubleVicPerGame * 100) / 100,
    tichu: {
      callsPerGame: Math.round(tichuPerGame * 10) / 10,
      successRate: Math.round(tichuRate * 1000) / 10,
      netPointsPerGame: Math.round(tichuNetPerGame * 10) / 10,
    },
    grandTichu: {
      callsPerGame: Math.round(gtPerGame * 100) / 100,
      successRate: Math.round(gtRate * 1000) / 10,
      netPointsPerGame: Math.round(gtNetPerGame * 10) / 10,
    },
    firstOutDistribution: firstOutCounts.map((c) => Math.round(c / (totalRounds) * 1000) / 10),
  };

  if (errorBreakdown.size > 0) {
    console.log('\nError breakdown:');
    for (const [msg, count] of [...errorBreakdown.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${count}x: ${msg}`);
    }
  }

  return report;
}

// ─── Main ───────────────────────────────────────────────────────────────

const NUM_GAMES = 10000;

console.log(`=== Comprehensive Bot Simulation (${NUM_GAMES} games per test) ===\n`);

console.log('--- HARD MODE BASELINE ---');
const baseline = runBatch(NUM_GAMES, 'hard', 'Hard Baseline');

console.log('\n========================================');
console.log('RESULTS');
console.log('========================================\n');

console.log(`Games: ${baseline.games} (${baseline.errors} errors)`);
console.log(`Avg rounds/game: ${Math.round(baseline.avgRounds * 10) / 10}`);
console.log(`Avg scores: A=${Math.round(baseline.avgScores[0])} B=${Math.round(baseline.avgScores[1])}`);
console.log(`Play rate: ${baseline.playRate}%  Pass rate: ${baseline.passRate}%`);
console.log(`Bombs/game: ${baseline.bombsPerGame}`);
console.log(`Dragon tricks/game: ${baseline.dragonsPerGame}`);
console.log(`Double victories/game: ${baseline.doubleVictoriesPerGame}`);
console.log(`\nTichu: ${baseline.tichu.callsPerGame}/game, ${baseline.tichu.successRate}% success, net ${baseline.tichu.netPointsPerGame} pts/game`);
console.log(`Grand Tichu: ${baseline.grandTichu.callsPerGame}/game, ${baseline.grandTichu.successRate}% success, net ${baseline.grandTichu.netPointsPerGame} pts/game`);
console.log(`\nFirst out distribution: [${baseline.firstOutDistribution.join('%, ')}%]`);

// Analysis and recommendations
console.log('\n========================================');
console.log('ANALYSIS & RECOMMENDATIONS');
console.log('========================================\n');

const recommendations: string[] = [];

if (baseline.passRate > 40) {
  recommendations.push(`PASS RATE HIGH (${baseline.passRate}%): Bots pass too often. Consider lowering the threshold for playing cards — less passing means more control over tricks.`);
} else if (baseline.passRate < 20) {
  recommendations.push(`PASS RATE LOW (${baseline.passRate}%): Bots play too aggressively. They should pass more when partner is winning or when only high cards are available on low-value tricks.`);
}

if (baseline.bombsPerGame > 5) {
  recommendations.push(`BOMBS HIGH (${baseline.bombsPerGame}/game): Bots may be wasting bombs. Tighten bomb usage threshold — only bomb on high-value tricks (>=15 pts) or when opponent has <=2 cards.`);
} else if (baseline.bombsPerGame < 1) {
  recommendations.push(`BOMBS LOW (${baseline.bombsPerGame}/game): Bots are too conservative with bombs. Lower the trickPoints threshold for bombing.`);
}

if (baseline.doubleVictoriesPerGame > 0.5) {
  recommendations.push(`DOUBLE VICTORIES (${baseline.doubleVictoriesPerGame}/game): High rate suggests good team coordination.`);
} else if (baseline.doubleVictoriesPerGame < 0.2) {
  recommendations.push(`DOUBLE VICTORIES LOW (${baseline.doubleVictoriesPerGame}/game): Bots should play more cooperatively — pass more when partner is close to going out.`);
}

const tichuEV = baseline.tichu.successRate > 0 ? (baseline.tichu.successRate / 100 * 200 - 100) : 0;
if (tichuEV < 15) {
  recommendations.push(`TICHU EV LOW (${Math.round(tichuEV)} pts/call): Success rate too low for positive EV. Tighten calling conditions.`);
} else if (tichuEV > 40 && baseline.tichu.callsPerGame < 0.8) {
  recommendations.push(`TICHU UNDER-CALLED (EV=${Math.round(tichuEV)}, ${baseline.tichu.callsPerGame}/game): High success rate but called rarely. Loosen conditions to capture more bonus points.`);
}

const gtEV = baseline.grandTichu.successRate > 0 ? (baseline.grandTichu.successRate / 100 * 400 - 200) : 0;
if (gtEV < 0) {
  recommendations.push(`GRAND TICHU NEGATIVE EV (${Math.round(gtEV)} pts/call): Losing points on average. Raise threshold.`);
} else if (gtEV > 50 && baseline.grandTichu.callsPerGame < 0.05) {
  recommendations.push(`GRAND TICHU UNDER-CALLED: Very high success but almost never called. Could loosen slightly.`);
}

if (baseline.playRate > 0) {
  const turnsPerRound = (baseline.bombsPerGame + baseline.dragonsPerGame) / baseline.avgRounds;
  if (turnsPerRound > 2) {
    recommendations.push('SPECIAL CARDS FREQUENT: Lots of bombs/dragons per round. Games may feel chaotic.');
  }
}

if (recommendations.length === 0) {
  recommendations.push('Current parameters look well-balanced across all metrics!');
}

for (const rec of recommendations) {
  console.log(`• ${rec}`);
}

// Save full results
const outputPath = join(__dirname, '..', 'data', 'simulation-play-results.json');
writeFileSync(outputPath, JSON.stringify({
  timestamp: new Date().toISOString(),
  numGames: NUM_GAMES,
  baseline,
  recommendations,
}, null, 2));

console.log(`\nFull results saved to ${outputPath}`);
