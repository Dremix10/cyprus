/**
 * Quick test: identical bots on both teams.
 * If positions 0,2 or 1,3 consistently win, there's a structural bias.
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

const NUM_GAMES = 200;
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

// Test 1: No MC (pure heuristic) — 200 games, should be ~50/50
console.log('=== Test 1: Identical hard bots, NO MC, 200 games ===');
let team02wins = 0;
for (let g = 0; g < NUM_GAMES; g++) {
  const engine = new GameEngine(['A0', 'B1', 'A2', 'B3'], TARGET_SCORE);
  const bots = [new BotAI('hard'), new BotAI('hard'), new BotAI('hard'), new BotAI('hard')];
  let rounds = 0;
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
        const tc = { 0: engine.state.players[0].tichuCall, 1: engine.state.players[1].tichuCall, 2: engine.state.players[2].tichuCall, 3: engine.state.players[3].tichuCall } as Record<PlayerPosition, TichuCall>;
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
        const opps = engine.state.players.filter((p) => p.position % 2 !== w % 2).map((p) => p.position as PlayerPosition);
        const cc = new Map(opps.map((p) => [p, engine.state.players[p].hand.length] as [PlayerPosition, number]));
        engine.dragonGive(w, bots[w].chooseDragonGiveTarget(opps, cc, buildCtx(engine)));
        continue;
      }
      const cp = engine.state.currentPlayer;
      const pl = engine.state.players[cp];
      if (pl.tichuCall === 'none' && !pl.hasPlayedCards && bots[cp].decideTichu(pl.hand)) engine.callTichu(cp);
      let ids = bots[cp].choosePlay(pl.hand, engine.state.currentTrick, engine.state.wish, cp, buildCtx(engine));
      if (!ids && engine.state.wish.active && engine.state.wish.wishedRank !== null) {
        const currentTop = engine.state.currentTrick.plays.length > 0 ? engine.state.currentTrick.plays[engine.state.currentTrick.plays.length - 1].combination : null;
        const playable = findPlayableFromHand(pl.hand, currentTop, engine.state.wish);
        const wishedPlay = playable.find((cards) => cards.some((c) => c.type === 'normal' && c.rank === engine.state.wish.wishedRank));
        if (wishedPlay) ids = wishedPlay.map((c) => c.id);
      }
      if (ids) engine.playCards(cp, ids); else engine.passTurn(cp);
    }
    if (engine.state.phase === GamePhase.ROUND_SCORING) { engine.nextRound(); rounds++; }
  }
  if (engine.state.scores[0] >= TARGET_SCORE) team02wins++;
  if ((g + 1) % 50 === 0) console.log(`  ${g + 1}/${NUM_GAMES} — Team 0,2 wins: ${team02wins} (${(100 * team02wins / (g + 1)).toFixed(1)}%)`);
}
console.log(`\nFinal: Team 0,2 wins ${team02wins}/${NUM_GAMES} (${(100 * team02wins / NUM_GAMES).toFixed(1)}%)`);
console.log(`       Team 1,3 wins ${NUM_GAMES - team02wins}/${NUM_GAMES} (${(100 * (NUM_GAMES - team02wins) / NUM_GAMES).toFixed(1)}%)`);
if (team02wins > 110 || team02wins < 90) console.log('>>> POSITIONAL BIAS DETECTED');
else console.log('>>> No significant bias');

// Test 2 (MC) removed — too slow, run separately if needed
