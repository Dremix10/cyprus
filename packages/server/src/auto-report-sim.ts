/**
 * Offline bot auditor.
 *
 * Runs simulated bot games, stores replayable synthetic events, and inserts the
 * most suspicious bot decisions into auto_bot_play_reports for admin review.
 *
 * Usage:
 *   npm run bot:audit -- --games=5 --max-reports=20 --tier=hard
 *   npm run bot:audit -- --games=1 --max-reports=5 --tier=medium --db=/tmp/audit.db
 */
import {
  CombinationType,
  FULL_DECK,
  GamePhase,
  SpecialCardType,
  detectCombination,
  findPlayableFromHand,
  getCardPoints,
  isNormalCard,
  isSpecial,
  type Card,
  type Combination,
  type GameEvent,
  type PlayerPosition,
  type TichuCall,
  type TrickState,
} from '@cyprus/shared';
import { BotAI, type BotConfig, type BotDifficulty, type GameContext, type MonteCarloEvaluator } from './BotAI.js';
import { GameEngine } from './GameEngine.js';
import { monteCarloEvaluateDetailed } from './MonteCarloSim.js';
import { buildReplaySnapshot, type ReplaySnapshot } from './ReplaySnapshot.js';
import { TrackerDB } from './Database.js';

type AuditOptions = {
  games: number;
  maxReports: number;
  tier: BotDifficulty;
  targetScore: number;
  maxRounds: number;
  dbPath?: string;
  dryRun: boolean;
};

type Suspicion = {
  localEventKey: string;
  gameEventId: number | null;
  roomCode: string;
  gameIndex: number;
  round: number;
  turn: number;
  source: string;
  reasonTag: string;
  reason: string;
  severity: number;
  confidence: number;
  branchTag: string | null;
  botTier: string | null;
  auditorData: Record<string, unknown>;
};

type BotEvidence = {
  tier?: BotDifficulty;
  branchTag?: string | null;
  position?: number;
  name?: string;
  hand?: string[];
  trickTop?: {
    type?: CombinationType;
    rank?: number;
    length?: number;
    bombPower?: number;
  } | null;
  trickPoints?: number;
  oppCardCounts?: Record<string, number> | Record<number, number>;
  tichuCalls?: Record<string, TichuCall> | Record<number, TichuCall>;
  currentTrickPlays?: Array<{
    position: number;
    cards: string[];
    comboType?: CombinationType;
    rank?: number;
  }>;
  currentWinner?: number | null;
  passCount?: number;
  wish?: { active: boolean; wishedRank: number | null };
  finishOrder?: number[];
  scores?: [number, number];
  mc?: {
    heuristicCardIds: string[] | null;
    heuristicBranch: string | null;
    mcCardIds: string[] | null;
    accepted: boolean;
    reason: string;
    margin: number | null;
    totalSims: number;
    durationMs: number;
    errorCount: number;
  };
  leadScorer?: {
    cardIds: string[];
    confidence: number;
    reason: string;
    score: number;
  };
  endgameSolver?: {
    cardIds: string[] | null;
    confidence: number;
    reason: string;
    mode: string;
    score: number;
  };
};

const CARD_BY_ID = new Map(FULL_DECK.map((card) => [card.id, card]));
const DEFAULT_TARGET_SCORE = 1000;
const DEFAULT_MAX_ROUNDS = 50;

function parseOptions(args: string[]): AuditOptions {
  const opts: AuditOptions = {
    games: 5,
    maxReports: 20,
    tier: 'hard',
    targetScore: DEFAULT_TARGET_SCORE,
    maxRounds: DEFAULT_MAX_ROUNDS,
    dryRun: false,
  };

  const positional: string[] = [];
  for (const arg of args) {
    if (arg === '--dry-run') {
      opts.dryRun = true;
    } else if (arg.startsWith('--games=')) {
      opts.games = positiveInt(arg.slice('--games='.length), opts.games);
    } else if (arg.startsWith('--max-reports=')) {
      opts.maxReports = positiveInt(arg.slice('--max-reports='.length), opts.maxReports);
    } else if (arg.startsWith('--tier=')) {
      opts.tier = parseTier(arg.slice('--tier='.length), opts.tier);
    } else if (arg.startsWith('--target-score=')) {
      opts.targetScore = positiveInt(arg.slice('--target-score='.length), opts.targetScore);
    } else if (arg.startsWith('--max-rounds=')) {
      opts.maxRounds = positiveInt(arg.slice('--max-rounds='.length), opts.maxRounds);
    } else if (arg.startsWith('--db=')) {
      opts.dbPath = arg.slice('--db='.length);
    } else {
      positional.push(arg);
    }
  }

  if (positional[0]) opts.games = positiveInt(positional[0], opts.games);
  if (positional[1]) opts.maxReports = positiveInt(positional[1], opts.maxReports);
  if (positional[2]) opts.tier = parseTier(positional[2], opts.tier);
  return opts;
}

function positiveInt(raw: string, fallback: number): number {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function parseTier(raw: string, fallback: BotDifficulty): BotDifficulty {
  if (raw === 'easy' || raw === 'medium' || raw === 'hard' || raw === 'extreme' || raw === 'unfair') {
    return raw;
  }
  return fallback;
}

function configForTier(tier: BotDifficulty): Partial<BotConfig> {
  switch (tier) {
    case 'unfair':
      return { useMonteCarlo: true, mcSims: 600, mcTimeMs: 400, mcOverrideMargin: 18 };
    case 'extreme':
      return { useMonteCarlo: true, mcSims: 400, mcTimeMs: 300, mcOverrideMargin: 22 };
    case 'hard':
      return { useMonteCarlo: true, mcOverrideMargin: 30 };
    default:
      return { useMonteCarlo: false };
  }
}

function buildGameContext(engine: GameEngine): GameContext {
  const playedCards: Card[] = [];
  for (const p of engine.state.players) {
    for (const trick of p.wonTricks) playedCards.push(...trick);
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

function buildBotDecisionEnrichment(
  tier: BotDifficulty,
  hand: Card[],
  engine: GameEngine,
  bot: BotAI,
): Record<string, unknown> {
  const trick = engine.state.currentTrick;
  const actingPlayer = engine.state.players[engine.state.currentPlayer];
  const top = trick.plays.length > 0 ? trick.plays[trick.plays.length - 1].combination : null;
  const oppCardCounts: Record<number, number> = {};
  const tichuCalls: Record<number, TichuCall> = { 0: 'none', 1: 'none', 2: 'none', 3: 'none' };
  for (const p of engine.state.players) {
    oppCardCounts[p.position] = p.hand.length;
    tichuCalls[p.position] = p.tichuCall;
  }
  const currentTrickPlays = trick.plays.map((p) => ({
    position: p.playerPosition,
    cards: p.combination.cards.map((c) => c.id),
    comboType: p.combination.type,
    rank: p.combination.rank,
  }));
  const decision: BotEvidence = {
    tier,
    branchTag: bot.lastBranch,
    position: actingPlayer.position,
    name: actingPlayer.nickname,
    hand: hand.map((c) => c.id),
    trickTop: top ? { type: top.type, rank: top.rank, length: top.length, bombPower: top.bombPower } : null,
    trickPoints: estimateTrickPoints(trick),
    oppCardCounts,
    tichuCalls,
    currentTrickPlays,
    currentWinner: trick.currentWinner,
    passCount: trick.passCount,
    wish: engine.state.wish.active
      ? { active: true, wishedRank: engine.state.wish.wishedRank }
      : { active: false, wishedRank: null },
    finishOrder: [...engine.state.finishOrder],
    scores: [...engine.state.scores] as [number, number],
  };
  if (bot.lastMonteCarloTrace) decision.mc = bot.lastMonteCarloTrace;
  if (bot.lastLeadScoreTrace) decision.leadScorer = {
    cardIds: bot.lastLeadScoreTrace.cardIds,
    confidence: bot.lastLeadScoreTrace.confidence,
    reason: bot.lastLeadScoreTrace.reason,
    score: bot.lastLeadScoreTrace.score,
  };
  if (bot.lastEndgameSolverTrace) decision.endgameSolver = {
    cardIds: bot.lastEndgameSolverTrace.cardIds,
    confidence: bot.lastEndgameSolverTrace.confidence,
    reason: bot.lastEndgameSolverTrace.reason,
    mode: bot.lastEndgameSolverTrace.mode,
    score: bot.lastEndgameSolverTrace.score,
  };
  return { bot: decision };
}

function estimateTrickPoints(trick: TrickState): number {
  let points = 0;
  for (const play of trick.plays) {
    for (const card of play.combination.cards) points += getCardPoints(card);
  }
  return points;
}

function attachBotDecision(events: GameEvent[], enrichment: Record<string, unknown>): void {
  for (const ev of events) {
    if (ev.type !== 'PLAY' && ev.type !== 'BOMB' && ev.type !== 'PASS') continue;
    ev.data = { ...(ev.data ?? {}), ...enrichment };
  }
}

function logEvents(
  db: TrackerDB | null,
  roomCode: string,
  events: GameEvent[],
  snapshot: ReplaySnapshot,
): Array<{ event: GameEvent; eventId: number | null }> {
  return events.map((event) => {
    if (!db) return { event, eventId: null };
    const eventId = db.logGameEvent(null, roomCode, event.type, event.playerPosition ?? null, event.data);
    db.logGameEventSnapshot(eventId, snapshot);
    event.id = eventId;
    return { event, eventId };
  });
}

function cardsFromIds(ids: string[] | null | undefined): Card[] {
  if (!ids) return [];
  return ids.map((id) => CARD_BY_ID.get(id)).filter((card): card is Card => !!card);
}

function cardIdsFromEvent(event: GameEvent): string[] | null {
  if (event.type === 'PASS') return null;
  const combination = event.data?.combination as Combination | undefined;
  if (!combination?.cards) return [];
  return combination.cards.map((card) => card.id);
}

function sortedIds(ids: string[] | null | undefined): string[] | null {
  if (ids === null || ids === undefined) return null;
  return [...ids].sort();
}

function sameIds(a: string[] | null | undefined, b: string[] | null | undefined): boolean {
  const aa = sortedIds(a);
  const bb = sortedIds(b);
  if (aa === null || bb === null) return aa === bb;
  if (aa.length !== bb.length) return false;
  return aa.every((id, index) => id === bb[index]);
}

function countFor(bot: BotEvidence, pos: number): number | null {
  const counts = bot.oppCardCounts as Record<string, number> | undefined;
  const value = counts?.[String(pos)];
  return typeof value === 'number' ? value : null;
}

function tichuFor(bot: BotEvidence, pos: number): TichuCall {
  const calls = bot.tichuCalls as Record<string, TichuCall> | undefined;
  return (calls?.[String(pos)] ?? 'none') as TichuCall;
}

function opponentDanger(bot: BotEvidence): number {
  const pos = bot.position ?? 0;
  const opponents = [0, 1, 2, 3].filter((p) => p % 2 !== pos % 2);
  let danger = 0;
  for (const opp of opponents) {
    const count = countFor(bot, opp);
    if (count === 1) danger = Math.max(danger, 3);
    else if (count === 2) danger = Math.max(danger, 2);
    else if (count === 3) danger = Math.max(danger, 1);
    const call = tichuFor(bot, opp);
    if ((call === 'tichu' || call === 'grand_tichu') && count !== null && count <= 4) {
      danger = Math.max(danger, 3);
    }
  }
  return danger;
}

function partnerHasLiveTichu(bot: BotEvidence): boolean {
  if (bot.position === undefined) return false;
  const partner = (bot.position + 2) % 4;
  const call = tichuFor(bot, partner);
  return (call === 'tichu' || call === 'grand_tichu') && !(bot.finishOrder ?? []).includes(partner);
}

function cardsContain(cards: Card[], special: SpecialCardType): boolean {
  return cards.some((card) => isSpecial(card, special));
}

function comboFromIds(ids: string[] | null | undefined): Combination | null {
  const cards = cardsFromIds(ids);
  if (cards.length === 0) return null;
  return detectCombination(cards);
}

function playableCountForPass(bot: BotEvidence): number | null {
  if (!bot.hand || !bot.trickTop || bot.position === undefined) return null;
  const hand = cardsFromIds(bot.hand);
  if (hand.length === 0) return null;
  const top = bot.trickTop as Combination;
  const wish = bot.wish?.active && bot.wish.wishedRank
    ? { active: true, wishedRank: bot.wish.wishedRank, wishedBy: null }
    : { active: false, wishedRank: null, wishedBy: null };
  return findPlayableFromHand(hand, top, wish).length;
}

function pushSuspicion(
  out: Suspicion[],
  base: Omit<Suspicion, 'severity' | 'confidence' | 'reasonTag' | 'reason' | 'auditorData' | 'source'>,
  fields: Pick<Suspicion, 'severity' | 'confidence' | 'reasonTag' | 'reason'> & {
    detector: Record<string, unknown>;
  },
): void {
  out.push({
    ...base,
    source: 'simulation-auditor',
    reasonTag: fields.reasonTag,
    reason: fields.reason,
    severity: Math.max(1, Math.min(5, fields.severity)),
    confidence: Math.max(0, Math.min(1, fields.confidence)),
    auditorData: {
      detector: fields.detector,
      roomCode: base.roomCode,
      gameIndex: base.gameIndex,
      round: base.round,
      turn: base.turn,
    },
  });
}

function analyzeEvent(input: {
  roomCode: string;
  gameIndex: number;
  round: number;
  turn: number;
  event: GameEvent;
  eventId: number | null;
}): Suspicion[] {
  const { event } = input;
  if (event.type !== 'PLAY' && event.type !== 'BOMB' && event.type !== 'PASS') return [];

  const bot = event.data?.bot as BotEvidence | undefined;
  if (!bot) return [];

  const actualIds = cardIdsFromEvent(event);
  const actualCards = cardsFromIds(actualIds);
  const actualCombo = event.type === 'PASS' ? null : ((event.data?.combination as Combination | undefined) ?? comboFromIds(actualIds));
  const branchTag = bot.branchTag ?? null;
  const tier = bot.tier ?? null;
  const base = {
    localEventKey: `${input.roomCode}:${input.turn}`,
    gameEventId: input.eventId,
    roomCode: input.roomCode,
    gameIndex: input.gameIndex,
    round: input.round,
    turn: input.turn,
    branchTag,
    botTier: tier,
  };

  const suspicions: Suspicion[] = [];
  const danger = opponentDanger(bot);
  const trickPoints = Number(bot.trickPoints ?? 0);
  const handCount = bot.hand?.length ?? 0;
  const actualText = actualIds === null ? 'PASS' : actualIds.join(' ');

  if (bot.endgameSolver && !sameIds(bot.endgameSolver.cardIds, actualIds) && bot.endgameSolver.confidence >= 4) {
    const importantMode = bot.endgameSolver.mode === 'partner-tichu-support' ||
      bot.endgameSolver.mode === 'opponent-tichu-block' ||
      bot.endgameSolver.mode === 'urgent-endgame';
    pushSuspicion(suspicions, base, {
      reasonTag: 'endgame-solver-disagreement',
      reason: `Shadow endgame solver preferred ${bot.endgameSolver.cardIds?.join(' ') || 'PASS'} over actual ${actualText}.`,
      severity: importantMode ? 4 : 3,
      confidence: Math.min(0.95, 0.55 + bot.endgameSolver.confidence / 40),
      detector: {
        actualCardIds: actualIds,
        solverCardIds: bot.endgameSolver.cardIds,
        mode: bot.endgameSolver.mode,
        solverReason: bot.endgameSolver.reason,
        solverConfidence: bot.endgameSolver.confidence,
      },
    });
  }

  if (bot.leadScorer && !sameIds(bot.leadScorer.cardIds, actualIds) && bot.leadScorer.confidence >= 18) {
    pushSuspicion(suspicions, base, {
      reasonTag: 'lead-scorer-disagreement',
      reason: `Shadow lead scorer strongly preferred ${bot.leadScorer.cardIds.join(' ')} over actual ${actualText}.`,
      severity: 3,
      confidence: Math.min(0.9, 0.45 + bot.leadScorer.confidence / 60),
      detector: {
        actualCardIds: actualIds,
        scorerCardIds: bot.leadScorer.cardIds,
        scorerReason: bot.leadScorer.reason,
        scorerConfidence: bot.leadScorer.confidence,
      },
    });
  }

  if (bot.mc?.accepted && branchTag === 'mc:override') {
    const resourceRisk = actualCards.some((card) =>
      isSpecial(card, SpecialCardType.DRAGON) ||
      isSpecial(card, SpecialCardType.PHOENIX)
    ) || event.type === 'BOMB';
    pushSuspicion(suspicions, base, {
      reasonTag: resourceRisk ? 'mc-resource-override' : 'mc-override-review',
      reason: `Monte Carlo overrode the heuristic from ${bot.mc.heuristicCardIds?.join(' ') || 'PASS'} to ${actualText}.`,
      severity: resourceRisk ? 4 : 2,
      confidence: Math.min(0.9, 0.45 + Math.max(0, bot.mc.margin ?? 0) / 120),
      detector: {
        actualCardIds: actualIds,
        heuristicCardIds: bot.mc.heuristicCardIds,
        mcCardIds: bot.mc.mcCardIds,
        margin: bot.mc.margin,
        totalSims: bot.mc.totalSims,
      },
    });
  }

  if (bot.mc && bot.mc.reason === 'pass-over-heuristic' && !sameIds(bot.mc.mcCardIds, bot.mc.heuristicCardIds)) {
    pushSuspicion(suspicions, base, {
      reasonTag: 'mc-tried-suspect-pass',
      reason: 'Monte Carlo wanted to pass over a cheap heuristic play; the advisor blocked it, but this is useful MC training data.',
      severity: 2,
      confidence: 0.55,
      detector: {
        actualCardIds: actualIds,
        heuristicCardIds: bot.mc.heuristicCardIds,
        mcCardIds: bot.mc.mcCardIds,
        mcReason: bot.mc.reason,
      },
    });
  }

  if (event.type === 'PASS') {
    const winner = bot.currentWinner;
    const winnerIsOpponent = winner !== null && winner !== undefined && bot.position !== undefined && winner % 2 !== bot.position % 2;
    const winnerCount = winner === null || winner === undefined ? null : countFor(bot, winner);
    const playableCount = playableCountForPass(bot);
    if (winnerIsOpponent && winnerCount !== null && winnerCount > 0 && winnerCount <= 2 && playableCount !== null && playableCount > 0) {
      pushSuspicion(suspicions, base, {
        reasonTag: 'pass-to-near-out-opponent',
        reason: `Bot passed while an opponent with ${winnerCount} card(s) was winning and the bot had legal replies.`,
        severity: winnerCount <= 1 ? 5 : 4,
        confidence: winnerCount <= 1 ? 0.9 : 0.78,
        detector: {
          currentWinner: winner,
          currentWinnerCards: winnerCount,
          playableCount,
          trickPoints,
        },
      });
    }
  }

  if (event.type !== 'PASS') {
    if (cardsContain(actualCards, SpecialCardType.DRAGON) && trickPoints < 10 && handCount > 3 && danger < 2) {
      pushSuspicion(suspicions, base, {
        reasonTag: 'low-value-dragon',
        reason: `Dragon was used on a low-value trick (${trickPoints} points) without immediate endgame danger.`,
        severity: 4,
        confidence: 0.76,
        detector: { actualCardIds: actualIds, trickPoints, handCount, danger },
      });
    }

    if (
      actualCombo?.type === CombinationType.SINGLE &&
      cardsContain(actualCards, SpecialCardType.PHOENIX) &&
      handCount > 1 &&
      !partnerHasLiveTichu(bot)
    ) {
      pushSuspicion(suspicions, base, {
        reasonTag: 'phoenix-single-risk',
        reason: 'Phoenix was used as a standalone single while other cards remained.',
        severity: 4,
        confidence: 0.72,
        detector: { actualCardIds: actualIds, handCount, branchTag },
      });
    }

    if (event.type === 'BOMB' && trickPoints < 15 && handCount > 5 && danger < 2) {
      pushSuspicion(suspicions, base, {
        reasonTag: 'possible-bomb-waste',
        reason: `Bomb was used with ${handCount} cards left on a ${trickPoints}-point trick and no short opponent.`,
        severity: 4,
        confidence: 0.7,
        detector: { actualCardIds: actualIds, trickPoints, handCount, danger },
      });
    }

    if (partnerHasLiveTichu(bot) && actualIds !== null && handCount > 0 && actualIds.length >= handCount) {
      pushSuspicion(suspicions, base, {
        reasonTag: 'partner-tichu-rush-out',
        reason: 'Bot went out while its partner still had a live Tichu/Grand Tichu call.',
        severity: 4,
        confidence: 0.74,
        detector: {
          actualCardIds: actualIds,
          handCount,
          tichuCalls: bot.tichuCalls,
          finishOrder: bot.finishOrder,
        },
      });
    }

    if (actualCombo?.type === CombinationType.SINGLE && bot.trickTop === null && danger >= 2) {
      const card = actualCards[0];
      const rank = card && isNormalCard(card) ? card.rank : null;
      if (rank !== null && rank <= 8 && handCount >= 4) {
        pushSuspicion(suspicions, base, {
          reasonTag: 'low-single-into-danger',
          reason: 'Bot led a low single while an opponent was nearly out.',
          severity: 3,
          confidence: 0.62,
          detector: { actualCardIds: actualIds, rank, handCount, danger },
        });
      }
    }
  }

  return suspicions.map((s) => ({
    ...s,
    auditorData: {
      ...s.auditorData,
      actualCardIds: actualIds,
      actualEventType: event.type,
      playerPosition: event.playerPosition ?? null,
      branchTag,
      bot,
    },
  }));
}

function bestSuspicionsOnly(suspicions: Suspicion[]): Suspicion[] {
  const byEvent = new Map<string, Suspicion>();
  for (const suspicion of suspicions) {
    const key = suspicion.gameEventId === null ? suspicion.localEventKey : String(suspicion.gameEventId);
    const current = byEvent.get(key);
    if (!current) {
      byEvent.set(key, suspicion);
      continue;
    }
    if (
      suspicion.severity > current.severity ||
      (suspicion.severity === current.severity && suspicion.confidence > current.confidence)
    ) {
      byEvent.set(key, suspicion);
    }
  }
  return [...byEvent.values()].sort((a, b) =>
    b.severity - a.severity ||
    b.confidence - a.confidence ||
    a.gameIndex - b.gameIndex ||
    a.turn - b.turn
  );
}

function runGameAudit(
  db: TrackerDB | null,
  opts: AuditOptions,
  gameIndex: number,
): { suspicions: Suspicion[]; rounds: number; turns: number; errors: number } {
  const roomCode = `AUTO-${Date.now().toString(36).toUpperCase()}-${String(gameIndex + 1).padStart(3, '0')}`;
  const engine = new GameEngine(['Audit P0', 'Audit P1', 'Audit P2', 'Audit P3'], opts.targetScore);
  const botConfig = configForTier(opts.tier);
  const bots = Array.from({ length: 4 }, () => new BotAI(opts.tier, botConfig));
  const suspicions: Suspicion[] = [];
  let rounds = 0;
  let turns = 0;
  let errors = 0;

  const logAndAnalyze = (events: GameEvent[], snapshot: ReplaySnapshot) => {
    const logged = logEvents(db, roomCode, events, snapshot);
    for (const item of logged) {
      const found = analyzeEvent({
        roomCode,
        gameIndex: gameIndex + 1,
        round: rounds,
        turn: turns,
        event: item.event,
        eventId: item.eventId,
      });
      suspicions.push(...found);
    }
  };

  logAndAnalyze(engine.startRound(), buildReplaySnapshot(engine));
  rounds++;

  while (engine.state.phase !== GamePhase.GAME_OVER && rounds <= opts.maxRounds) {
    try {
      if (engine.state.phase === GamePhase.GRAND_TICHU) {
        for (let pos = 0; pos < 4; pos++) {
          if (!engine.state.players[pos].grandTichuDecided) {
            const snapshot = buildReplaySnapshot(engine);
            const call = bots[pos].decideGrandTichu(engine.state.players[pos].hand);
            logAndAnalyze(engine.grandTichuDecision(pos as PlayerPosition, call), snapshot);
          }
        }
      }

      if (engine.state.phase === GamePhase.PASSING) {
        for (let pos = 0; pos < 4; pos++) {
          if (engine.state.players[pos].passedCards) continue;
          const snapshot = buildReplaySnapshot(engine);
          const tichuCalls = {
            0: engine.state.players[0].tichuCall,
            1: engine.state.players[1].tichuCall,
            2: engine.state.players[2].tichuCall,
            3: engine.state.players[3].tichuCall,
          } as Record<PlayerPosition, TichuCall>;
          const pass = bots[pos].choosePassCards(engine.state.players[pos].hand, pos as PlayerPosition, tichuCalls);
          logAndAnalyze(engine.passCards(pos as PlayerPosition, pass), snapshot);
        }
      }

      let safety = 0;
      while (
        (engine.state.phase === GamePhase.PLAYING || engine.state.phase === GamePhase.DRAGON_GIVE) &&
        safety < 600
      ) {
        safety++;

        if (engine.state.dogPending) {
          engine.resolveDog();
          continue;
        }
        if (engine.state.trickWonPending) {
          engine.completeTrickWon();
          continue;
        }
        if (engine.state.roundEndPending) {
          const snapshot = buildReplaySnapshot(engine);
          logAndAnalyze(engine.completeRoundEnd(), snapshot);
          continue;
        }
        if (engine.state.wishPending !== null) {
          const pos = engine.state.wishPending;
          const snapshot = buildReplaySnapshot(engine);
          const rank = bots[pos].chooseWish(engine.state.players[pos].hand, buildGameContext(engine));
          logAndAnalyze(engine.setWish(pos, rank), snapshot);
          continue;
        }
        if (engine.state.phase === GamePhase.DRAGON_GIVE) {
          const winner = engine.state.dragonWinner!;
          const opponents = engine.state.players
            .filter((p) => p.position % 2 !== winner % 2)
            .map((p) => p.position as PlayerPosition);
          const counts = new Map(opponents.map((p) => [p, engine.state.players[p].hand.length] as [PlayerPosition, number]));
          const snapshot = buildReplaySnapshot(engine);
          const target = bots[winner].chooseDragonGiveTarget(opponents, counts, buildGameContext(engine));
          logAndAnalyze(engine.dragonGive(winner, target), snapshot);
          continue;
        }

        const pos = engine.state.currentPlayer;
        const bot = bots[pos];
        const player = engine.state.players[pos];
        const context = buildGameContext(engine);

        if (player.tichuCall === 'none' && !player.hasPlayedCards && bot.decideTichu(player.hand, context, pos)) {
          const snapshot = buildReplaySnapshot(engine);
          logAndAnalyze(engine.callTichu(pos), snapshot);
          continue;
        }

        let mcEval: MonteCarloEvaluator | undefined;
        if (bot.config.useMonteCarlo && !bot.inRollout) {
          mcEval = (candidates, options) =>
            monteCarloEvaluateDetailed(
              engine,
              pos,
              candidates,
              bot.config.mcSims,
              bot.config.mcTimeMs,
              undefined,
              roomCode,
              options,
            );
        }

        bot.lastBranch = null;
        const handBefore = [...player.hand];
        let cardIds = bot.choosePlay(
          player.hand,
          engine.state.currentTrick,
          engine.state.wish,
          pos,
          context,
          mcEval,
        );

        if (!cardIds && engine.state.wish.active && engine.state.wish.wishedRank !== null) {
          const top = engine.state.currentTrick.plays.length > 0
            ? engine.state.currentTrick.plays[engine.state.currentTrick.plays.length - 1].combination
            : null;
          const playable = findPlayableFromHand(player.hand, top, engine.state.wish);
          const wishedPlay = playable.find((cards) =>
            cards.some((card) => card.type === 'normal' && card.rank === engine.state.wish.wishedRank)
          );
          if (wishedPlay) cardIds = wishedPlay.map((card) => card.id);
        }

        const snapshot = buildReplaySnapshot(engine);
        const enrichment = buildBotDecisionEnrichment(opts.tier, handBefore, engine, bot);
        const events = cardIds ? engine.playCards(pos, cardIds) : engine.passTurn(pos);
        attachBotDecision(events, enrichment);
        turns++;
        logAndAnalyze(events, snapshot);
      }

      if (engine.state.phase === GamePhase.ROUND_SCORING) {
        const snapshot = buildReplaySnapshot(engine);
        logAndAnalyze(engine.nextRound(), snapshot);
        const phaseAfterNext = engine.state.phase as GamePhase;
        if (phaseAfterNext !== GamePhase.GAME_OVER) rounds++;
      }
    } catch (err) {
      errors++;
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`Game ${gameIndex + 1} stopped early in ${roomCode}: ${message}`);
      break;
    }
  }

  return { suspicions, rounds, turns, errors };
}

function persistTopReports(db: TrackerDB, reports: Suspicion[], maxReports: number): number {
  let inserted = 0;
  for (const report of reports.slice(0, maxReports)) {
    if (report.gameEventId === null) continue;
    db.recordAutoBotPlayReport({
      gameEventId: report.gameEventId,
      source: report.source,
      reasonTag: report.reasonTag,
      reason: report.reason,
      severity: report.severity,
      confidence: report.confidence,
      branchTag: report.branchTag,
      botTier: report.botTier,
      auditorData: report.auditorData,
    });
    inserted++;
  }
  return inserted;
}

function printReportSummary(reports: Suspicion[], inserted: number, opts: AuditOptions): void {
  console.log('');
  console.log('=== Auto Report Auditor Results ===');
  console.log(`Tier: ${opts.tier}`);
  console.log(`Suspicious plays found: ${reports.length}`);
  console.log(opts.dryRun ? 'Dry run: no reports inserted' : `Inserted auto reports: ${inserted}`);
  console.log('');
  console.log('Rank | Sev | Conf | Reason | Room | Event | Move');
  console.log('-----|-----|------|--------|------|-------|-----');
  for (const [index, report] of reports.slice(0, Math.min(opts.maxReports, 20)).entries()) {
    const move = Array.isArray(report.auditorData.actualCardIds)
      ? (report.auditorData.actualCardIds as string[]).join(' ')
      : 'PASS';
    console.log([
      String(index + 1).padStart(4),
      String(report.severity).padStart(3),
      `${Math.round(report.confidence * 100)}%`.padStart(4),
      report.reasonTag.padEnd(28),
      report.roomCode,
      report.gameEventId ?? '-',
      move,
    ].join(' | '));
  }
}

function main(): void {
  const opts = parseOptions(process.argv.slice(2));
  const db = opts.dryRun ? null : new TrackerDB(opts.dbPath);
  const allSuspicions: Suspicion[] = [];
  let totalRounds = 0;
  let totalTurns = 0;
  let errors = 0;
  const start = Date.now();

  console.log(`Running ${opts.games} ${opts.tier} audit game(s), max reports ${opts.maxReports}${opts.dryRun ? ' (dry run)' : ''}...`);
  for (let gameIndex = 0; gameIndex < opts.games; gameIndex++) {
    const result = runGameAudit(db, opts, gameIndex);
    allSuspicions.push(...result.suspicions);
    totalRounds += result.rounds;
    totalTurns += result.turns;
    errors += result.errors;
    console.log(`  Game ${gameIndex + 1}/${opts.games}: ${result.suspicions.length} suspects, ${result.rounds} rounds, ${result.turns} turns`);
  }

  const topReports = bestSuspicionsOnly(allSuspicions);
  const inserted = db ? persistTopReports(db, topReports, opts.maxReports) : 0;
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  printReportSummary(topReports, inserted, opts);
  console.log('');
  console.log(`Total: ${opts.games} game(s), ${totalRounds} rounds, ${totalTurns} turns, ${errors} error(s), ${elapsed}s`);
  db?.close();
}

main();
