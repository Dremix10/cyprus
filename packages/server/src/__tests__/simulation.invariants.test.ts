/**
 * Plays whole games with four server bots and checks the rules after every
 * single action: card conservation, no hidden-hand leaks in client state, the
 * Dog-lead notice, Phoenix ranks, game length (quick game = one round) and
 * round scoring. Covers what unit tests with hand-built deals can miss.
 */
import { describe, expect, it } from 'vitest';
import {
  CombinationType,
  FULL_DECK,
  GamePhase,
  SpecialCardType,
  findPlayableFromHand,
  getPartner,
  isQuickGame,
  sortCards,
  winningTeam,
} from '@cyprus/shared';
import type { Card, PlayerPosition, TichuCall } from '@cyprus/shared';
import { GameEngine } from '../GameEngine.js';
import { BotAI, type GameContext } from '../BotAI.js';

type Stats = {
  games: number;
  rounds: number;
  actions: number;
  dogLeads: number;
  dogLeadsToNextPlayer: number;
  phoenixLeads: number;
  phoenixOnSingle: number;
  doubleVictories: number;
  ties: number;
};

const POSITIONS = [0, 1, 2, 3] as PlayerPosition[];

function isSpecial(card: Card, type: SpecialCardType): boolean {
  return card.type === 'special' && card.specialType === type;
}

function gameContext(engine: GameEngine): GameContext {
  const playedCards: Card[] = [];
  for (const p of engine.state.players) for (const trick of p.wonTricks) playedCards.push(...trick);
  for (const play of engine.state.currentTrick.plays) playedCards.push(...play.combination.cards);
  return {
    playerCardCounts: new Map(engine.state.players.map((p) => [p.position as PlayerPosition, p.hand.length])),
    tichuCalls: tichuCalls(engine),
    finishOrder: engine.state.finishOrder as PlayerPosition[],
    playedCards,
    scores: [...engine.state.scores] as [number, number],
  };
}

function tichuCalls(engine: GameEngine): Record<PlayerPosition, TichuCall> {
  return {
    0: engine.state.players[0].tichuCall,
    1: engine.state.players[1].tichuCall,
    2: engine.state.players[2].tichuCall,
    3: engine.state.players[3].tichuCall,
  };
}

/** Every card is in exactly one place. A resolved Dog is the only card allowed to leave play. */
function checkCardConservation(engine: GameEngine, dogResolvedThisRound: boolean, where: string): void {
  if (engine.state.phase === GamePhase.WAITING || engine.state.phase === GamePhase.GAME_OVER) return;
  if (engine.state.phase === GamePhase.ROUND_SCORING) return;
  // Grand Tichu: only the first 8 cards each are dealt.
  if (engine.state.phase === GamePhase.GRAND_TICHU) {
    for (const p of engine.state.players) expect(p.hand.length, where).toBe(8);
    return;
  }
  const seen = new Map<string, string>();
  const add = (card: Card, place: string) => {
    const prev = seen.get(card.id);
    if (prev) throw new Error(`${where}: card ${card.id} is in ${prev} and ${place}`);
    seen.set(card.id, place);
  };
  for (const p of engine.state.players) {
    for (const c of p.hand) add(c, `hand ${p.position}`);
    for (const t of p.wonTricks) for (const c of t) add(c, `tricks ${p.position}`);
  }
  for (const play of engine.state.currentTrick.plays) {
    for (const c of play.combination.cards) add(c, 'current trick');
  }
  if (engine.state.phase === GamePhase.PASSING) {
    // Passed cards stay in the passer's hand until everyone has passed.
    expect(seen.size, where).toBe(56);
    return;
  }
  const missing = FULL_DECK.filter((c) => !seen.has(c.id));
  if (missing.length === 0) return;
  expect(missing.map((c) => c.id), `${where}: only a resolved Dog may leave play`).toEqual(
    dogResolvedThisRound ? [FULL_DECK.find((c) => isSpecial(c, SpecialCardType.DOG))!.id] : [],
  );
}

/**
 * Each client only sees its own hand (plus a teammate's once out, which the UI allows).
 * At round scoring the leftover hand is shown on purpose, so that phase is skipped.
 */
function checkNoHandLeak(engine: GameEngine, where: string): void {
  const reveal = engine.state.phase === GamePhase.ROUND_SCORING || engine.state.phase === GamePhase.GAME_OVER;
  for (const pos of POSITIONS) {
    const state = engine.getClientState(pos, 'SIM');
    const me = engine.state.players[pos];
    const visible = new Set<string>();
    const json = JSON.stringify(state);
    for (const other of engine.state.players) {
      if (other.position === pos) continue;
      const teammateReveal = me.isOut && !other.isOut && other.position % 2 === pos % 2;
      for (const card of other.hand) {
        // You know which cards you passed away; they are in other hands until played.
        const passedByMe = me.passedCards && Object.values(me.passedCards).includes(card.id);
        if (teammateReveal || passedByMe) continue;
        if (json.includes(`"${card.id}"`)) visible.add(`${card.id}@${other.position}`);
      }
    }
    if (!reveal) expect([...visible], `${where}: seat ${pos} can see hidden cards`).toEqual([]);
    expect(state.myHand.map((c) => c.id), `${where}: seat ${pos} hand order`).toEqual(
      sortCards(me.hand).map((c) => c.id),
    );
    expect(state.dogLead ?? null, `${where}: seat ${pos} dogLead`).toEqual(engine.state.dogLead ?? null);
  }
}

function checkHandOrder(engine: GameEngine, where: string): void {
  for (const p of engine.state.players) {
    const idx = p.hand.findIndex((c) => isSpecial(c, SpecialCardType.PHOENIX));
    if (idx === -1) continue;
    // Only the Dragon may sit after the Phoenix.
    const after = p.hand.slice(idx + 1);
    expect(after.every((c) => isSpecial(c, SpecialCardType.DRAGON)), `${where}: Phoenix order in hand ${p.position}`).toBe(true);
  }
}

function checkDogLead(engine: GameEngine, where: string): void {
  const lead = engine.state.dogLead;
  if (!lead) return;
  if (engine.state.phase !== GamePhase.PLAYING) {
    throw new Error(`${where}: dogLead survived into ${engine.state.phase}`);
  }
  const partner = getPartner(lead.from);
  expect(isSpecial(lead.card, SpecialCardType.DOG), where).toBe(true);
  if (!engine.state.players[partner].isOut) expect(lead.to, `${where}: Dog goes to partner`).toBe(partner);
  if (engine.state.dogPending || engine.state.roundEndPending) return;
  expect(engine.state.currentTrick.plays, `${where}: trick is empty after the Dog`).toHaveLength(0);
  expect(engine.state.currentPlayer, `${where}: Dog receiver leads`).toBe(lead.to);
  expect(engine.state.players[lead.to].isOut, `${where}: Dog receiver is still in`).toBe(false);
}

function checkPhoenixSingle(engine: GameEngine, stats: Stats, where: string): void {
  const plays = engine.state.currentTrick.plays;
  if (plays.length === 0) return;
  const last = plays[plays.length - 1];
  const combo = last.combination;
  if (combo.type !== CombinationType.SINGLE || !isSpecial(combo.cards[0], SpecialCardType.PHOENIX)) return;
  if (plays.length === 1) {
    stats.phoenixLeads++;
    expect(combo.rank, `${where}: led Phoenix`).toBe(1.5);
    return;
  }
  const prev = plays[plays.length - 2].combination;
  stats.phoenixOnSingle++;
  expect(isSpecial(prev.cards[0], SpecialCardType.DRAGON), `${where}: Phoenix on Dragon`).toBe(false);
  expect(combo.rank, `${where}: Phoenix is half above the single`).toBe(prev.rank + 0.5);
}

function checkRoundScore(engine: GameEngine, stats: Stats, where: string): void {
  const history = engine.getRoundHistory();
  const last = history[history.length - 1];
  const bonus: [number, number] = [0, 0];
  for (const r of last.tichuResults) {
    const value = r.call === 'grand_tichu' ? 200 : 100;
    bonus[r.team] += r.success ? value : -value;
  }
  const cardPoints: [number, number] = [last.teamScores[0] - bonus[0], last.teamScores[1] - bonus[1]];
  if (last.doubleVictory !== null) {
    stats.doubleVictories++;
    const winner = last.doubleVictory;
    expect(cardPoints[winner], `${where}: double victory`).toBe(200);
    expect(cardPoints[1 - winner], `${where}: double victory loser`).toBe(0);
  } else {
    expect(cardPoints[0] + cardPoints[1], `${where}: card points per round`).toBe(100);
  }
  const prevTotals = history.length > 1 ? history[history.length - 2].runningTotals : [0, 0];
  expect(last.runningTotals, where).toEqual([prevTotals[0] + last.teamScores[0], prevTotals[1] + last.teamScores[1]]);
  expect(engine.state.scores, where).toEqual(last.runningTotals);
}

function playGame(targetScore: number, seed: number, stats: Stats): void {
  const engine = new GameEngine(['P0', 'P1', 'P2', 'P3'], targetScore);
  const bots = POSITIONS.map(() => new BotAI('medium'));
  let dogResolvedThisRound = false;
  let round = 1;
  let step = 0;
  const where = () => `target=${targetScore} game#${seed} round ${round} step ${step}`;

  const afterAction = () => {
    step++;
    stats.actions++;
    checkCardConservation(engine, dogResolvedThisRound, where());
    checkNoHandLeak(engine, where());
    checkHandOrder(engine, where());
    checkDogLead(engine, where());
    checkPhoenixSingle(engine, stats, where());
  };

  engine.startRound();
  expect(engine.state.dogLead).toBeNull();
  afterAction();

  while (engine.state.phase !== GamePhase.GAME_OVER) {
    if (round > 60) throw new Error(`${where()}: game did not end`);
    const phase = engine.state.phase;

    if (phase === GamePhase.GRAND_TICHU) {
      const pos = POSITIONS.find((p) => !engine.state.players[p].grandTichuDecided)!;
      engine.grandTichuDecision(pos, bots[pos].decideGrandTichu(engine.state.players[pos].hand));
      afterAction();
      continue;
    }

    if (phase === GamePhase.PASSING) {
      const pos = POSITIONS.find((p) => !engine.state.players[p].passedCards)!;
      engine.passCards(pos, bots[pos].choosePassCards(engine.state.players[pos].hand, pos, tichuCalls(engine)));
      afterAction();
      continue;
    }

    if (phase === GamePhase.ROUND_SCORING) {
      checkRoundScore(engine, stats, where());
      stats.rounds++;
      engine.nextRound();
      const reached = Math.max(...engine.state.scores) >= targetScore;
      if (isQuickGame(targetScore) || reached) {
        expect(engine.state.phase, `${where()}: game should be over`).toBe(GamePhase.GAME_OVER);
      } else {
        expect(engine.state.phase, `${where()}: game should continue`).toBe(GamePhase.GRAND_TICHU);
        round++;
        dogResolvedThisRound = false;
        expect(engine.state.dogLead, `${where()}: new round clears Dog`).toBeNull();
      }
      afterAction();
      continue;
    }

    if (engine.state.dogPending) {
      const lead = engine.state.dogLead;
      if (engine.state.roundEndPending) {
        expect(lead, `${where()}: no Dog notice when the Dog ended the round`).toBeNull();
      } else {
        expect(lead, `${where()}: dogLead set while Dog is pending`).not.toBeNull();
      }
      stats.dogLeads++;
      if (lead && lead.to !== getPartner(lead.from)) stats.dogLeadsToNextPlayer++;
      engine.resolveDog();
      dogResolvedThisRound = true;
      afterAction();
      continue;
    }
    if (engine.state.trickWonPending) {
      engine.completeTrickWon();
      afterAction();
      continue;
    }
    if (engine.state.roundEndPending) {
      engine.completeRoundEnd();
      afterAction();
      continue;
    }
    if (engine.state.wishPending !== null) {
      const pos = engine.state.wishPending;
      engine.setWish(pos, bots[pos].chooseWish(engine.state.players[pos].hand, gameContext(engine)));
      afterAction();
      continue;
    }
    if (phase === GamePhase.DRAGON_GIVE) {
      const winner = engine.state.dragonWinner!;
      const opponents = POSITIONS.filter((p) => p % 2 !== winner % 2);
      const counts = new Map(opponents.map((p) => [p, engine.state.players[p].hand.length] as [PlayerPosition, number]));
      engine.dragonGive(winner, bots[winner].chooseDragonGiveTarget(opponents, counts, gameContext(engine)));
      afterAction();
      continue;
    }

    expect(phase, where()).toBe(GamePhase.PLAYING);
    const pos = engine.state.currentPlayer;
    const player = engine.state.players[pos];
    expect(player.isOut, `${where()}: current player is out`).toBe(false);
    const context = gameContext(engine);
    if (player.tichuCall === 'none' && !player.hasPlayedCards && bots[pos].decideTichu(player.hand, context, pos)) {
      engine.callTichu(pos);
      afterAction();
      continue;
    }

    const dogTarget = engine.state.dogLead?.to ?? null;
    let cardIds = bots[pos].choosePlay(player.hand, engine.state.currentTrick, engine.state.wish, pos, context);
    if (!cardIds && engine.state.wish.active && engine.state.wish.wishedRank !== null) {
      const plays = engine.state.currentTrick.plays;
      const top = plays.length > 0 ? plays[plays.length - 1].combination : null;
      const wished = findPlayableFromHand(player.hand, top, engine.state.wish).find((cards) =>
        cards.some((c) => c.type === 'normal' && c.rank === engine.state.wish.wishedRank),
      );
      if (wished) cardIds = wished.map((c) => c.id);
    }
    if (cardIds) engine.playCards(pos, cardIds);
    else engine.passTurn(pos);
    if (cardIds && dogTarget === pos) {
      expect(engine.state.dogLead, `${where()}: Dog notice clears when the receiver plays`).toBeNull();
    }
    afterAction();
  }

  stats.games++;
  const winner = winningTeam(engine.state.scores);
  if (winner === null) stats.ties++;
  if (isQuickGame(targetScore)) {
    expect(engine.getRoundHistory(), `quick game #${seed}`).toHaveLength(1);
  } else {
    expect(Math.max(...engine.state.scores), `target game #${seed}`).toBeGreaterThanOrEqual(targetScore);
  }
}

function emptyStats(): Stats {
  return {
    games: 0,
    rounds: 0,
    actions: 0,
    dogLeads: 0,
    dogLeadsToNextPlayer: 0,
    phoenixLeads: 0,
    phoenixOnSingle: 0,
    doubleVictories: 0,
    ties: 0,
  };
}

describe('full-game simulation invariants', () => {
  it('quick games (one round) keep every rule', () => {
    const stats = emptyStats();
    for (let i = 0; i < 120; i++) playGame(0, i, stats);
    expect(stats.games).toBe(120);
    expect(stats.rounds).toBe(120);
    // The rarer branches must actually have been exercised.
    expect(stats.dogLeads).toBeGreaterThan(10);
    expect(stats.phoenixLeads + stats.phoenixOnSingle).toBeGreaterThan(10);
  }, 120_000);

  it.each([250, 500, 1000])('target %i games end exactly when a team reaches it', (target) => {
    const stats = emptyStats();
    const games = target === 1000 ? 6 : 10;
    for (let i = 0; i < games; i++) playGame(target, i, stats);
    expect(stats.games).toBe(games);
    expect(stats.rounds).toBeGreaterThanOrEqual(games);
  }, 120_000);
});
