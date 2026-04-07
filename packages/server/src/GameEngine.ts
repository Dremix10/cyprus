import type {
  Card,
  NormalRank,
  Combination,
  ClientGameState,
  TrickState,
  WishState,
  PublicPlayerState,
  PlayerPosition,
  TichuCall,
  GameEvent,
  RoundScoreBreakdown,
} from '@cyprus/shared';
import {
  GamePhase,
  SpecialCardType,
  CombinationType,
  sortCards,
  isSpecial,
  detectCombination,
  canBeat,
  findPlayableFromHand,
  getPhoenixSingleRank,
  calculateRoundScore,
  getTeam,
  getPartner,
  sameTeam,
  sumCardPoints,
  WINNING_SCORE,
} from '@cyprus/shared';
import { dealCards } from './Deck.js';

export type PlayerState = {
  position: PlayerPosition;
  nickname: string;
  hand: Card[];
  tichuCall: TichuCall;
  isOut: boolean;
  finishOrder: number | null;
  hasPlayedCards: boolean;
  grandTichuDecided: boolean;
  passedCards: { left: string; across: string; right: string } | null;
  wonTricks: Card[][];
};

export type GameEngineState = {
  phase: GamePhase;
  players: [PlayerState, PlayerState, PlayerState, PlayerState];
  currentPlayer: PlayerPosition;
  currentTrick: TrickState;
  wish: WishState;
  wishPending: PlayerPosition | null; // position of player who must choose a wish before play continues
  dogPending: boolean; // Dog was played, waiting for visual delay before resolving
  finishOrder: PlayerPosition[];
  scores: [number, number];
  roundScores: [number, number];
  dragonWinner: PlayerPosition | null;
};

export class GameEngine {
  state: GameEngineState;
  private events: GameEvent[] = [];
  private targetScore: number;
  private roundTrickCards: [Card[], Card[]] = [[], []];
  private roundBreakdown: RoundScoreBreakdown | null = null;
  private roundHistory: Array<{
    round: number;
    teamScores: [number, number];
    runningTotals: [number, number];
    doubleVictory: 0 | 1 | null;
    tichuResults: { position: PlayerPosition; call: 'tichu' | 'grand_tichu'; success: boolean; team: 0 | 1 }[];
  }> = [];

  constructor(nicknames: [string, string, string, string], targetScore: number = WINNING_SCORE) {
    this.targetScore = targetScore;
    this.state = {
      phase: GamePhase.WAITING,
      players: nicknames.map((nickname, i) => ({
        position: i as PlayerPosition,
        nickname,
        hand: [] as Card[],
        tichuCall: 'none' as TichuCall,
        isOut: false,
        finishOrder: null,
        hasPlayedCards: false,
        grandTichuDecided: false,
        passedCards: null,
        wonTricks: [] as Card[][],
      })) as unknown as [PlayerState, PlayerState, PlayerState, PlayerState],
      currentPlayer: 0,
      currentTrick: { plays: [], currentWinner: null, passCount: 0, passedPlayers: [] },
      wish: { active: false, wishedRank: null, wishedBy: null },
      wishPending: null,
      dogPending: false,
      finishOrder: [],
      scores: [0, 0],
      roundScores: [0, 0],
      dragonWinner: null,
    };
  }

  /** Start a new round: deal initial 8 cards, enter Grand Tichu phase. */
  startRound(): GameEvent[] {
    this.events = [];
    const dealt = dealCards();

    for (let i = 0; i < 4; i++) {
      const p = this.state.players[i];
      p.hand = sortCards(dealt.initial[i]);
      p.tichuCall = 'none';
      p.isOut = false;
      p.finishOrder = null;
      p.hasPlayedCards = false;
      p.grandTichuDecided = false;
      p.passedCards = null;
      p.wonTricks = [];
      // Store remaining cards on a temporary property
      (p as any)._remaining = dealt.remaining[i];
    }

    this.roundTrickCards = [[], []];
    this.roundBreakdown = null;
    this.state.phase = GamePhase.GRAND_TICHU;
    this.state.currentTrick = { plays: [], currentWinner: null, passCount: 0, passedPlayers: [] };
    this.state.wish = { active: false, wishedRank: null, wishedBy: null };
    this.state.wishPending = null;
    this.state.finishOrder = [];
    this.state.roundScores = [0, 0];
    this.state.dragonWinner = null;

    return this.events;
  }

  /** Player decides on Grand Tichu (call or pass). */
  grandTichuDecision(position: PlayerPosition, call: boolean): GameEvent[] {
    this.events = [];
    this.assertPhase(GamePhase.GRAND_TICHU);
    const player = this.state.players[position];

    if (player.grandTichuDecided) {
      throw new Error('Already decided on Grand Tichu');
    }

    player.grandTichuDecided = true;
    if (call) {
      player.tichuCall = 'grand_tichu';
      this.emit({ type: 'GRAND_TICHU_CALL', playerPosition: position });
    }

    // Check if all players have decided
    if (this.state.players.every((p) => p.grandTichuDecided)) {
      this.dealRemainingCards();
    }

    return this.events;
  }

  /** Deal the remaining 6 cards and move to passing phase. */
  private dealRemainingCards(): void {
    for (const p of this.state.players) {
      const remaining = (p as any)._remaining as Card[];
      p.hand = sortCards([...p.hand, ...remaining]);
      delete (p as any)._remaining;
    }
    this.state.phase = GamePhase.PASSING;
  }

  /** Player passes 3 cards (one to each other player). */
  passCards(
    position: PlayerPosition,
    cards: { left: string; across: string; right: string }
  ): GameEvent[] {
    this.events = [];
    this.assertPhase(GamePhase.PASSING);
    const player = this.state.players[position];

    if (player.passedCards) {
      throw new Error('Already passed cards');
    }

    // Validate all 3 card IDs are in hand and distinct
    const cardIds = [cards.left, cards.across, cards.right];
    if (new Set(cardIds).size !== 3) {
      throw new Error('Must pass 3 different cards');
    }
    for (const id of cardIds) {
      if (!player.hand.find((c) => c.id === id)) {
        throw new Error(`Card ${id} not in hand`);
      }
    }

    player.passedCards = cards;

    // Check if all players have passed
    if (this.state.players.every((p) => p.passedCards !== null)) {
      this.resolveCardPassing();
    }

    return this.events;
  }

  private resolveCardPassing(): void {
    // Collect cards to distribute
    const toGive: Map<PlayerPosition, Card[]>[] = [];

    for (const p of this.state.players) {
      const passed = p.passedCards!;
      const leftPos = ((p.position + 3) % 4) as PlayerPosition; // player to your left
      const acrossPos = ((p.position + 2) % 4) as PlayerPosition;
      const rightPos = ((p.position + 1) % 4) as PlayerPosition;

      const leftCard = p.hand.find((c) => c.id === passed.left)!;
      const acrossCard = p.hand.find((c) => c.id === passed.across)!;
      const rightCard = p.hand.find((c) => c.id === passed.right)!;

      // Remove cards from hand
      p.hand = p.hand.filter(
        (c) => c.id !== passed.left && c.id !== passed.across && c.id !== passed.right
      );

      // Queue cards for recipients
      if (!toGive[p.position]) toGive[p.position] = new Map();
      // Store: this player gives to left, across, right
      this.state.players[leftPos].hand.push(leftCard);
      this.state.players[acrossPos].hand.push(acrossCard);
      this.state.players[rightPos].hand.push(rightCard);
    }

    // Sort hands
    for (const p of this.state.players) {
      p.hand = sortCards(p.hand);
    }

    // Find who has the Mahjong — they lead first
    this.state.phase = GamePhase.PLAYING;
    this.state.currentPlayer = this.findMahjongHolder();
  }

  private findMahjongHolder(): PlayerPosition {
    for (const p of this.state.players) {
      if (p.hand.some((c) => isSpecial(c, SpecialCardType.MAHJONG))) {
        return p.position;
      }
    }
    // Should never happen — Mahjong is always in someone's hand
    return 0;
  }

  /** Player calls Tichu (before playing their first card). */
  callTichu(position: PlayerPosition): GameEvent[] {
    this.events = [];
    const player = this.state.players[position];

    if (player.tichuCall !== 'none') {
      throw new Error('Already called Tichu or Grand Tichu');
    }
    if (player.hasPlayedCards) {
      throw new Error('Cannot call Tichu after playing cards');
    }
    if (this.state.phase !== GamePhase.PLAYING && this.state.phase !== GamePhase.PASSING) {
      throw new Error('Cannot call Tichu in this phase');
    }

    player.tichuCall = 'tichu';
    this.emit({ type: 'TICHU_CALL', playerPosition: position });

    return this.events;
  }

  /** Player plays cards. */
  playCards(position: PlayerPosition, cardIds: string[]): GameEvent[] {
    this.events = [];
    this.assertPhase(GamePhase.PLAYING);

    if (this.state.dogPending) {
      throw new Error('Waiting for Dog to resolve');
    }

    if (this.state.wishPending !== null) {
      throw new Error('Waiting for Mahjong wish to be made');
    }

    if (this.state.currentPlayer !== position) {
      throw new Error('Not your turn');
    }

    const player = this.state.players[position];

    // Validate cards are in hand
    const cards: Card[] = [];
    for (const id of cardIds) {
      const card = player.hand.find((c) => c.id === id);
      if (!card) throw new Error(`Card ${id} not in hand`);
      cards.push(card);
    }

    // Detect combination
    const combination = detectCombination(cards);
    if (!combination) {
      throw new Error('Cards do not form a valid combination');
    }

    // Handle Dog: can only be led (not played on a trick)
    if (cards.length === 1 && isSpecial(cards[0], SpecialCardType.DOG)) {
      if (this.state.currentTrick.plays.length > 0) {
        throw new Error('Dog can only be led');
      }
      // Dog passes lead to partner — but keep it visible for a delay
      this.removeCardsFromHand(player, cardIds);
      player.hasPlayedCards = true;

      this.emit({ type: 'PLAY', playerPosition: position, data: { combination } });

      // Add to trick so it's visible on table
      this.state.currentTrick.plays.push({
        playerPosition: position,
        combination,
      });
      this.state.dogPending = true;

      this.checkPlayerOut(player);
      return this.events;
    }

    // If there's a current trick, the combination must beat it
    if (this.state.currentTrick.plays.length > 0) {
      const topPlay = this.state.currentTrick.plays[this.state.currentTrick.plays.length - 1];

      // Adjust Phoenix single rank
      if (
        combination.type === CombinationType.SINGLE &&
        cards[0].type === 'special' &&
        (cards[0] as any).specialType === SpecialCardType.PHOENIX
      ) {
        combination.rank = getPhoenixSingleRank(topPlay.combination.rank);
      }

      if (!canBeat(topPlay.combination, combination)) {
        throw new Error('Combination does not beat current trick');
      }
    }

    // Server-side wish enforcement: if wish is active, validate the player respects it
    if (this.state.wish.active && this.state.wish.wishedRank !== null) {
      const currentTop = this.state.currentTrick.plays.length > 0
        ? this.state.currentTrick.plays[this.state.currentTrick.plays.length - 1].combination
        : null;
      const playableWithWish = findPlayableFromHand(player.hand, currentTop, this.state.wish);
      const mustPlayWish = playableWithWish.length > 0 &&
        playableWithWish.every((combo) =>
          combo.some((c) => c.type === 'normal' && c.rank === this.state.wish.wishedRank)
        );
      if (mustPlayWish) {
        const hasWishedRank = cards.some(
          (c) => c.type === 'normal' && c.rank === this.state.wish.wishedRank
        );
        if (!hasWishedRank) {
          throw new Error('You must play a combination containing the wished rank');
        }
      }
    }

    // Remove cards from hand
    this.removeCardsFromHand(player, cardIds);
    player.hasPlayedCards = true;

    // Add play to trick
    this.state.currentTrick.plays.push({
      playerPosition: position,
      combination,
    });
    this.state.currentTrick.currentWinner = position;
    this.state.currentTrick.passCount = 0;
    this.state.currentTrick.passedPlayers = [];

    const isBomb =
      combination.type === CombinationType.FOUR_OF_A_KIND_BOMB ||
      combination.type === CombinationType.STRAIGHT_FLUSH_BOMB;

    this.emit({
      type: isBomb ? 'BOMB' : 'PLAY',
      playerPosition: position,
      data: { combination },
    });

    // Cancel wish if the played rank is higher than the wished rank (no one can fulfill it now)
    if (this.state.wish.active && this.state.wish.wishedRank !== null && !isBomb) {
      const wishedRank = this.state.wish.wishedRank;
      // Check if the wish was fulfilled by this play
      const wishFulfilled = cards.some(
        (c) => c.type === 'normal' && c.rank === wishedRank
      );
      if (wishFulfilled) {
        this.state.wish = { active: false, wishedRank: null, wishedBy: null };
        this.emit({ type: 'WISH_FULFILLED' });
      } else if (combination.rank > wishedRank) {
        // The played card is higher than the wish — next player must beat this,
        // so they can't play the wished rank anymore. Cancel the wish.
        this.state.wish = { active: false, wishedRank: null, wishedBy: null };
        this.emit({ type: 'WISH_FULFILLED' });
      }
    }

    // If the Mahjong was played, block play until the wish is made
    if (cards.some((c) => isSpecial(c, SpecialCardType.MAHJONG))) {
      this.state.wishPending = position;
    }

    this.checkPlayerOut(player);

    // Move to next active player
    this.state.currentPlayer = this.getNextActivePlayer(position);

    return this.events;
  }

  /** Set the Mahjong wish after playing the Mahjong. */
  setWish(position: PlayerPosition, rank: NormalRank): GameEvent[] {
    this.events = [];

    // Validate the last play included the Mahjong by this player
    const lastPlay = this.state.currentTrick.plays[this.state.currentTrick.plays.length - 1];
    if (!lastPlay || lastPlay.playerPosition !== position) {
      throw new Error('Not your play');
    }
    if (!lastPlay.combination.cards.some((c) => isSpecial(c, SpecialCardType.MAHJONG))) {
      throw new Error('Mahjong was not played');
    }

    this.state.wish = { active: true, wishedRank: rank, wishedBy: position };
    this.state.wishPending = null;
    this.emit({ type: 'WISH_MADE', playerPosition: position, data: { rank } });

    return this.events;
  }

  /** Player passes their turn. */
  passTurn(position: PlayerPosition): GameEvent[] {
    this.events = [];
    this.assertPhase(GamePhase.PLAYING);

    if (this.state.dogPending) {
      throw new Error('Waiting for Dog to resolve');
    }

    if (this.state.wishPending !== null) {
      throw new Error('Waiting for Mahjong wish to be made');
    }

    if (this.state.currentPlayer !== position) {
      throw new Error('Not your turn');
    }

    // Cannot pass when leading (trick is empty)
    if (this.state.currentTrick.plays.length === 0) {
      throw new Error('Cannot pass when leading');
    }

    // Cannot pass when wish is active and player can play the wished rank
    if (this.state.wish.active && this.state.wish.wishedRank !== null) {
      const player = this.state.players[position];
      const currentTop = this.state.currentTrick.plays[this.state.currentTrick.plays.length - 1].combination;
      const playable = findPlayableFromHand(player.hand, currentTop, this.state.wish);
      const mustPlayWish = playable.length > 0 &&
        playable.some((combo) =>
          combo.some((c) => c.type === 'normal' && c.rank === this.state.wish.wishedRank)
        );
      if (mustPlayWish) {
        throw new Error('You must play a combination containing the wished rank');
      }
    }

    this.state.currentTrick.passCount++;
    this.state.currentTrick.passedPlayers.push(position);
    this.emit({ type: 'PASS', playerPosition: position });

    // Check if trick is won (all other active players passed)
    const activePlayers = this.state.players.filter((p) => !p.isOut).length;
    if (this.state.currentTrick.passCount >= activePlayers - 1) {
      this.resolveTrick();
    } else {
      this.state.currentPlayer = this.getNextActivePlayer(position);
    }

    return this.events;
  }

  /** Resolve Dog after visual delay — clear trick, pass lead to partner. */
  resolveDog(): GameEvent[] {
    this.events = [];
    if (!this.state.dogPending) return this.events;

    // Find who played the Dog (last play in the trick)
    const dogPlay = this.state.currentTrick.plays[this.state.currentTrick.plays.length - 1];
    const position = dogPlay.playerPosition;

    // Clear the trick
    this.state.currentTrick = { plays: [], currentWinner: null, passCount: 0, passedPlayers: [] };
    this.state.dogPending = false;

    // Lead goes to partner
    const partner = getPartner(position);
    if (this.state.players[partner].isOut) {
      this.state.currentPlayer = this.getNextActivePlayer(partner);
    } else {
      this.state.currentPlayer = partner;
    }

    return this.events;
  }

  /** Player gives Dragon trick to an opponent. */
  dragonGive(position: PlayerPosition, opponentPos: PlayerPosition): GameEvent[] {
    this.events = [];
    this.assertPhase(GamePhase.DRAGON_GIVE);

    if (this.state.dragonWinner !== position) {
      throw new Error('Not the Dragon trick winner');
    }
    if (sameTeam(position, opponentPos)) {
      throw new Error('Must give Dragon trick to an opponent');
    }

    // Give all trick cards to the opponent's won tricks
    const trickCards = this.state.currentTrick.plays.flatMap((p) => p.combination.cards);
    this.state.players[opponentPos].wonTricks.push(trickCards);

    this.emit({
      type: 'DRAGON_GIVEN',
      playerPosition: position,
      data: { to: opponentPos },
    });

    // Clear trick and continue
    this.state.currentTrick = { plays: [], currentWinner: null, passCount: 0, passedPlayers: [] };
    this.state.dragonWinner = null;
    this.state.phase = GamePhase.PLAYING;

    // Winner leads next trick (or next active player if winner is out)
    if (this.state.players[position].isOut) {
      this.state.currentPlayer = this.getNextActivePlayer(position);
    } else {
      this.state.currentPlayer = position;
    }

    this.checkRoundEnd();

    return this.events;
  }

  /** Advance to next round after scoring. */
  nextRound(): GameEvent[] {
    this.events = [];
    this.assertPhase(GamePhase.ROUND_SCORING);

    // Check if game is over
    if (this.state.scores[0] >= this.targetScore || this.state.scores[1] >= this.targetScore) {
      this.state.phase = GamePhase.GAME_OVER;
      this.emit({ type: 'GAME_OVER' });
      return this.events;
    }

    return this.startRound();
  }

  // ─── Private Helpers ──────────────────────────────────────────────────

  private resolveTrick(): void {
    const winner = this.state.currentTrick.currentWinner!;
    const trickCards = this.state.currentTrick.plays.flatMap(
      (p) => p.combination.cards
    );

    this.emit({ type: 'TRICK_WON', playerPosition: winner });

    // Check if the trick contains the Dragon
    const hasDragonInTrick = trickCards.some((c) =>
      isSpecial(c, SpecialCardType.DRAGON)
    );

    if (hasDragonInTrick) {
      // Enter Dragon Give phase
      this.state.phase = GamePhase.DRAGON_GIVE;
      this.state.dragonWinner = winner;
      return;
    }

    // Clear wish when the trick ends — it only lasts for the trick it was made in
    if (this.state.wish.active) {
      this.state.wish = { active: false, wishedRank: null, wishedBy: null };
      this.emit({ type: 'WISH_FULFILLED' });
    }

    // Winner collects trick cards
    this.state.players[winner].wonTricks.push(trickCards);

    // Start new trick
    this.state.currentTrick = { plays: [], currentWinner: null, passCount: 0, passedPlayers: [] };

    // Winner leads next trick (or next active if out)
    if (this.state.players[winner].isOut) {
      this.state.currentPlayer = this.getNextActivePlayer(winner);
    } else {
      this.state.currentPlayer = winner;
    }

    this.checkRoundEnd();
  }

  private checkPlayerOut(player: PlayerState): void {
    if (player.hand.length === 0 && !player.isOut) {
      player.isOut = true;
      this.state.finishOrder.push(player.position);
      player.finishOrder = this.state.finishOrder.length;

      this.emit({
        type: 'PLAYER_OUT',
        playerPosition: player.position,
        data: { place: player.finishOrder },
      });

      // Check for 1-2 double victory (same team finishes 1st and 2nd)
      this.checkRoundEnd();
    }
  }

  private checkRoundEnd(): void {
    if (this.state.phase === GamePhase.ROUND_SCORING) return;

    const outCount = this.state.players.filter((p) => p.isOut).length;

    // 1-2 double victory: same team finishes 1st and 2nd
    if (
      outCount >= 2 &&
      this.state.finishOrder.length >= 2 &&
      sameTeam(this.state.finishOrder[0], this.state.finishOrder[1])
    ) {
      this.scoreRound();
      return;
    }

    // Normal: round ends when 3 of 4 players are out
    if (outCount < 3) return;
    this.scoreRound();
  }

  private scoreRound(): void {
    // Resolve any unfinished trick on the table — award to the current winner
    if (this.state.currentTrick.plays.length > 0 && this.state.currentTrick.currentWinner !== null) {
      const trickCards = this.state.currentTrick.plays.flatMap((p) => p.combination.cards);
      const winner = this.state.currentTrick.currentWinner;
      this.state.players[winner].wonTricks.push(trickCards);
      this.state.currentTrick = { plays: [], currentWinner: null, passCount: 0, passedPlayers: [] };
    }

    // Mark all remaining players as out
    const remainingPlayers = this.state.players.filter((p) => !p.isOut);
    for (const p of remainingPlayers) {
      p.isOut = true;
      this.state.finishOrder.push(p.position);
      p.finishOrder = this.state.finishOrder.length;
    }

    // Last player in finish order (for scoring)
    const lastPos = this.state.finishOrder[this.state.finishOrder.length - 1];
    const lastPlayer = this.state.players[lastPos];

    // Collect trick points per team
    const teamTricks: [Card[], Card[]] = [[], []];
    for (const p of this.state.players) {
      const team = getTeam(p.position);
      for (const trick of p.wonTricks) {
        teamTricks[team].push(...trick);
      }
    }

    const tichuCalls: Record<PlayerPosition, TichuCall> = {
      0: this.state.players[0].tichuCall,
      1: this.state.players[1].tichuCall,
      2: this.state.players[2].tichuCall,
      3: this.state.players[3].tichuCall,
    };

    const result = calculateRoundScore({
      finishOrder: this.state.finishOrder as PlayerPosition[],
      trickPoints: teamTricks,
      lastPlayerHand: lastPlayer.hand,
      tichuCalls,
    });

    // Include last player's hand in the opposing team's trick cards for display
    if (!sameTeam(this.state.finishOrder[0], this.state.finishOrder[1])) {
      const lastTeam = getTeam(lastPos);
      const opposingTeam = lastTeam === 0 ? 1 : 0;
      teamTricks[opposingTeam].push(...lastPlayer.hand);
    }
    this.roundTrickCards = teamTricks;
    this.roundBreakdown = result.breakdown;
    this.state.roundScores = result.totalRound;
    this.state.scores[0] += result.totalRound[0];
    this.state.scores[1] += result.totalRound[1];

    // Record round history
    this.roundHistory.push({
      round: this.roundHistory.length + 1,
      teamScores: [...result.totalRound] as [number, number],
      runningTotals: [...this.state.scores] as [number, number],
      doubleVictory: result.breakdown.doubleVictory,
      tichuResults: result.breakdown.tichuResults.map((t) => ({
        position: t.position,
        call: t.call,
        success: t.success,
        team: t.team,
      })),
    });

    this.state.phase = GamePhase.ROUND_SCORING;
    this.emit({
      type: 'ROUND_END',
      data: {
        roundScores: result.totalRound,
        totalScores: [...this.state.scores],
      },
    });
  }

  getNextActivePlayer(from: PlayerPosition): PlayerPosition {
    for (let i = 1; i <= 3; i++) {
      const pos = ((from + i) % 4) as PlayerPosition;
      if (!this.state.players[pos].isOut) return pos;
    }
    return from; // shouldn't happen
  }

  private removeCardsFromHand(player: PlayerState, cardIds: string[]): void {
    const idSet = new Set(cardIds);
    player.hand = player.hand.filter((c) => !idSet.has(c.id));
  }

  private assertPhase(expected: GamePhase): void {
    if (this.state.phase !== expected) {
      throw new Error(`Expected phase ${expected}, got ${this.state.phase}`);
    }
  }

  private emit(event: GameEvent): void {
    this.events.push(event);
  }

  /** Get the game state as seen by a specific player. */
  /** Serialize the full engine state for persistence. */
  serialize(): string {
    return JSON.stringify({
      state: this.state,
      targetScore: this.targetScore,
      roundTrickCards: this.roundTrickCards,
      roundBreakdown: this.roundBreakdown,
      roundHistory: this.roundHistory,
    });
  }

  /** Restore a GameEngine from a serialized snapshot. */
  static restore(json: string): GameEngine {
    const data = JSON.parse(json);
    const nicknames = data.state.players.map((p: PlayerState) => p.nickname) as [string, string, string, string];
    const engine = new GameEngine(nicknames, data.targetScore);
    engine.state = data.state;
    engine.roundTrickCards = data.roundTrickCards ?? [[], []];
    engine.roundBreakdown = data.roundBreakdown ?? null;
    engine.roundHistory = data.roundHistory ?? [];
    return engine;
  }

  getClientState(position: PlayerPosition, roomCode: string, botPositions?: Set<PlayerPosition>, avatars?: Map<PlayerPosition, string>, disconnected?: Set<PlayerPosition>): ClientGameState {
    const player = this.state.players[position];
    const iAmOut = player.isOut;
    return {
      roomCode,
      phase: this.state.phase,
      myPosition: position,
      myHand: player.hand,
      players: this.state.players.map((p) => ({
        position: p.position,
        nickname: p.nickname,
        cardCount: p.hand.length,
        collectedCards: p.wonTricks.reduce((sum, t) => sum + t.length, 0),
        hasPassed: p.passedCards !== null,
        tichuCall: p.tichuCall,
        isOut: p.isOut,
        finishOrder: p.finishOrder,
        // Reveal bot hands to the human player once they've finished
        hand: iAmOut && botPositions?.has(p.position) && !p.isOut ? p.hand : undefined,
        avatar: avatars?.get(p.position as PlayerPosition),
        connected: disconnected?.has(p.position as PlayerPosition) ? false : true,
      })) as PublicPlayerState[],
      currentPlayer: this.state.currentPlayer,
      currentTrick: this.state.currentTrick,
      wish: this.state.wish,
      finishOrder: this.state.finishOrder as PlayerPosition[],
      scores: this.state.scores,
      roundScores: this.state.roundScores,
      targetScore: this.targetScore,
      roundTrickCards:
        this.state.phase === GamePhase.ROUND_SCORING || this.state.phase === GamePhase.GAME_OVER
          ? this.roundTrickCards
          : undefined,
      roundBreakdown:
        this.state.phase === GamePhase.ROUND_SCORING || this.state.phase === GamePhase.GAME_OVER
          ? this.roundBreakdown ?? undefined
          : undefined,
      grandTichuPending:
        this.state.phase === GamePhase.GRAND_TICHU && !player.grandTichuDecided,
      hasPlayedCards: player.hasPlayedCards,
      wishPending: this.state.wishPending,
      dogPending: this.state.dogPending || undefined,
      roundHistory: this.roundHistory.length > 0 ? this.roundHistory : undefined,
    };
  }
}
