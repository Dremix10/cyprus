/**
 * Hard vs Unfair simulation.
 * Team A = hard (mcSims=200, mcTimeMs=150)
 * Team B = unfair (mcSims=600, mcTimeMs=400)
 * Positions are swapped for the second half to eliminate positional bias.
 * Prints detailed progress every 5 games.
 *
 * Usage: npx tsx packages/server/src/hard-vs-unfair-sim.ts [numGames]
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

const HARD_CONFIG: Partial<BotConfig> = { useMonteCarlo: true, mcSims: 200, mcTimeMs: 150 };
const UNFAIR_CONFIG: Partial<BotConfig> = { useMonteCarlo: true, mcSims: 600, mcTimeMs: 400 };

const NUM_GAMES = parseInt(process.argv[2] || '50', 10);
const TARGET_SCORE = 1000;
const MAX_ROUNDS = 50;
const PROGRESS_EVERY = 5;

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

interface GameResult {
  winner: 0 | 1; // 0 = Team A (even positions), 1 = Team B (odd positions)
  scores: [number, number];
  rounds: number;
  tichuCallsByTeam: [number, number];
  tichuSuccessByTeam: [number, number];
  grandTichuCallsByTeam: [number, number];
  grandTichuSuccessByTeam: [number, number];
  firstOutByTeam: [number, number];
  doubleVictoriesByTeam: [number, number];
}

/**
 * swapped=false → Team A (hard) on positions 0,2; Team B (unfair) on 1,3
 * swapped=true  → Team A (hard) on positions 1,3; Team B (unfair) on 0,2
 */
function runGame(swapped: boolean): GameResult {
  const engine = new GameEngine(['P0', 'P1', 'P2', 'P3'], TARGET_SCORE);

  // Build bots: the "hard" BotAI is the same for both teams, only the MC budget differs.
  const bots: BotAI[] = [
    new BotAI('hard', swapped ? UNFAIR_CONFIG : HARD_CONFIG),
    new BotAI('hard', swapped ? HARD_CONFIG : UNFAIR_CONFIG),
    new BotAI('hard', swapped ? UNFAIR_CONFIG : HARD_CONFIG),
    new BotAI('hard', swapped ? HARD_CONFIG : UNFAIR_CONFIG),
  ];

  const tichuCalls: [number, number] = [0, 0];
  const tichuSuccess: [number, number] = [0, 0];
  const grandTichuCalls: [number, number] = [0, 0];
  const grandTichuSuccess: [number, number] = [0, 0];
  const firstOut: [number, number] = [0, 0];
  const doubleVictories: [number, number] = [0, 0];

  // Tichu/Grand Tichu callers are decided in startRound (grand) / during play (regular).
  // We track initial calls to distinguish grand from regular.
  let rounds = 0;
  engine.startRound();
  rounds++;

  while (engine.state.phase !== GamePhase.GAME_OVER && rounds <= MAX_ROUNDS) {
    // Grand Tichu decisions
    for (let p = 0; p < 4; p++) {
      if (!engine.state.players[p].grandTichuDecided) {
        const call = bots[p].decideGrandTichu(engine.state.players[p].hand);
        engine.grandTichuDecision(p as PlayerPosition, call);
        if (call) {
          grandTichuCalls[p % 2]++;
        }
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
        tichuCalls[cp % 2]++;
      }

      // Build per-bot MC evaluator using each bot's own mc budget
      let mcEval: ((candidates: (Card[] | null)[]) => string[] | null) | undefined;
      if (bots[cp].config.useMonteCarlo && !bots[cp].inRollout) {
        const sims = bots[cp].config.mcSims;
        const timeMs = bots[cp].config.mcTimeMs;
        mcEval = (candidates) => monteCarloEvaluate(engine, cp, candidates, sims, timeMs);
      }

      let ids = bots[cp].choosePlay(pl.hand, engine.state.currentTrick, engine.state.wish, cp, buildCtx(engine), mcEval);

      // Wish enforcement fallback if bot refused to satisfy the wish
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

    // End-of-round stats
    for (const p of engine.state.players) {
      if (p.finishOrder === 1) {
        if (p.tichuCall === 'tichu') tichuSuccess[p.position % 2]++;
        if (p.tichuCall === 'grand_tichu') grandTichuSuccess[p.position % 2]++;
      }
    }

    if (engine.state.finishOrder.length >= 2) {
      const first = engine.state.finishOrder[0];
      const second = engine.state.finishOrder[1];
      firstOut[first % 2]++;
      if (first % 2 === second % 2) {
        doubleVictories[first % 2]++;
      }
    }

    if (engine.state.phase === GamePhase.ROUND_SCORING) {
      engine.nextRound();
      rounds++;
    }
  }

  // Determine winner. "Team A" = positions 0,2. "Team B" = positions 1,3.
  // If swapped, Team A was on 1,3 and Team B was on 0,2.
  const teamAScore = swapped ? engine.state.scores[1] : engine.state.scores[0];
  const teamBScore = swapped ? engine.state.scores[0] : engine.state.scores[1];
  const winner: 0 | 1 = teamAScore >= teamBScore ? 0 : 1;

  // Map per-team stats back to (hard, unfair) = (A, B)
  const mapTeam = (arr: [number, number]): [number, number] =>
    swapped ? [arr[1], arr[0]] : [arr[0], arr[1]];

  return {
    winner,
    scores: [teamAScore, teamBScore],
    rounds,
    tichuCallsByTeam: mapTeam(tichuCalls),
    tichuSuccessByTeam: mapTeam(tichuSuccess),
    grandTichuCallsByTeam: mapTeam(grandTichuCalls),
    grandTichuSuccessByTeam: mapTeam(grandTichuSuccess),
    firstOutByTeam: mapTeam(firstOut),
    doubleVictoriesByTeam: mapTeam(doubleVictories),
  };
}

// ─── MAIN ──────────────────────────────────────────────────────────────
console.log(`=== HARD (200/150ms) vs UNFAIR (600/400ms) — ${NUM_GAMES} games ===`);
console.log(`Positions swapped at halfway. Updates every ${PROGRESS_EVERY} games.`);
console.log('');

const startTime = Date.now();
let hardWins = 0, unfairWins = 0, errors = 0;
const totalScore = [0, 0];
let totalRounds = 0;
const totalTichuCalls = [0, 0];
const totalTichuSuccess = [0, 0];
const totalGrandCalls = [0, 0];
const totalGrandSuccess = [0, 0];
const totalFirstOut = [0, 0];
const totalDoubleVictories = [0, 0];

const halfGames = Math.floor(NUM_GAMES / 2);

for (let g = 0; g < NUM_GAMES; g++) {
  const swapped = g >= halfGames;
  try {
    const result = runGame(swapped);

    if (result.winner === 0) hardWins++; else unfairWins++;

    totalScore[0] += result.scores[0];
    totalScore[1] += result.scores[1];
    totalRounds += result.rounds;
    totalTichuCalls[0] += result.tichuCallsByTeam[0]; totalTichuCalls[1] += result.tichuCallsByTeam[1];
    totalTichuSuccess[0] += result.tichuSuccessByTeam[0]; totalTichuSuccess[1] += result.tichuSuccessByTeam[1];
    totalGrandCalls[0] += result.grandTichuCallsByTeam[0]; totalGrandCalls[1] += result.grandTichuCallsByTeam[1];
    totalGrandSuccess[0] += result.grandTichuSuccessByTeam[0]; totalGrandSuccess[1] += result.grandTichuSuccessByTeam[1];
    totalFirstOut[0] += result.firstOutByTeam[0]; totalFirstOut[1] += result.firstOutByTeam[1];
    totalDoubleVictories[0] += result.doubleVictoriesByTeam[0]; totalDoubleVictories[1] += result.doubleVictoriesByTeam[1];

    if ((g + 1) % PROGRESS_EVERY === 0) {
      const done = g + 1 - errors;
      const elapsed = (Date.now() - startTime) / 1000;
      const perGame = elapsed / (g + 1);
      const remain = (NUM_GAMES - g - 1) * perGame;
      const hardPct = (100 * hardWins / done).toFixed(1);
      const unfairPct = (100 * unfairWins / done).toFixed(1);
      console.log(
        `\n--- After game ${g + 1}/${NUM_GAMES} (${elapsed.toFixed(0)}s elapsed, ~${Math.round(remain)}s remaining) ---`
      );
      console.log(`Wins       — Hard: ${hardWins} (${hardPct}%)   Unfair: ${unfairWins} (${unfairPct}%)`);
      console.log(`Avg score  — Hard: ${Math.round(totalScore[0] / done)}   Unfair: ${Math.round(totalScore[1] / done)}`);
      console.log(`First out  — Hard: ${totalFirstOut[0]}   Unfair: ${totalFirstOut[1]}   (of ${totalRounds} rounds)`);
      console.log(`Tichu      — Hard: ${totalTichuSuccess[0]}/${totalTichuCalls[0]}   Unfair: ${totalTichuSuccess[1]}/${totalTichuCalls[1]}`);
      console.log(`Grand Tich — Hard: ${totalGrandSuccess[0]}/${totalGrandCalls[0]}   Unfair: ${totalGrandSuccess[1]}/${totalGrandCalls[1]}`);
      console.log(`1-2 wins   — Hard: ${totalDoubleVictories[0]}   Unfair: ${totalDoubleVictories[1]}`);
    }
  } catch (e) {
    errors++;
    if (errors <= 5) console.error(`Game ${g + 1} error:`, (e as Error).message);
  }
}

const done = NUM_GAMES - errors;
const ms = Date.now() - startTime;

console.log(`\n=== FINAL RESULTS (${done}/${NUM_GAMES} games in ${(ms / 1000).toFixed(0)}s) ===`);
console.log('');
console.log(`Hard    wins: ${hardWins}   (${(100 * hardWins / done).toFixed(1)}%)`);
console.log(`Unfair  wins: ${unfairWins} (${(100 * unfairWins / done).toFixed(1)}%)`);
console.log('');
console.log(`Avg final score — Hard: ${Math.round(totalScore[0] / done)}   Unfair: ${Math.round(totalScore[1] / done)}`);
console.log(`Total rounds played: ${totalRounds}   (avg ${(totalRounds / done).toFixed(1)} per game)`);
console.log('');
console.log(`First-out rate:`);
console.log(`  Hard:   ${totalFirstOut[0]} / ${totalRounds} = ${(100 * totalFirstOut[0] / totalRounds).toFixed(1)}%`);
console.log(`  Unfair: ${totalFirstOut[1]} / ${totalRounds} = ${(100 * totalFirstOut[1] / totalRounds).toFixed(1)}%`);
console.log('');
console.log(`Tichu:`);
console.log(`  Hard:   ${totalTichuSuccess[0]}/${totalTichuCalls[0]}  (${totalTichuCalls[0] ? (100 * totalTichuSuccess[0] / totalTichuCalls[0]).toFixed(1) : '–'}%)`);
console.log(`  Unfair: ${totalTichuSuccess[1]}/${totalTichuCalls[1]}  (${totalTichuCalls[1] ? (100 * totalTichuSuccess[1] / totalTichuCalls[1]).toFixed(1) : '–'}%)`);
console.log('');
console.log(`Grand Tichu:`);
console.log(`  Hard:   ${totalGrandSuccess[0]}/${totalGrandCalls[0]}  (${totalGrandCalls[0] ? (100 * totalGrandSuccess[0] / totalGrandCalls[0]).toFixed(1) : '–'}%)`);
console.log(`  Unfair: ${totalGrandSuccess[1]}/${totalGrandCalls[1]}  (${totalGrandCalls[1] ? (100 * totalGrandSuccess[1] / totalGrandCalls[1]).toFixed(1) : '–'}%)`);
console.log('');
console.log(`1-2 double victories:`);
console.log(`  Hard:   ${totalDoubleVictories[0]}`);
console.log(`  Unfair: ${totalDoubleVictories[1]}`);

if (errors > 0) console.log(`\nErrors: ${errors}`);
