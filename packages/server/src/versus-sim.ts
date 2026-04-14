/**
 * Asymmetric bot simulation: Team A (config A) vs Team B (config B)
 * Run 10,000 games head-to-head to determine which config is stronger.
 *
 * Usage: npx tsx packages/server/src/versus-sim.ts
 *
 * To test a change: modify CONFIG_B below, keep CONFIG_A as baseline.
 * If Team B wins significantly more (>52%), the change is a real improvement.
 */
import {
  GamePhase,
  type PlayerPosition,
  type Card,
  type TichuCall,
  findPlayableFromHand,
} from '@cyprus/shared';
import { GameEngine } from './GameEngine.js';
import { BotAI, type BotConfig, type GameContext, DEFAULT_BOT_CONFIG } from './BotAI.js';
import { monteCarloEvaluate } from './MonteCarloSim.js';

// ─── OLD MC EVALUATOR (baseline: 50 sims, 40ms, old eval) ─────────────
function oldEvaluateOutcome(engine: GameEngine, botPosition: PlayerPosition): number {
  const myTeam = botPosition % 2;
  let score = engine.state.roundScores[myTeam] - engine.state.roundScores[1 - myTeam];
  const finishOrder = engine.state.finishOrder;
  if (finishOrder.length > 0) {
    const firstOut = finishOrder[0];
    if (firstOut % 2 === myTeam) score += 30;
    else score -= 30;
  }
  return score;
}

function oldMonteCarloEvaluate(
  engine: GameEngine,
  botPosition: PlayerPosition,
  candidates: (Card[] | null)[],
): string[] | null {
  // Old behavior: only 50 sims, 40ms, simple eval
  // We import internals we need from MonteCarloSim via the public function
  // but override the budget. Use the new function with old budget.
  return monteCarloEvaluate(engine, botPosition, candidates, 50, 40);
}

// ─── CONFIGS TO COMPARE ────────────────────────────────────────────────
// Team A (positions 0, 2) = OLD MC (50 sims, lead-only)
const CONFIG_A: Partial<BotConfig> = {
  useMonteCarlo: true,
};

// Team B (positions 1, 3) = NEW MC (200 sims, lead+follow, better eval)
const CONFIG_B: Partial<BotConfig> = {
  useMonteCarlo: true,
};

// Team A uses old MC behavior: lead-only, 50 sims, 40ms
const TEAM_A_LEAD_ONLY = true;

// ─── SIMULATION SETTINGS ───────────────────────────────────────────────
const NUM_GAMES = parseInt(process.argv[2] || '1000', 10);
const TARGET_SCORE = 1000;
const MAX_ROUNDS = 50;

// ─── HELPERS ───────────────────────────────────────────────────────────
function buildCtx(engine: GameEngine): GameContext {
  const played: Card[] = [];
  for (const p of engine.state.players) for (const t of p.wonTricks) played.push(...t);
  for (const play of engine.state.currentTrick.plays) played.push(...play.combination.cards);
  return {
    playerCardCounts: new Map(engine.state.players.map((p) => [p.position as PlayerPosition, p.hand.length])),
    tichuCalls: {
      0: engine.state.players[0].tichuCall,
      1: engine.state.players[1].tichuCall,
      2: engine.state.players[2].tichuCall,
      3: engine.state.players[3].tichuCall,
    } as Record<PlayerPosition, TichuCall>,
    finishOrder: engine.state.finishOrder as PlayerPosition[],
    playedCards: played,
    scores: [...engine.state.scores] as [number, number],
  };
}

function getBotForPosition(pos: number, bots: BotAI[]): BotAI {
  return bots[pos];
}

// ─── GAME RUNNER ───────────────────────────────────────────────────────
interface GameResult {
  winner: 0 | 1; // 0 = Team A, 1 = Team B
  scores: [number, number];
  rounds: number;
  tichuA: { calls: number; success: number };
  tichuB: { calls: number; success: number };
  firstOutA: number;
  firstOutB: number;
}

function runGame(configA: Partial<BotConfig>, configB: Partial<BotConfig>, swapped: boolean = false): GameResult {
  const engine = new GameEngine(['A0', 'B1', 'A2', 'B3'], TARGET_SCORE);
  // Positions 0,2 = Team A (configA), Positions 1,3 = Team B (configB)
  const bots = [
    new BotAI('hard', configA), // pos 0 - Team A
    new BotAI('hard', configB), // pos 1 - Team B
    new BotAI('hard', configA), // pos 2 - Team A
    new BotAI('hard', configB), // pos 3 - Team B
  ];

  let rounds = 0;
  const tichuA = { calls: 0, success: 0 };
  const tichuB = { calls: 0, success: 0 };
  let firstOutA = 0, firstOutB = 0;

  engine.startRound();
  rounds++;

  while (engine.state.phase !== GamePhase.GAME_OVER && rounds <= MAX_ROUNDS) {
    // Grand Tichu
    for (let p = 0; p < 4; p++) {
      if (!engine.state.players[p].grandTichuDecided) {
        const call = bots[p].decideGrandTichu(engine.state.players[p].hand);
        engine.grandTichuDecision(p as PlayerPosition, call);
      }
    }

    // Passing
    if (engine.state.phase === GamePhase.PASSING) {
      for (let p = 0; p < 4; p++) {
        const tc = {
          0: engine.state.players[0].tichuCall,
          1: engine.state.players[1].tichuCall,
          2: engine.state.players[2].tichuCall,
          3: engine.state.players[3].tichuCall,
        } as Record<PlayerPosition, TichuCall>;
        engine.passCards(
          p as PlayerPosition,
          bots[p].choosePassCards(engine.state.players[p].hand, p as PlayerPosition, tc)
        );
      }
    }

    // Playing
    let safety = 0;
    while ((engine.state.phase === GamePhase.PLAYING || engine.state.phase === GamePhase.DRAGON_GIVE) && safety < 500) {
      safety++;

      if (engine.state.dogPending) { engine.resolveDog(); continue; }
      if (engine.state.trickWonPending) { engine.completeTrickWon(); continue; }
      if (engine.state.roundEndPending) { engine.completeRoundEnd(); continue; }

      if (engine.state.wishPending !== null) {
        const wp = engine.state.wishPending;
        engine.setWish(wp, bots[wp].chooseWish(engine.state.players[wp].hand, buildCtx(engine)));
        continue;
      }

      if (engine.state.phase === GamePhase.DRAGON_GIVE) {
        const w = engine.state.dragonWinner!;
        const opps = engine.state.players
          .filter((p) => p.position % 2 !== w % 2)
          .map((p) => p.position as PlayerPosition);
        const cc = new Map(opps.map((p) => [p, engine.state.players[p].hand.length] as [PlayerPosition, number]));
        engine.dragonGive(w, bots[w].chooseDragonGiveTarget(opps, cc, buildCtx(engine)));
        continue;
      }

      const cp = engine.state.currentPlayer;
      const pl = engine.state.players[cp];

      if (pl.tichuCall === 'none' && !pl.hasPlayedCards && bots[cp].decideTichu(pl.hand)) {
        engine.callTichu(cp);
        if (cp % 2 === 0) tichuA.calls++; else tichuB.calls++;
      }

      // Build MC evaluator — old MC for Team A, new MC for Team B
      const isTeamA = cp % 2 === 0;
      let mcEval: ((candidates: (Card[] | null)[]) => string[] | null) | undefined;
      if (bots[cp].config.useMonteCarlo && !bots[cp].inRollout) {
        if (isTeamA !== swapped) {
          // Team A (old): lead-only, 50 sims, 40ms
          const isLeading = engine.state.currentTrick.plays.length === 0;
          if (isLeading && pl.hand.length >= 5) {
            mcEval = (candidates) => oldMonteCarloEvaluate(engine, cp, candidates);
          }
        } else {
          // Team B (new): lead+follow, 200 sims, 150ms (default)
          mcEval = (candidates) => monteCarloEvaluate(engine, cp, candidates);
        }
      }

      let ids = bots[cp].choosePlay(pl.hand, engine.state.currentTrick, engine.state.wish, cp, buildCtx(engine), mcEval);

      // Wish enforcement
      if (!ids && engine.state.wish.active && engine.state.wish.wishedRank !== null) {
        const currentTop = engine.state.currentTrick.plays.length > 0
          ? engine.state.currentTrick.plays[engine.state.currentTrick.plays.length - 1].combination
          : null;
        const playable = findPlayableFromHand(pl.hand, currentTop, engine.state.wish);
        const wishedPlay = playable.find((cards) =>
          cards.some((c) => c.type === 'normal' && c.rank === engine.state.wish.wishedRank)
        );
        if (wishedPlay) ids = wishedPlay.map((c) => c.id);
      }

      if (ids) engine.playCards(cp, ids); else engine.passTurn(cp);
    }

    // Track tichu results
    for (const p of engine.state.players) {
      if (p.tichuCall === 'tichu' && p.finishOrder === 1) {
        if (p.position % 2 === 0) tichuA.success++; else tichuB.success++;
      }
      if (p.tichuCall === 'grand_tichu' && p.finishOrder === 1) {
        if (p.position % 2 === 0) tichuA.success++; else tichuB.success++;
      }
    }

    // Track first out
    if (engine.state.finishOrder.length > 0) {
      const first = engine.state.finishOrder[0];
      if (first % 2 === 0) firstOutA++; else firstOutB++;
    }

    if (engine.state.phase === GamePhase.ROUND_SCORING) {
      engine.nextRound();
      rounds++;
    }
  }

  const winner = engine.state.scores[0] >= TARGET_SCORE ? 0 : 1;
  return {
    winner: winner as 0 | 1,
    scores: [...engine.state.scores] as [number, number],
    rounds,
    tichuA, tichuB,
    firstOutA, firstOutB,
  };
}

// ─── MAIN ──────────────────────────────────────────────────────────────
console.log(`=== Versus Simulation: ${NUM_GAMES} games ===`);
console.log(`Team A (pos 0,2): OLD MC (50 sims/40ms, lead-only, hand>=5)`);
console.log(`Team B (pos 1,3): NEW MC (200 sims/150ms, lead+follow, hand>=2, better eval)`);
console.log('');

const start = Date.now();
let teamAWins = 0, teamBWins = 0, errors = 0;
let totalScoreA = 0, totalScoreB = 0, totalRounds = 0;
let totalTichuA = { calls: 0, success: 0 };
let totalTichuB = { calls: 0, success: 0 };
let totalFirstOutA = 0, totalFirstOutB = 0;

// Also run games with swapped positions to eliminate positional bias
const halfGames = Math.floor(NUM_GAMES / 2);

for (let g = 0; g < NUM_GAMES; g++) {
  try {
    // First half: A=pos0,2 B=pos1,3. Second half: swap.
    const swapped = g >= halfGames;
    const cA = swapped ? CONFIG_B : CONFIG_A;
    const cB = swapped ? CONFIG_A : CONFIG_B;
    const result = runGame(cA, cB, swapped);

    // Map result back to original configs
    const actualAWon = swapped ? result.winner === 1 : result.winner === 0;
    if (actualAWon) teamAWins++; else teamBWins++;

    if (swapped) {
      totalScoreA += result.scores[1]; totalScoreB += result.scores[0];
      totalTichuA.calls += result.tichuB.calls; totalTichuA.success += result.tichuB.success;
      totalTichuB.calls += result.tichuA.calls; totalTichuB.success += result.tichuA.success;
      totalFirstOutA += result.firstOutB; totalFirstOutB += result.firstOutA;
    } else {
      totalScoreA += result.scores[0]; totalScoreB += result.scores[1];
      totalTichuA.calls += result.tichuA.calls; totalTichuA.success += result.tichuA.success;
      totalTichuB.calls += result.tichuB.calls; totalTichuB.success += result.tichuB.success;
      totalFirstOutA += result.firstOutA; totalFirstOutB += result.firstOutB;
    }

    totalRounds += result.rounds;

    if ((g + 1) % 1000 === 0) {
      const pct = (100 * teamBWins / (g + 1 - errors)).toFixed(1);
      console.log(`  ${g + 1}/${NUM_GAMES} — Team B win rate: ${pct}%`);
    }
  } catch (e) {
    errors++;
    if (errors <= 5) console.error(`Game ${g + 1}:`, (e as Error).message);
  }
}

const done = NUM_GAMES - errors;
const ms = Date.now() - start;

console.log(`\n=== RESULTS (${done} games in ${(ms / 1000).toFixed(1)}s) ===`);
console.log(`Position swap: first ${halfGames} normal, last ${NUM_GAMES - halfGames} swapped`);
console.log('');
console.log('Team A (OLD MC):');
console.log(`  Wins: ${teamAWins}/${done} (${(100 * teamAWins / done).toFixed(1)}%)`);
console.log(`  Avg score: ${Math.round(totalScoreA / done)}`);
console.log(`  First outs: ${totalFirstOutA} (${(100 * totalFirstOutA / totalRounds).toFixed(1)}% of rounds)`);
console.log(`  Tichu: ${totalTichuA.calls} calls, ${totalTichuA.success} success (${totalTichuA.calls ? (100 * totalTichuA.success / totalTichuA.calls).toFixed(1) : 0}%)`);
console.log('');
console.log('Team B (NEW MC):');
console.log(`  Wins: ${teamBWins}/${done} (${(100 * teamBWins / done).toFixed(1)}%)`);
console.log(`  Avg score: ${Math.round(totalScoreB / done)}`);
console.log(`  First outs: ${totalFirstOutB} (${(100 * totalFirstOutB / totalRounds).toFixed(1)}% of rounds)`);
console.log(`  Tichu: ${totalTichuB.calls} calls, ${totalTichuB.success} success (${totalTichuB.calls ? (100 * totalTichuB.success / totalTichuB.calls).toFixed(1) : 0}%)`);
console.log('');

const winRateB = 100 * teamBWins / done;
if (winRateB > 52) {
  console.log(`>>> CHALLENGER WINS (${winRateB.toFixed(1)}%). The change is an improvement.`);
} else if (winRateB < 48) {
  console.log(`>>> BASELINE WINS (${(100 - winRateB).toFixed(1)}%). The change made things worse.`);
} else {
  console.log(`>>> NO SIGNIFICANT DIFFERENCE (${winRateB.toFixed(1)}%). Change is neutral.`);
}

if (errors > 0) console.log(`\nErrors: ${errors}`);
