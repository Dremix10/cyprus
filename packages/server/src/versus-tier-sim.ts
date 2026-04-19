/**
 * Generic tier-vs-tier simulation.
 *
 * Usage: npx tsx packages/server/src/versus-tier-sim.ts <numGames> <tierA> <tierB>
 *   e.g. npx tsx packages/server/src/versus-tier-sim.ts 50 hard extreme
 *
 * Team A = tierA on positions 0,2 (swapped to 1,3 at halfway)
 * Team B = tierB on positions 1,3 (swapped to 0,2 at halfway)
 * Prints detailed progress every 5 games.
 */
import {
  GamePhase,
  type PlayerPosition,
  type Card,
  type TichuCall,
  findPlayableFromHand,
} from '@cyprus/shared';
import { GameEngine } from './GameEngine.js';
import { BotAI, type BotConfig, type BotDifficulty } from './BotAI.js';
import { monteCarloEvaluate } from './MonteCarloSim.js';

function cfgFor(diff: BotDifficulty): Partial<BotConfig> {
  switch (diff) {
    case 'unfair': return { useMonteCarlo: true, mcSims: 600, mcTimeMs: 400 };
    case 'extreme': return { useMonteCarlo: true, mcSims: 400, mcTimeMs: 300 };
    case 'hard': return { useMonteCarlo: true, mcSims: 200, mcTimeMs: 150 };
    default: return { useMonteCarlo: false };
  }
}

const NUM_GAMES = parseInt(process.argv[2] || '50', 10);
const TIER_A = (process.argv[3] || 'hard') as BotDifficulty;
const TIER_B = (process.argv[4] || 'unfair') as BotDifficulty;
// Optional flag args (comma-separated). e.g. "scoreAwareTichu,opponentCardCountBombing" or "none".
const FLAGS_A = process.argv[5] || 'none';
const FLAGS_B = process.argv[6] || 'none';
const TARGET_SCORE = 1000;
const MAX_ROUNDS = 50;
// Progress cadence: every 5 for small runs; every N/20 for big ones so we get ~20 updates.
const PROGRESS_EVERY = Math.max(5, Math.floor(NUM_GAMES / 20));

const VALID: BotDifficulty[] = ['easy', 'medium', 'hard', 'extreme', 'unfair'];
if (!VALID.includes(TIER_A) || !VALID.includes(TIER_B)) {
  console.error(`Invalid tier. Must be one of: ${VALID.join(', ')}`);
  process.exit(1);
}

const KNOWN_FLAGS = ['scoreAwareTichu', 'opponentCardCountBombing', 'smartCardTracking'] as const;
function parseFlags(raw: string): Partial<BotConfig> {
  if (raw === 'none' || raw === '') return {};
  const out: Partial<BotConfig> = {};
  for (const f of raw.split(',').map((s) => s.trim())) {
    if (!KNOWN_FLAGS.includes(f as (typeof KNOWN_FLAGS)[number])) {
      console.error(`Unknown flag: ${f}. Valid: ${KNOWN_FLAGS.join(', ')}`);
      process.exit(1);
    }
    (out as Record<string, boolean>)[f] = true;
  }
  return out;
}

const CONFIG_A: Partial<BotConfig> = { ...cfgFor(TIER_A), ...parseFlags(FLAGS_A) };
const CONFIG_B: Partial<BotConfig> = { ...cfgFor(TIER_B), ...parseFlags(FLAGS_B) };

function buildCtx(engine: GameEngine) {
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
  winner: 0 | 1; // 0 = Team A, 1 = Team B
  scores: [number, number];
  rounds: number;
  tichuCallsByTeam: [number, number];
  tichuSuccessByTeam: [number, number];
  grandTichuCallsByTeam: [number, number];
  grandTichuSuccessByTeam: [number, number];
  firstOutByTeam: [number, number];
  doubleVictoriesByTeam: [number, number];
}

function runGame(swapped: boolean): GameResult {
  const engine = new GameEngine(['P0', 'P1', 'P2', 'P3'], TARGET_SCORE);

  // Positions 0,2 get tierA when not swapped; tierB when swapped.
  const bots: BotAI[] = [
    new BotAI(swapped ? TIER_B : TIER_A, swapped ? CONFIG_B : CONFIG_A),
    new BotAI(swapped ? TIER_A : TIER_B, swapped ? CONFIG_A : CONFIG_B),
    new BotAI(swapped ? TIER_B : TIER_A, swapped ? CONFIG_B : CONFIG_A),
    new BotAI(swapped ? TIER_A : TIER_B, swapped ? CONFIG_A : CONFIG_B),
  ];

  const tichuCalls: [number, number] = [0, 0];
  const tichuSuccess: [number, number] = [0, 0];
  const grandTichuCalls: [number, number] = [0, 0];
  const grandTichuSuccess: [number, number] = [0, 0];
  const firstOut: [number, number] = [0, 0];
  const doubleVictories: [number, number] = [0, 0];

  let rounds = 0;
  engine.startRound();
  rounds++;

  while (engine.state.phase !== GamePhase.GAME_OVER && rounds <= MAX_ROUNDS) {
    for (let p = 0; p < 4; p++) {
      if (!engine.state.players[p].grandTichuDecided) {
        const call = bots[p].decideGrandTichu(engine.state.players[p].hand);
        engine.grandTichuDecision(p as PlayerPosition, call);
        if (call) grandTichuCalls[p % 2]++;
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
        engine.passCards(
          p as PlayerPosition,
          bots[p].choosePassCards(engine.state.players[p].hand, p as PlayerPosition, tc)
        );
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

      if (pl.tichuCall === 'none' && !pl.hasPlayedCards && bots[cp].decideTichu(pl.hand, buildCtx(engine), cp as PlayerPosition)) {
        engine.callTichu(cp);
        tichuCalls[cp % 2]++;
      }

      let mcEval: ((candidates: (Card[] | null)[]) => string[] | null) | undefined;
      if (bots[cp].config.useMonteCarlo && !bots[cp].inRollout) {
        const sims = bots[cp].config.mcSims;
        const timeMs = bots[cp].config.mcTimeMs;
        mcEval = (candidates) => monteCarloEvaluate(engine, cp, candidates, sims, timeMs);
      }

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
      if (first % 2 === second % 2) doubleVictories[first % 2]++;
    }

    if (engine.state.phase === GamePhase.ROUND_SCORING) {
      engine.nextRound();
      rounds++;
    }
  }

  // Team A = positions 0,2 when not swapped; 1,3 when swapped.
  const teamAScore = swapped ? engine.state.scores[1] : engine.state.scores[0];
  const teamBScore = swapped ? engine.state.scores[0] : engine.state.scores[1];
  const winner: 0 | 1 = teamAScore >= teamBScore ? 0 : 1;

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

function label(t: BotDifficulty, cfg: Partial<BotConfig>, flags: string): string {
  const mc = cfg.useMonteCarlo ? ` (${cfg.mcSims}/${cfg.mcTimeMs}ms)` : '';
  const fl = flags !== 'none' && flags !== '' ? ` [+${flags}]` : '';
  return `${t.toUpperCase()}${mc}${fl}`;
}

const labelA = label(TIER_A, CONFIG_A, FLAGS_A);
const labelB = label(TIER_B, CONFIG_B, FLAGS_B);

console.log(`=== ${labelA} vs ${labelB} — ${NUM_GAMES} games ===`);
console.log(`Positions swapped at halfway. Updates every ${PROGRESS_EVERY} games.`);
console.log('');

const startTime = Date.now();
let aWins = 0, bWins = 0, errors = 0;
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

    if (result.winner === 0) aWins++; else bWins++;

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
      const aPct = (100 * aWins / done).toFixed(1);
      const bPct = (100 * bWins / done).toFixed(1);
      const aFoPct = totalRounds ? (100 * totalFirstOut[0] / totalRounds).toFixed(1) : '0.0';
      const bFoPct = totalRounds ? (100 * totalFirstOut[1] / totalRounds).toFixed(1) : '0.0';
      const aDvPct = totalRounds ? (100 * totalDoubleVictories[0] / totalRounds).toFixed(1) : '0.0';
      const bDvPct = totalRounds ? (100 * totalDoubleVictories[1] / totalRounds).toFixed(1) : '0.0';
      const aTiRate = totalTichuCalls[0] ? (100 * totalTichuSuccess[0] / totalTichuCalls[0]).toFixed(1) : '–';
      const bTiRate = totalTichuCalls[1] ? (100 * totalTichuSuccess[1] / totalTichuCalls[1]).toFixed(1) : '–';
      const aGtRate = totalGrandCalls[0] ? (100 * totalGrandSuccess[0] / totalGrandCalls[0]).toFixed(1) : '–';
      const bGtRate = totalGrandCalls[1] ? (100 * totalGrandSuccess[1] / totalGrandCalls[1]).toFixed(1) : '–';

      console.log(
        `\n--- After game ${g + 1}/${NUM_GAMES} (${elapsed.toFixed(0)}s elapsed, ~${Math.round(remain)}s remaining) ---`
      );
      console.log(`Wins       — ${TIER_A}: ${aWins} (${aPct}%)   ${TIER_B}: ${bWins} (${bPct}%)`);
      console.log(`Avg score  — ${TIER_A}: ${Math.round(totalScore[0] / done)}   ${TIER_B}: ${Math.round(totalScore[1] / done)}`);
      console.log(`First out  — ${TIER_A}: ${aFoPct}%   ${TIER_B}: ${bFoPct}%   (of ${totalRounds} rounds)`);
      console.log(`Tichu succ — ${TIER_A}: ${aTiRate}% (${totalTichuSuccess[0]}/${totalTichuCalls[0]})   ${TIER_B}: ${bTiRate}% (${totalTichuSuccess[1]}/${totalTichuCalls[1]})`);
      console.log(`Grand succ — ${TIER_A}: ${aGtRate}% (${totalGrandSuccess[0]}/${totalGrandCalls[0]})   ${TIER_B}: ${bGtRate}% (${totalGrandSuccess[1]}/${totalGrandCalls[1]})`);
      console.log(`1-2 rate   — ${TIER_A}: ${aDvPct}%   ${TIER_B}: ${bDvPct}%`);
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
console.log(`${TIER_A} wins: ${aWins}  (${(100 * aWins / done).toFixed(1)}%)`);
console.log(`${TIER_B} wins: ${bWins}  (${(100 * bWins / done).toFixed(1)}%)`);
console.log('');
console.log(`Avg final score — ${TIER_A}: ${Math.round(totalScore[0] / done)}   ${TIER_B}: ${Math.round(totalScore[1] / done)}`);
console.log(`Total rounds played: ${totalRounds}   (avg ${(totalRounds / done).toFixed(1)} per game)`);
console.log('');
console.log(`First-out rate:`);
console.log(`  ${TIER_A}: ${(100 * totalFirstOut[0] / totalRounds).toFixed(1)}%   (${totalFirstOut[0]}/${totalRounds})`);
console.log(`  ${TIER_B}: ${(100 * totalFirstOut[1] / totalRounds).toFixed(1)}%   (${totalFirstOut[1]}/${totalRounds})`);
console.log('');
console.log(`Tichu success rate:`);
console.log(`  ${TIER_A}: ${totalTichuCalls[0] ? (100 * totalTichuSuccess[0] / totalTichuCalls[0]).toFixed(1) : '–'}%   (${totalTichuSuccess[0]}/${totalTichuCalls[0]})`);
console.log(`  ${TIER_B}: ${totalTichuCalls[1] ? (100 * totalTichuSuccess[1] / totalTichuCalls[1]).toFixed(1) : '–'}%   (${totalTichuSuccess[1]}/${totalTichuCalls[1]})`);
console.log('');
console.log(`Grand Tichu success rate:`);
console.log(`  ${TIER_A}: ${totalGrandCalls[0] ? (100 * totalGrandSuccess[0] / totalGrandCalls[0]).toFixed(1) : '–'}%   (${totalGrandSuccess[0]}/${totalGrandCalls[0]})`);
console.log(`  ${TIER_B}: ${totalGrandCalls[1] ? (100 * totalGrandSuccess[1] / totalGrandCalls[1]).toFixed(1) : '–'}%   (${totalGrandSuccess[1]}/${totalGrandCalls[1]})`);
console.log('');
console.log(`1-2 double victory rate:`);
console.log(`  ${TIER_A}: ${(100 * totalDoubleVictories[0] / totalRounds).toFixed(1)}%   (${totalDoubleVictories[0]}/${totalRounds})`);
console.log(`  ${TIER_B}: ${(100 * totalDoubleVictories[1] / totalRounds).toFixed(1)}%   (${totalDoubleVictories[1]}/${totalRounds})`);

if (errors > 0) console.log(`\nErrors: ${errors}`);
