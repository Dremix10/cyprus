/**
 * MC Budget A/B test: same MC code, different simulation budgets.
 * Tests whether more thinking time makes the existing MC stronger.
 *
 * Usage: npx tsx packages/server/src/budget-sim.ts [numGames]
 */
import {
  GamePhase,
  type PlayerPosition,
  type Card,
  type TichuCall,
  findPlayableFromHand,
} from '@cyprus/shared';
import { GameEngine } from './GameEngine.js';
import { BotAI, type BotConfig, type GameContext } from './BotAI.js';
import { monteCarloEvaluate } from './MonteCarloSim.js';

const NUM_GAMES = parseInt(process.argv[2] || '50', 10);
const TARGET_SCORE = 1000;
const MAX_ROUNDS = 50;

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

interface BudgetConfig {
  label: string;
  sims: number;
  timeMs: number;
}

interface TichuStats {
  tichuCalls: number;
  tichuSuccess: number;
  grandTichuCalls: number;
  grandTichuSuccess: number;
}

interface GameResult {
  winner: 0 | 1;
  scores: [number, number];
  rounds: number;
  tichuA: TichuStats;
  tichuB: TichuStats;
  firstOutA: number;
  firstOutB: number;
  doubleVictoryA: number;
  doubleVictoryB: number;
}

function runGame(budgetA: BudgetConfig, budgetB: BudgetConfig, swapped: boolean): GameResult {
  const config: Partial<BotConfig> = { useMonteCarlo: true };
  const engine = new GameEngine(['A0', 'B1', 'A2', 'B3'], TARGET_SCORE);
  const bots = [
    new BotAI('hard', config),
    new BotAI('hard', config),
    new BotAI('hard', config),
    new BotAI('hard', config),
  ];

  let rounds = 0;
  const tichuA: TichuStats = { tichuCalls: 0, tichuSuccess: 0, grandTichuCalls: 0, grandTichuSuccess: 0 };
  const tichuB: TichuStats = { tichuCalls: 0, tichuSuccess: 0, grandTichuCalls: 0, grandTichuSuccess: 0 };
  let firstOutA = 0, firstOutB = 0;
  let doubleVictoryA = 0, doubleVictoryB = 0;

  engine.startRound();
  rounds++;

  while (engine.state.phase !== GamePhase.GAME_OVER && rounds <= MAX_ROUNDS) {
    for (let p = 0; p < 4; p++) {
      if (!engine.state.players[p].grandTichuDecided) {
        engine.grandTichuDecision(p as PlayerPosition, bots[p].decideGrandTichu(engine.state.players[p].hand));
      }
    }

    if (engine.state.phase === GamePhase.PASSING) {
      for (let p = 0; p < 4; p++) {
        const tc = {
          0: engine.state.players[0].tichuCall,
          1: engine.state.players[1].tichuCall,
          2: engine.state.players[2].tichuCall,
          3: engine.state.players[3].tichuCall,
        } as Record<PlayerPosition, TichuCall>;
        engine.passCards(p as PlayerPosition, bots[p].choosePassCards(engine.state.players[p].hand, p as PlayerPosition, tc));
      }
    }

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
      }

      // Assign budget based on team
      const isTeamA = cp % 2 === 0;
      const budget = (isTeamA !== swapped) ? budgetA : budgetB;

      const mcEval = (candidates: (Card[] | null)[]) =>
        monteCarloEvaluate(engine, cp, candidates, budget.sims, budget.timeMs);

      let ids = bots[cp].choosePlay(pl.hand, engine.state.currentTrick, engine.state.wish, cp, buildCtx(engine), mcEval);

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

    // Track tichu/grand tichu calls and results
    for (const p of engine.state.players) {
      const team = p.position % 2 === 0 ? tichuA : tichuB;
      const succeeded = p.finishOrder === 1;
      if (p.tichuCall === 'tichu') {
        team.tichuCalls++;
        if (succeeded) team.tichuSuccess++;
      } else if (p.tichuCall === 'grand_tichu') {
        team.grandTichuCalls++;
        if (succeeded) team.grandTichuSuccess++;
      }
    }

    // Track first out and double victories
    if (engine.state.finishOrder.length > 0) {
      const first = engine.state.finishOrder[0];
      if (first % 2 === 0) firstOutA++; else firstOutB++;
    }
    if (engine.state.finishOrder.length >= 2) {
      const first = engine.state.finishOrder[0] % 2;
      const second = engine.state.finishOrder[1] % 2;
      if (first === 0 && second === 0) doubleVictoryA++;
      if (first === 1 && second === 1) doubleVictoryB++;
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
    rounds, tichuA, tichuB, firstOutA, firstOutB, doubleVictoryA, doubleVictoryB,
  };
}

function runTest(label: string, budgetA: BudgetConfig, budgetB: BudgetConfig, numGames: number) {
  console.log(`\n--- ${label} ---`);
  console.log(`Team A (baseline): ${budgetA.label} | Team B (higher): ${budgetB.label}`);
  console.log('');

  const start = Date.now();
  let teamAWins = 0, teamBWins = 0, errors = 0;
  let totalScoreA = 0, totalScoreB = 0, totalRounds = 0;
  const totalTichuA: TichuStats = { tichuCalls: 0, tichuSuccess: 0, grandTichuCalls: 0, grandTichuSuccess: 0 };
  const totalTichuB: TichuStats = { tichuCalls: 0, tichuSuccess: 0, grandTichuCalls: 0, grandTichuSuccess: 0 };
  let totalFirstOutA = 0, totalFirstOutB = 0;
  let totalDVA = 0, totalDVB = 0;
  const halfGames = Math.floor(numGames / 2);

  for (let g = 0; g < numGames; g++) {
    try {
      // First half: A=pos0,2 B=pos1,3. Second half: swap positions.
      const swapped = g >= halfGames;
      // FIX: don't swap args — let runGame's internal swapped flag handle it
      const result = runGame(budgetA, budgetB, swapped);

      const actualAWon = swapped ? result.winner === 1 : result.winner === 0;
      if (actualAWon) teamAWins++; else teamBWins++;

      if (swapped) {
        totalScoreA += result.scores[1]; totalScoreB += result.scores[0];
        totalTichuA.tichuCalls += result.tichuB.tichuCalls; totalTichuA.tichuSuccess += result.tichuB.tichuSuccess;
        totalTichuA.grandTichuCalls += result.tichuB.grandTichuCalls; totalTichuA.grandTichuSuccess += result.tichuB.grandTichuSuccess;
        totalTichuB.tichuCalls += result.tichuA.tichuCalls; totalTichuB.tichuSuccess += result.tichuA.tichuSuccess;
        totalTichuB.grandTichuCalls += result.tichuA.grandTichuCalls; totalTichuB.grandTichuSuccess += result.tichuA.grandTichuSuccess;
        totalFirstOutA += result.firstOutB; totalFirstOutB += result.firstOutA;
        totalDVA += result.doubleVictoryB; totalDVB += result.doubleVictoryA;
      } else {
        totalScoreA += result.scores[0]; totalScoreB += result.scores[1];
        totalTichuA.tichuCalls += result.tichuA.tichuCalls; totalTichuA.tichuSuccess += result.tichuA.tichuSuccess;
        totalTichuA.grandTichuCalls += result.tichuA.grandTichuCalls; totalTichuA.grandTichuSuccess += result.tichuA.grandTichuSuccess;
        totalTichuB.tichuCalls += result.tichuB.tichuCalls; totalTichuB.tichuSuccess += result.tichuB.tichuSuccess;
        totalTichuB.grandTichuCalls += result.tichuB.grandTichuCalls; totalTichuB.grandTichuSuccess += result.tichuB.grandTichuSuccess;
        totalFirstOutA += result.firstOutA; totalFirstOutB += result.firstOutB;
        totalDVA += result.doubleVictoryA; totalDVB += result.doubleVictoryB;
      }

      totalRounds += result.rounds;

      if ((g + 1) % 5 === 0) {
        const done = g + 1 - errors;
        const elapsed = ((Date.now() - start) / 1000).toFixed(0);
        const pctA = (100 * teamAWins / done).toFixed(1);
        const pctB = (100 * teamBWins / done).toFixed(1);
        const avgA = Math.round(totalScoreA / done);
        const avgB = Math.round(totalScoreB / done);
        const foA = (100 * totalFirstOutA / totalRounds).toFixed(1);
        const foB = (100 * totalFirstOutB / totalRounds).toFixed(1);
        const dvA = totalDVA;
        const dvB = totalDVB;
        const tA = totalTichuA.tichuCalls;
        const tAsuc = totalTichuA.tichuSuccess;
        const gtA = totalTichuA.grandTichuCalls;
        const gtAsuc = totalTichuA.grandTichuSuccess;
        const tB = totalTichuB.tichuCalls;
        const tBsuc = totalTichuB.tichuSuccess;
        const gtB = totalTichuB.grandTichuCalls;
        const gtBsuc = totalTichuB.grandTichuSuccess;
        console.log(`  [${g + 1}/${numGames}] ${elapsed}s elapsed ${swapped ? '(swapped)' : '(normal)'}`);
        console.log(`    Wins: A ${teamAWins} (${pctA}%) | B ${teamBWins} (${pctB}%)`);
        console.log(`    Avg score: A ${avgA} | B ${avgB}`);
        console.log(`    First outs: A ${foA}% | B ${foB}%`);
        console.log(`    Double victories: A ${dvA} | B ${dvB}`);
        console.log(`    Tichu: A ${tAsuc}/${tA} | B ${tBsuc}/${tB}`);
        console.log(`    Grand Tichu: A ${gtAsuc}/${gtA} | B ${gtBsuc}/${gtB}`);
        console.log('');
      }
    } catch (e) {
      errors++;
      if (errors <= 3) console.error(`Game ${g + 1}:`, (e as Error).message);
    }
  }

  const done = numGames - errors;
  const ms = Date.now() - start;
  const winRateB = 100 * teamBWins / done;

  console.log(`\n=== FINAL RESULTS (${done} games in ${(ms / 1000).toFixed(1)}s) ===`);
  console.log(`Position swap: first ${halfGames} normal, last ${numGames - halfGames} swapped`);
  console.log('');
  console.log(`Team A — baseline (${budgetA.label}):`);
  console.log(`  Wins: ${teamAWins}/${done} (${(100 * teamAWins / done).toFixed(1)}%)`);
  console.log(`  Avg score: ${Math.round(totalScoreA / done)}`);
  console.log(`  First outs: ${totalFirstOutA} (${(100 * totalFirstOutA / totalRounds).toFixed(1)}% of rounds)`);
  console.log(`  Double victories: ${totalDVA} (${(100 * totalDVA / totalRounds).toFixed(1)}% of rounds)`);
  console.log(`  Tichu: ${totalTichuA.tichuCalls} calls, ${totalTichuA.tichuSuccess} success (${totalTichuA.tichuCalls ? (100 * totalTichuA.tichuSuccess / totalTichuA.tichuCalls).toFixed(1) : 0}%)`);
  console.log(`  Grand Tichu: ${totalTichuA.grandTichuCalls} calls, ${totalTichuA.grandTichuSuccess} success (${totalTichuA.grandTichuCalls ? (100 * totalTichuA.grandTichuSuccess / totalTichuA.grandTichuCalls).toFixed(1) : 0}%)`);
  console.log('');
  console.log(`Team B — higher budget (${budgetB.label}):`);
  console.log(`  Wins: ${teamBWins}/${done} (${winRateB.toFixed(1)}%)`);
  console.log(`  Avg score: ${Math.round(totalScoreB / done)}`);
  console.log(`  First outs: ${totalFirstOutB} (${(100 * totalFirstOutB / totalRounds).toFixed(1)}% of rounds)`);
  console.log(`  Double victories: ${totalDVB} (${(100 * totalDVB / totalRounds).toFixed(1)}% of rounds)`);
  console.log(`  Tichu: ${totalTichuB.tichuCalls} calls, ${totalTichuB.tichuSuccess} success (${totalTichuB.tichuCalls ? (100 * totalTichuB.tichuSuccess / totalTichuB.tichuCalls).toFixed(1) : 0}%)`);
  console.log(`  Grand Tichu: ${totalTichuB.grandTichuCalls} calls, ${totalTichuB.grandTichuSuccess} success (${totalTichuB.grandTichuCalls ? (100 * totalTichuB.grandTichuSuccess / totalTichuB.grandTichuCalls).toFixed(1) : 0}%)`);
  console.log('');

  if (winRateB > 52) console.log(`>>> HIGHER BUDGET WINS (${winRateB.toFixed(1)}%)`);
  else if (winRateB < 48) console.log(`>>> BASELINE WINS (${(100 - winRateB).toFixed(1)}%)`);
  else console.log(`>>> NO SIGNIFICANT DIFFERENCE (${winRateB.toFixed(1)}%)`);

  if (errors > 0) console.log(`Errors: ${errors}`);
}

// ─── MAIN ──────────────────────────────────────────────────────────────
const double: BudgetConfig   = { label: '400 sims / 300ms', sims: 400, timeMs: 300 };
const triple: BudgetConfig   = { label: '600 sims / 400ms', sims: 600, timeMs: 400 };

console.log(`=== MC Budget Test: ${NUM_GAMES} games ===`);

runTest('3x vs 2x Budget', double, triple, NUM_GAMES);

console.log('\n=== Done ===');
