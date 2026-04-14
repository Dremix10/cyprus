/**
 * Monte Carlo simulation for Tichu bot decisions.
 * Uses Information Set Monte Carlo (determinization) to handle hidden information.
 *
 * Strategy: pre-filter candidates to top ~5 using heuristic scoring,
 * then use MC rollouts to pick the best among those.
 */
import type {
  Card,
  PlayerPosition,
  TichuCall,
} from '@cyprus/shared';
import {
  GamePhase,
  findPlayableFromHand,
  FULL_DECK,
  detectCombination,
  getCardSortRank,
  isSpecial,
  isNormalCard,
  SpecialCardType,
} from '@cyprus/shared';
import { GameEngine } from './GameEngine.js';
import { BotAI, type GameContext } from './BotAI.js';

// ─── Shared rollout bots (reused across all simulations) ──────────────
const rolloutBots = [
  new BotAI('hard'),
  new BotAI('hard'),
  new BotAI('hard'),
  new BotAI('hard'),
];
for (const b of rolloutBots) b.inRollout = true;

// ─── Helpers ──────────────────────────────────────────────────────────

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

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ─── Pre-filter: select top N candidates ──────────────────────────────

/** Quick heuristic score for a candidate play (higher = more promising). */
function scoreCandidateHeuristic(cards: Card[] | null, hand: Card[]): number {
  if (!cards) return -100; // pass when leading = bad

  // Prefer multi-card combos (empties hand faster)
  let score = cards.length * 10;

  // Prefer longer combos (straights are hard to beat)
  if (cards.length >= 5) score += 20;

  // Prefer low-rank plays (save high cards)
  const combo = detectCombination(cards);
  if (combo) score -= combo.rank * 2;

  // Dog is great to play early (gives partner the lead)
  if (cards.some(c => isSpecial(c, SpecialCardType.DOG))) score += 15;

  // Mahjong — get rid of it
  if (cards.some(c => isSpecial(c, SpecialCardType.MAHJONG))) score += 25;

  // Dragon as a single — risky lead, lower priority
  if (cards.length === 1 && isSpecial(cards[0], SpecialCardType.DRAGON)) score -= 10;

  // Singleton low cards that aren't part of combos
  if (cards.length === 1 && isNormalCard(cards[0])) {
    score -= cards[0].rank; // lower rank = better to lead
  }

  return score;
}

/** Select diverse top candidates: pick best from each combo type. */
function preFilterCandidates(candidates: (Card[] | null)[], hand: Card[], maxCandidates: number = 5): (Card[] | null)[] {
  if (candidates.length <= maxCandidates) return candidates;

  // Score and sort
  const scored = candidates.map((c, i) => ({
    cards: c,
    index: i,
    score: scoreCandidateHeuristic(c, hand),
    type: c ? (detectCombination(c)?.type ?? 'unknown') : 'pass',
    length: c?.length ?? 0,
  }));
  scored.sort((a, b) => b.score - a.score);

  // Pick top candidates, ensuring type diversity
  const selected: (Card[] | null)[] = [];
  const seenTypes = new Set<string>();

  for (const s of scored) {
    if (selected.length >= maxCandidates) break;
    const key = `${s.type}_${s.length}`;
    if (!seenTypes.has(key) || selected.length < 3) {
      selected.push(s.cards);
      seenTypes.add(key);
    }
  }

  return selected;
}

// ─── Determinization ──────────────────────────────────────────────────

function determinize(engine: GameEngine, botPosition: PlayerPosition): GameEngine {
  const clone = engine.clone();

  const knownIds = new Set<string>();
  const botHand = clone.state.players[botPosition].hand;
  for (const c of botHand) knownIds.add(c.id);

  for (const p of clone.state.players) {
    for (const trick of p.wonTricks) {
      for (const c of trick) knownIds.add(c.id);
    }
  }
  for (const play of clone.state.currentTrick.plays) {
    for (const c of play.combination.cards) knownIds.add(c.id);
  }

  const unknown = FULL_DECK.filter((c) => !knownIds.has(c.id));
  shuffle(unknown);

  let idx = 0;
  for (let p = 0; p < 4; p++) {
    if (p === botPosition) continue;
    const player = clone.state.players[p];
    const count = player.hand.length;
    player.hand = unknown.slice(idx, idx + count);
    idx += count;
  }

  return clone;
}

// ─── Rollout ──────────────────────────────────────────────────────────

function rollout(engine: GameEngine, deadline: number): void {
  let safety = 0;

  while (
    (engine.state.phase === GamePhase.PLAYING || engine.state.phase === GamePhase.DRAGON_GIVE) &&
    safety < 500
  ) {
    safety++;
    // Abort if we've exceeded the time budget (check every 20 iterations to avoid syscall overhead)
    if (safety % 20 === 0 && performance.now() > deadline) return;

    if (engine.state.dogPending) { engine.resolveDog(); continue; }
    if (engine.state.trickWonPending) { engine.completeTrickWon(); continue; }

    if (engine.state.wishPending !== null) {
      const wp = engine.state.wishPending;
      engine.setWish(wp, rolloutBots[wp].chooseWish(engine.state.players[wp].hand, buildCtx(engine)));
      continue;
    }

    if (engine.state.phase === GamePhase.DRAGON_GIVE) {
      const w = engine.state.dragonWinner!;
      const opps = engine.state.players
        .filter((p) => p.position % 2 !== w % 2)
        .map((p) => p.position as PlayerPosition);
      const cc = new Map(opps.map((p) => [p, engine.state.players[p].hand.length] as [PlayerPosition, number]));
      engine.dragonGive(w, rolloutBots[w].chooseDragonGiveTarget(opps, cc, buildCtx(engine)));
      continue;
    }

    const cp = engine.state.currentPlayer;
    const pl = engine.state.players[cp];

    let ids = rolloutBots[cp].choosePlay(
      pl.hand, engine.state.currentTrick, engine.state.wish, cp, buildCtx(engine)
    );

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
}

// ─── Evaluation ───────────────────────────────────────────────────────

function evaluateOutcome(engine: GameEngine, botPosition: PlayerPosition): number {
  const myTeam = botPosition % 2;
  const partnerPos = (botPosition + 2) % 4;

  let score = engine.state.roundScores[myTeam] - engine.state.roundScores[1 - myTeam];

  const finishOrder = engine.state.finishOrder;

  // Reward going out first (tichu bonus potential)
  if (finishOrder.length > 0) {
    const firstOut = finishOrder[0];
    if (firstOut === botPosition) score += 40;
    else if (firstOut === partnerPos) score += 30;
    else score -= 30;
  }

  // Reward double victory (1-2 finish by same team)
  if (finishOrder.length >= 2) {
    const first = finishOrder[0] % 2;
    const second = finishOrder[1] % 2;
    if (first === myTeam && second === myTeam) score += 100;
    else if (first !== myTeam && second !== myTeam) score -= 100;
  }

  // Penalize cards remaining (fewer = better)
  const myCardsLeft = engine.state.players[botPosition].hand.length;
  score -= myCardsLeft * 3;

  // Reward tichu success / penalize failure
  const myCall = engine.state.players[botPosition].tichuCall;
  if (myCall !== 'none' && finishOrder.length > 0) {
    const succeeded = finishOrder[0] === botPosition;
    const bonus = myCall === 'grand_tichu' ? 200 : 100;
    score += succeeded ? bonus : -bonus;
  }

  return score;
}

// ─── Main Entry Point ─────────────────────────────────────────────────

interface MCCandidate {
  cardIds: string[] | null;
  totalScore: number;
  simCount: number;
}

/**
 * Monte Carlo evaluation of candidate plays.
 * Pre-filters to top 5 candidates, then evaluates via simulation.
 */
export function monteCarloEvaluate(
  engine: GameEngine,
  botPosition: PlayerPosition,
  candidates: (Card[] | null)[],
  maxSimulations: number = 200,
  timeBudgetMs: number = 150,
): string[] | null {
  if (candidates.length <= 1) {
    const only = candidates[0];
    return only ? only.map((c) => c.id) : null;
  }

  // Pre-filter to top candidates
  const hand = engine.state.players[botPosition].hand;
  const filtered = preFilterCandidates(candidates, hand, 5);

  if (filtered.length <= 1) {
    const only = filtered[0];
    return only ? only.map((c) => c.id) : null;
  }

  const start = performance.now();
  const deadline = start + timeBudgetMs;
  const mc: MCCandidate[] = filtered.map((cards) => ({
    cardIds: cards ? cards.map((c) => c.id) : null,
    totalScore: 0,
    simCount: 0,
  }));

  let totalSims = 0;

  while (totalSims < maxSimulations && (performance.now() - start) < timeBudgetMs) {
    const candidateIdx = totalSims % mc.length;
    const candidate = mc[candidateIdx];

    try {
      const sim = determinize(engine, botPosition);

      if (candidate.cardIds) {
        sim.playCards(botPosition as PlayerPosition, candidate.cardIds);
      } else {
        sim.passTurn(botPosition as PlayerPosition);
      }

      // Resolve immediate pending states
      if (sim.state.dogPending) sim.resolveDog();
      if (sim.state.trickWonPending) sim.completeTrickWon();
      if (sim.state.wishPending === botPosition) {
        sim.setWish(botPosition, rolloutBots[botPosition].chooseWish(
          sim.state.players[botPosition].hand, buildCtx(sim)
        ));
      }

      rollout(sim, deadline);

      const score = evaluateOutcome(sim, botPosition);
      candidate.totalScore += score;
      candidate.simCount++;
      totalSims++;
    } catch {
      totalSims++;
    }
  }

  // Pick best average
  let bestIdx = 0;
  let bestAvg = -Infinity;
  for (let i = 0; i < mc.length; i++) {
    if (mc[i].simCount === 0) continue;
    const avg = mc[i].totalScore / mc[i].simCount;
    if (avg > bestAvg) {
      bestAvg = avg;
      bestIdx = i;
    }
  }

  return mc[bestIdx].cardIds;
}
