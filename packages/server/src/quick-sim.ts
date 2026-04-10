/**
 * Quick bot simulation — runs N hard-mode games and outputs key stats.
 * Usage: npx tsx packages/server/src/quick-sim.ts [numGames]
 */
import {
  GamePhase,
  type PlayerPosition,
  type Card,
  type TichuCall,
  findPlayableFromHand,
} from '@cyprus/shared';
import { GameEngine } from './GameEngine.js';
import { BotAI, type GameContext } from './BotAI.js';

const NUM_GAMES = parseInt(process.argv[2] || '500', 10);
const TARGET_SCORE = 1000;

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

let totalRounds = 0, errors = 0, teamAWins = 0;
let tichuCalls = 0, tichuSuccess = 0, grandCalls = 0, grandSuccess = 0;
let scoreA = 0, scoreB = 0, dragonGives = 0;

const start = Date.now();

for (let g = 0; g < NUM_GAMES; g++) {
  try {
    const engine = new GameEngine(['A0', 'B1', 'A2', 'B3'], TARGET_SCORE);
    const bot = new BotAI('hard');
    let rounds = 0;

    engine.startRound();
    rounds++;
    while (engine.state.phase !== GamePhase.GAME_OVER && rounds <= 50) {

      // Grand Tichu
      for (let p = 0; p < 4; p++) {
        if (!engine.state.players[p].grandTichuDecided) {
          const call = bot.decideGrandTichu(engine.state.players[p].hand);
          if (call) grandCalls++;
          engine.grandTichuDecision(p as PlayerPosition, call);
        }
      }

      // Pass
      if (engine.state.phase === GamePhase.PASSING) {
        for (let p = 0; p < 4; p++) {
          const tc = {
            0: engine.state.players[0].tichuCall,
            1: engine.state.players[1].tichuCall,
            2: engine.state.players[2].tichuCall,
            3: engine.state.players[3].tichuCall,
          } as Record<PlayerPosition, TichuCall>;
          engine.passCards(p as PlayerPosition, bot.choosePassCards(engine.state.players[p].hand, p as PlayerPosition, tc));
        }
      }

      // Play
      let safety = 0;
      while (engine.state.phase === GamePhase.PLAYING || engine.state.phase === GamePhase.DRAGON_GIVE) {
        if (++safety > 500) break;

        // Resolve pending states first (these are visual delays in real game, instant in sim)
        if (engine.state.dogPending) {
          engine.resolveDog();
          continue;
        }
        if (engine.state.trickWonPending) {
          engine.completeTrickWon();
          continue;
        }

        // Handle wish pending
        if (engine.state.wishPending !== null) {
          const wp = engine.state.wishPending;
          engine.setWish(wp, bot.chooseWish(engine.state.players[wp].hand, buildCtx(engine)));
          continue;
        }

        // Handle Dragon give
        if (engine.state.phase === GamePhase.DRAGON_GIVE) {
          const w = engine.state.dragonWinner!;
          const opps = engine.state.players
            .filter((p) => p.position % 2 !== w % 2)
            .map((p) => p.position as PlayerPosition);
          const cc = new Map(opps.map((p) => [p, engine.state.players[p].hand.length] as [PlayerPosition, number]));
          engine.dragonGive(w, bot.chooseDragonGiveTarget(opps, cc, buildCtx(engine)));
          dragonGives++;
          continue;
        }

        const cp = engine.state.currentPlayer;
        const pl = engine.state.players[cp];

        // Tichu call
        if (pl.tichuCall === 'none' && !pl.hasPlayedCards && bot.decideTichu(pl.hand)) {
          engine.callTichu(cp);
          tichuCalls++;
        }

        let ids = bot.choosePlay(pl.hand, engine.state.currentTrick, engine.state.wish, cp, buildCtx(engine));

        // Wish enforcement: if bot wants to pass but wish forces a play
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

      // Tichu results
      for (const p of engine.state.players) {
        if (p.tichuCall === 'tichu' && p.finishOrder === 1) tichuSuccess++;
        if (p.tichuCall === 'grand_tichu' && p.finishOrder === 1) grandSuccess++;
      }

      if (engine.state.phase === GamePhase.ROUND_SCORING) {
        engine.nextRound(); // this calls startRound internally, or sets GAME_OVER
        rounds++;
      }
    }

    totalRounds += rounds;
    scoreA += engine.state.scores[0];
    scoreB += engine.state.scores[1];
    if (engine.state.scores[0] >= TARGET_SCORE) teamAWins++;
  } catch (e) {
    errors++;
    if (errors <= 5) console.error(`Game ${g + 1}:`, (e as Error).message);
  }
}

const done = NUM_GAMES - errors;
const ms = Date.now() - start;

console.log(`=== Quick Sim: ${done} games in ${(ms / 1000).toFixed(1)}s ===`);
console.log(`Avg rounds/game: ${(totalRounds / done).toFixed(1)}`);
console.log(`Team A wins: ${teamAWins}/${done} (${(100 * teamAWins / done).toFixed(1)}%)`);
console.log(`Avg score A: ${Math.round(scoreA / done)}, B: ${Math.round(scoreB / done)}`);
console.log(`Tichu: ${tichuCalls} calls, ${tichuSuccess} success (${tichuCalls ? (100 * tichuSuccess / tichuCalls).toFixed(1) : 0}%)`);
console.log(`Grand: ${grandCalls} calls, ${grandSuccess} success (${grandCalls ? (100 * grandSuccess / grandCalls).toFixed(1) : 0}%)`);
console.log(`Dragon gives: ${dragonGives}`);
if (errors) console.log(`Errors: ${errors}`);
