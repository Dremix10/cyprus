/**
 * Decision-branch instrumentation sim.
 *
 * Runs games with a BotDecisionRecorder attached to all bots, then reports
 * which lead/follow/wish branches fired how often. Use to identify hot paths
 * vs rare branches before proposing heuristic changes.
 *
 * Usage: npx tsx packages/server/src/instrument-sim.ts <numGames> [tier]
 *   e.g. npx tsx packages/server/src/instrument-sim.ts 1000 medium
 */
import {
  GamePhase,
  type PlayerPosition,
  type Card,
  type TichuCall,
  findPlayableFromHand,
} from '@cyprus/shared';
import { GameEngine } from './GameEngine.js';
import { BotAI, type BotConfig, type BotDifficulty, type BotDecisionRecorder } from './BotAI.js';
import { monteCarloEvaluate } from './MonteCarloSim.js';

function cfgFor(diff: BotDifficulty): Partial<BotConfig> {
  switch (diff) {
    case 'unfair': return { useMonteCarlo: true, mcSims: 600, mcTimeMs: 400 };
    case 'extreme': return { useMonteCarlo: true, mcSims: 400, mcTimeMs: 300 };
    case 'hard': return { useMonteCarlo: true, mcSims: 200, mcTimeMs: 150 };
    default: return { useMonteCarlo: false };
  }
}

const NUM_GAMES = parseInt(process.argv[2] || '1000', 10);
const TIER = (process.argv[3] || 'medium') as BotDifficulty;
const TARGET_SCORE = 1000;
const MAX_ROUNDS = 50;

class BranchCounter implements BotDecisionRecorder {
  counts = new Map<string, number>();
  record(branch: string): void {
    this.counts.set(branch, (this.counts.get(branch) || 0) + 1);
  }
}

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

function runGame(counter: BranchCounter): { rounds: number } {
  const engine = new GameEngine(['P0', 'P1', 'P2', 'P3'], TARGET_SCORE);
  const cfg = cfgFor(TIER);
  const bots: BotAI[] = [
    new BotAI(TIER, cfg),
    new BotAI(TIER, cfg),
    new BotAI(TIER, cfg),
    new BotAI(TIER, cfg),
  ];
  for (const bot of bots) bot.setRecorder(counter);

  let rounds = 0;
  engine.startRound();
  rounds++;

  while (engine.state.phase !== GamePhase.GAME_OVER && rounds <= MAX_ROUNDS) {
    for (let p = 0; p < 4; p++) {
      if (!engine.state.players[p].grandTichuDecided) {
        const call = bots[p].decideGrandTichu(engine.state.players[p].hand);
        engine.grandTichuDecision(p as PlayerPosition, call);
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

    if (engine.state.phase === GamePhase.ROUND_SCORING) {
      engine.nextRound();
      rounds++;
    }
  }

  return { rounds };
}

function printTable(counter: BranchCounter, totalRounds: number, totalGames: number) {
  const entries = Array.from(counter.counts.entries()).sort((a, b) => b[1] - a[1]);
  const leadEntries = entries.filter(([k]) => k.startsWith('lead:'));
  const followEntries = entries.filter(([k]) => k.startsWith('follow:'));
  const other = entries.filter(([k]) => !k.startsWith('lead:') && !k.startsWith('follow:'));

  const totalLeads = leadEntries.reduce((s, [, v]) => s + v, 0);
  const totalFollows = followEntries.reduce((s, [, v]) => s + v, 0);

  console.log(`\n=== LEAD DECISIONS (${totalLeads} total across ${totalRounds} rounds, ${(totalLeads / totalRounds).toFixed(1)}/round) ===`);
  console.log('Branch'.padEnd(30) + 'Count'.padStart(10) + '% of leads'.padStart(15) + 'per game'.padStart(12));
  for (const [branch, count] of leadEntries) {
    const pct = ((count / totalLeads) * 100).toFixed(1);
    const perGame = (count / totalGames).toFixed(1);
    console.log(branch.padEnd(30) + String(count).padStart(10) + (pct + '%').padStart(15) + perGame.padStart(12));
  }

  console.log(`\n=== FOLLOW DECISIONS (${totalFollows} total, ${(totalFollows / totalRounds).toFixed(1)}/round) ===`);
  console.log('Branch'.padEnd(30) + 'Count'.padStart(10) + '% of follows'.padStart(15) + 'per game'.padStart(12));
  for (const [branch, count] of followEntries) {
    const pct = ((count / totalFollows) * 100).toFixed(1);
    const perGame = (count / totalGames).toFixed(1);
    console.log(branch.padEnd(30) + String(count).padStart(10) + (pct + '%').padStart(15) + perGame.padStart(12));
  }

  if (other.length > 0) {
    console.log(`\n=== OTHER ===`);
    for (const [branch, count] of other) {
      console.log(branch.padEnd(30) + String(count).padStart(10));
    }
  }
}

console.log(`Running ${NUM_GAMES} games at tier ${TIER}, all 4 bots instrumented...`);
const counter = new BranchCounter();
const startTime = Date.now();
let totalRounds = 0;
const progressEvery = Math.max(50, Math.floor(NUM_GAMES / 20));

for (let g = 0; g < NUM_GAMES; g++) {
  const { rounds } = runGame(counter);
  totalRounds += rounds;
  if ((g + 1) % progressEvery === 0 || g === NUM_GAMES - 1) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    console.log(`  Game ${g + 1}/${NUM_GAMES} (${elapsed}s elapsed, ${totalRounds} rounds so far)`);
  }
}

printTable(counter, totalRounds, NUM_GAMES);
const totalSec = ((Date.now() - startTime) / 1000).toFixed(0);
console.log(`\nTotal: ${NUM_GAMES} games, ${totalRounds} rounds in ${totalSec}s`);
