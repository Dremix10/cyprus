import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine, type PlayerState } from '../GameEngine.js';
import {
  GamePhase,
  SpecialCardType,
  CombinationType,
  Suit,
  NormalRank,
  FULL_DECK,
  sortCards,
  detectCombination,
  getTeam,
  sameTeam,
  WINNING_SCORE,
} from '@cyprus/shared';
import type { Card, NormalCard, SpecialCard, PlayerPosition } from '@cyprus/shared';

// ─── Helpers ──────────────────────────────────────────────────────────

function nc(suit: Suit, rank: NormalRank): NormalCard {
  return { type: 'normal', suit, rank, id: `${suit}_${rank}` };
}

function sc(specialType: SpecialCardType): SpecialCard {
  return { type: 'special', specialType, id: specialType };
}

function isSpecialCard(card: Card, type: SpecialCardType): boolean {
  return card.type === 'special' && card.specialType === type;
}

function findCardId(hand: Card[], predicate: (c: Card) => boolean): string {
  const card = hand.find(predicate);
  if (!card) throw new Error('Card not found in hand');
  return card.id;
}

/** Advance engine through Grand Tichu (all pass) + Card Passing to PLAYING phase. */
function advanceToPlaying(engine: GameEngine): void {
  engine.startRound();
  for (let i = 0; i < 4; i++) {
    engine.grandTichuDecision(i as PlayerPosition, false);
  }
  for (let i = 0; i < 4; i++) {
    const hand = engine.state.players[i].hand;
    engine.passCards(i as PlayerPosition, {
      left: hand[0].id,
      across: hand[1].id,
      right: hand[2].id,
    });
  }
}

/**
 * Build a controlled hand and inject it directly into engine state.
 * This lets us test specific card interactions deterministically.
 */
function setPlayerHand(engine: GameEngine, position: PlayerPosition, cards: Card[]): void {
  engine.state.players[position].hand = sortCards(cards);
}

/**
 * Inject a fully controlled deal. All 4 players get exactly the cards specified.
 * Engine must already be in PLAYING phase (or we skip phase checks).
 */
function setupControlledPlaying(engine: GameEngine, hands: [Card[], Card[], Card[], Card[]]): void {
  engine.state.phase = GamePhase.PLAYING;
  for (let i = 0; i < 4; i++) {
    const p = engine.state.players[i];
    p.hand = sortCards(hands[i]);
    p.isOut = false;
    p.finishOrder = null;
    p.hasPlayedCards = false;
    p.tichuCall = 'none';
    p.passedCards = null;
    p.wonTricks = [];
    p.grandTichuDecided = true;
  }
  engine.state.currentTrick = { plays: [], currentWinner: null, passCount: 0, passedPlayers: [] };
  engine.state.finishOrder = [];
  engine.state.wish = { active: false, wishedRank: null, wishedBy: null };
  engine.state.wishPending = null;
  engine.state.dogPending = false;
  engine.state.trickWonPending = false;
  engine.state.roundEndPending = false;
  engine.state.dragonWinner = null;
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('GameEngine', () => {
  let engine: GameEngine;

  beforeEach(() => {
    engine = new GameEngine(['Alice', 'Bob', 'Carol', 'Dave']);
  });

  // ─── 1. Game Initialization ──────────────────────────────────────────

  describe('game initialization', () => {
    it('creates 4 players with correct nicknames', () => {
      expect(engine.state.players.length).toBe(4);
      expect(engine.state.players[0].nickname).toBe('Alice');
      expect(engine.state.players[1].nickname).toBe('Bob');
      expect(engine.state.players[2].nickname).toBe('Carol');
      expect(engine.state.players[3].nickname).toBe('Dave');
    });

    it('starts in WAITING phase', () => {
      expect(engine.state.phase).toBe(GamePhase.WAITING);
    });

    it('initializes scores to [0, 0]', () => {
      expect(engine.state.scores).toEqual([0, 0]);
    });

    it('positions are 0 through 3', () => {
      for (let i = 0; i < 4; i++) {
        expect(engine.state.players[i].position).toBe(i);
      }
    });

    it('uses default winning score (WINNING_SCORE) when not specified', () => {
      engine.state.phase = GamePhase.ROUND_SCORING;
      engine.state.scores = [WINNING_SCORE, 0];
      const events = engine.nextRound();
      expect(engine.state.phase).toBe(GamePhase.GAME_OVER);
    });

    it('uses custom target score when provided', () => {
      const customEngine = new GameEngine(['A', 'B', 'C', 'D'], 500);
      customEngine.state.phase = GamePhase.ROUND_SCORING;
      customEngine.state.scores = [500, 0];
      customEngine.nextRound();
      expect(customEngine.state.phase).toBe(GamePhase.GAME_OVER);
    });
  });

  // ─── 2. startRound ──────────────────────────────────────────────────

  describe('startRound', () => {
    it('deals 8 cards to each player and enters GRAND_TICHU phase', () => {
      engine.startRound();
      expect(engine.state.phase).toBe(GamePhase.GRAND_TICHU);
      for (const p of engine.state.players) {
        expect(p.hand.length).toBe(8);
        expect(p.grandTichuDecided).toBe(false);
        expect(p.isOut).toBe(false);
        expect(p.tichuCall).toBe('none');
        expect(p.hasPlayedCards).toBe(false);
        expect(p.passedCards).toBeNull();
        expect(p.wonTricks).toEqual([]);
      }
    });

    it('resets trick state on new round', () => {
      engine.startRound();
      expect(engine.state.currentTrick.plays).toEqual([]);
      expect(engine.state.currentTrick.currentWinner).toBeNull();
      expect(engine.state.finishOrder).toEqual([]);
      expect(engine.state.roundScores).toEqual([0, 0]);
    });

    it('deals all 56 unique cards across all players', () => {
      engine.startRound();
      // 8 initial cards * 4 = 32 cards visible, remaining 24 are held internally
      const allInitialIds = engine.state.players.flatMap((p) => p.hand.map((c) => c.id));
      const uniqueIds = new Set(allInitialIds);
      expect(uniqueIds.size).toBe(32);
    });
  });

  // ─── 3. Grand Tichu Phase ───────────────────────────────────────────

  describe('grandTichuDecision', () => {
    beforeEach(() => engine.startRound());

    it('all players pass Grand Tichu -> transitions to PASSING with 14 cards each', () => {
      for (let i = 0; i < 4; i++) {
        engine.grandTichuDecision(i as PlayerPosition, false);
      }
      expect(engine.state.phase).toBe(GamePhase.PASSING);
      for (const p of engine.state.players) {
        expect(p.hand.length).toBe(14);
      }
    });

    it('records Grand Tichu call and emits event', () => {
      const events = engine.grandTichuDecision(0, true);
      expect(engine.state.players[0].tichuCall).toBe('grand_tichu');
      expect(events.some((e) => e.type === 'GRAND_TICHU_CALL')).toBe(true);
    });

    it('does not transition after only 3 decisions', () => {
      for (let i = 0; i < 3; i++) {
        engine.grandTichuDecision(i as PlayerPosition, false);
      }
      expect(engine.state.phase).toBe(GamePhase.GRAND_TICHU);
      // First 3 players still have only 8 cards
      for (let i = 0; i < 3; i++) {
        expect(engine.state.players[i].hand.length).toBe(8);
      }
    });

    it('throws if player already decided', () => {
      engine.grandTichuDecision(0, false);
      expect(() => engine.grandTichuDecision(0, false)).toThrow('Already decided');
    });

    it('throws if called in wrong phase', () => {
      // Advance to PASSING
      for (let i = 0; i < 4; i++) {
        engine.grandTichuDecision(i as PlayerPosition, false);
      }
      expect(() => engine.grandTichuDecision(0, false)).toThrow('Expected phase');
    });

    it('multiple players can call Grand Tichu', () => {
      engine.grandTichuDecision(0, true);
      engine.grandTichuDecision(1, true);
      engine.grandTichuDecision(2, false);
      engine.grandTichuDecision(3, false);
      expect(engine.state.players[0].tichuCall).toBe('grand_tichu');
      expect(engine.state.players[1].tichuCall).toBe('grand_tichu');
      expect(engine.state.players[2].tichuCall).toBe('none');
      expect(engine.state.phase).toBe(GamePhase.PASSING);
    });
  });

  // ─── 4. Card Passing ────────────────────────────────────────────────

  describe('passCards', () => {
    beforeEach(() => {
      engine.startRound();
      for (let i = 0; i < 4; i++) {
        engine.grandTichuDecision(i as PlayerPosition, false);
      }
    });

    it('transitions to PLAYING after all 4 players pass cards', () => {
      for (let i = 0; i < 4; i++) {
        const hand = engine.state.players[i].hand;
        engine.passCards(i as PlayerPosition, {
          left: hand[0].id,
          across: hand[1].id,
          right: hand[2].id,
        });
      }
      expect(engine.state.phase).toBe(GamePhase.PLAYING);
      for (const p of engine.state.players) {
        expect(p.hand.length).toBe(14);
      }
    });

    it('does not transition after only some players pass', () => {
      const hand = engine.state.players[0].hand;
      engine.passCards(0, {
        left: hand[0].id,
        across: hand[1].id,
        right: hand[2].id,
      });
      expect(engine.state.phase).toBe(GamePhase.PASSING);
    });

    it('rejects duplicate card IDs', () => {
      const hand = engine.state.players[0].hand;
      expect(() =>
        engine.passCards(0, {
          left: hand[0].id,
          across: hand[0].id,
          right: hand[1].id,
        })
      ).toThrow('3 different cards');
    });

    it('rejects cards not in hand', () => {
      expect(() =>
        engine.passCards(0, {
          left: 'fake_card',
          across: engine.state.players[0].hand[0].id,
          right: engine.state.players[0].hand[1].id,
        })
      ).toThrow('not in hand');
    });

    it('allows re-passing (changing card selection)', () => {
      const hand = engine.state.players[0].hand;
      engine.passCards(0, {
        left: hand[0].id,
        across: hand[1].id,
        right: hand[2].id,
      });
      // Re-submit with different cards — should succeed
      engine.passCards(0, {
        left: hand[3].id,
        across: hand[4].id,
        right: hand[5].id,
      });
      expect(engine.state.players[0].passedCards).toEqual({
        left: hand[3].id,
        across: hand[4].id,
        right: hand[5].id,
      });
    });

    it('allows undoing pass and re-selecting', () => {
      const hand = engine.state.players[0].hand;
      engine.passCards(0, {
        left: hand[0].id,
        across: hand[1].id,
        right: hand[2].id,
      });
      expect(engine.state.players[0].passedCards).not.toBeNull();
      engine.undoPassCards(0);
      expect(engine.state.players[0].passedCards).toBeNull();
    });

    it('cards are actually transferred to correct recipients', () => {
      // Record what player 0 passes
      const hand0 = engine.state.players[0].hand;
      const leftCardId = hand0[0].id;
      const acrossCardId = hand0[1].id;
      const rightCardId = hand0[2].id;

      // Player 0's left is position 3 (position + 3) % 4
      // Player 0's across is position 2
      // Player 0's right is position 1
      for (let i = 0; i < 4; i++) {
        const hand = engine.state.players[i].hand;
        engine.passCards(i as PlayerPosition, {
          left: hand[0].id,
          across: hand[1].id,
          right: hand[2].id,
        });
      }

      // Player 3 should have received leftCardId from player 0
      expect(engine.state.players[3].hand.some((c) => c.id === leftCardId)).toBe(true);
      // Player 2 should have received acrossCardId from player 0
      expect(engine.state.players[2].hand.some((c) => c.id === acrossCardId)).toBe(true);
      // Player 1 should have received rightCardId from player 0
      expect(engine.state.players[1].hand.some((c) => c.id === rightCardId)).toBe(true);
    });

    it('sets Mahjong holder as current player after passing', () => {
      advanceToPlaying(engine);
      const currentPlayer = engine.state.players[engine.state.currentPlayer];
      const hasMahjong = currentPlayer.hand.some((c) =>
        isSpecialCard(c, SpecialCardType.MAHJONG)
      );
      expect(hasMahjong).toBe(true);
    });

    it('tracks received cards per player', () => {
      for (let i = 0; i < 4; i++) {
        const hand = engine.state.players[i].hand;
        engine.passCards(i as PlayerPosition, {
          left: hand[0].id,
          across: hand[1].id,
          right: hand[2].id,
        });
      }
      // Each player should have received 3 cards (one from each other player)
      for (let i = 0; i < 4; i++) {
        expect(engine.state.receivedCards[i as PlayerPosition].length).toBe(3);
      }
    });
  });

  // ─── 5. Playing Cards ───────────────────────────────────────────────

  describe('playCards', () => {
    it('plays a single card and advances turn', () => {
      advanceToPlaying(engine);
      const pos = engine.state.currentPlayer;
      const hand = engine.state.players[pos].hand;

      const cardId = findCardId(
        hand,
        (c) => c.type === 'normal' || isSpecialCard(c, SpecialCardType.MAHJONG)
      );

      engine.playCards(pos, [cardId]);

      expect(engine.state.currentTrick.plays.length).toBe(1);
      expect(engine.state.currentPlayer).not.toBe(pos);
      expect(engine.state.players[pos].hand.length).toBe(13);
    });

    it('rejects plays from wrong player', () => {
      advanceToPlaying(engine);
      const wrongPlayer = ((engine.state.currentPlayer + 1) % 4) as PlayerPosition;
      const hand = engine.state.players[wrongPlayer].hand;
      expect(() => engine.playCards(wrongPlayer, [hand[0].id])).toThrow('Not your turn');
    });

    it('rejects cards not in hand', () => {
      advanceToPlaying(engine);
      const pos = engine.state.currentPlayer;
      expect(() => engine.playCards(pos, ['nonexistent_card'])).toThrow('Card not in hand');
    });

    it('rejects invalid combinations', () => {
      // Set up a hand with cards that do NOT form a valid combo together
      setupControlledPlaying(engine, [
        [nc(Suit.JADE, NormalRank.TWO), nc(Suit.JADE, NormalRank.FIVE), nc(Suit.STAR, NormalRank.KING)],
        [nc(Suit.JADE, NormalRank.THREE)],
        [nc(Suit.JADE, NormalRank.FOUR)],
        [nc(Suit.JADE, NormalRank.SIX)],
      ]);
      engine.state.currentPlayer = 0;

      // Two cards of different rank (without Phoenix) = invalid
      expect(() =>
        engine.playCards(0, [
          `${Suit.JADE}_${NormalRank.TWO}`,
          `${Suit.JADE}_${NormalRank.FIVE}`,
        ])
      ).toThrow('valid combination');
    });

    it('accepts a valid pair', () => {
      setupControlledPlaying(engine, [
        [nc(Suit.JADE, NormalRank.FIVE), nc(Suit.STAR, NormalRank.FIVE), nc(Suit.SWORD, NormalRank.ACE)],
        [nc(Suit.JADE, NormalRank.THREE)],
        [nc(Suit.JADE, NormalRank.FOUR)],
        [nc(Suit.JADE, NormalRank.SIX)],
      ]);
      engine.state.currentPlayer = 0;

      engine.playCards(0, [
        `${Suit.JADE}_${NormalRank.FIVE}`,
        `${Suit.STAR}_${NormalRank.FIVE}`,
      ]);

      expect(engine.state.currentTrick.plays.length).toBe(1);
      const combo = engine.state.currentTrick.plays[0].combination;
      expect(combo.type).toBe(CombinationType.PAIR);
      expect(combo.rank).toBe(NormalRank.FIVE);
    });

    it('accepts a valid straight (5 cards)', () => {
      const straightCards = [
        nc(Suit.JADE, NormalRank.THREE),
        nc(Suit.STAR, NormalRank.FOUR),
        nc(Suit.SWORD, NormalRank.FIVE),
        nc(Suit.PAGODA, NormalRank.SIX),
        nc(Suit.JADE, NormalRank.SEVEN),
      ];
      setupControlledPlaying(engine, [
        straightCards,
        [nc(Suit.JADE, NormalRank.TWO)],
        [nc(Suit.STAR, NormalRank.TWO)],
        [nc(Suit.SWORD, NormalRank.TWO)],
      ]);
      engine.state.currentPlayer = 0;

      engine.playCards(0, straightCards.map((c) => c.id));

      const combo = engine.state.currentTrick.plays[0].combination;
      expect(combo.type).toBe(CombinationType.STRAIGHT);
      expect(combo.rank).toBe(NormalRank.SEVEN);
      expect(combo.length).toBe(5);
    });

    it('rejects a play that cannot beat the current trick', () => {
      // Player 0 leads with a King, player 1 tries to play a 3
      setupControlledPlaying(engine, [
        [nc(Suit.JADE, NormalRank.KING), nc(Suit.STAR, NormalRank.ACE)],
        [nc(Suit.STAR, NormalRank.THREE), nc(Suit.PAGODA, NormalRank.TWO)],
        [nc(Suit.SWORD, NormalRank.FOUR)],
        [nc(Suit.JADE, NormalRank.SIX)],
      ]);
      engine.state.currentPlayer = 0;

      engine.playCards(0, [`${Suit.JADE}_${NormalRank.KING}`]);
      expect(engine.state.currentPlayer).toBe(1);

      expect(() =>
        engine.playCards(1, [`${Suit.STAR}_${NormalRank.THREE}`])
      ).toThrow('does not beat');
    });

    it('marks player as hasPlayedCards after first play', () => {
      advanceToPlaying(engine);
      const pos = engine.state.currentPlayer;
      expect(engine.state.players[pos].hasPlayedCards).toBe(false);

      const hand = engine.state.players[pos].hand;
      const cardId = findCardId(hand, (c) => c.type === 'normal');
      engine.playCards(pos, [cardId]);

      expect(engine.state.players[pos].hasPlayedCards).toBe(true);
    });
  });

  // ─── 6. Trick Resolution ───────────────────────────────────────────

  describe('trick resolution', () => {
    it('trick resolves via trickWonPending + completeTrickWon after all pass', () => {
      setupControlledPlaying(engine, [
        [nc(Suit.JADE, NormalRank.KING), nc(Suit.STAR, NormalRank.TWO)],
        [nc(Suit.JADE, NormalRank.THREE), nc(Suit.STAR, NormalRank.FOUR)],
        [nc(Suit.SWORD, NormalRank.FIVE), nc(Suit.PAGODA, NormalRank.SIX)],
        [nc(Suit.JADE, NormalRank.SEVEN), nc(Suit.STAR, NormalRank.EIGHT)],
      ]);
      engine.state.currentPlayer = 0;

      engine.playCards(0, [`${Suit.JADE}_${NormalRank.KING}`]);

      // Other 3 pass
      for (let i = 0; i < 3; i++) {
        engine.passTurn(engine.state.currentPlayer);
      }

      // The trick should be pending completion
      expect(engine.state.trickWonPending).toBe(true);
      expect(engine.state.currentTrick.plays.length).toBe(1);

      // Complete the trick
      engine.completeTrickWon();

      expect(engine.state.trickWonPending).toBe(false);
      expect(engine.state.currentTrick.plays.length).toBe(0);
      expect(engine.state.currentPlayer).toBe(0); // winner leads
      expect(engine.state.players[0].wonTricks.length).toBe(1);
    });

    it('higher card beats and wins the trick', () => {
      setupControlledPlaying(engine, [
        [nc(Suit.JADE, NormalRank.FIVE), nc(Suit.STAR, NormalRank.TWO)],
        [nc(Suit.JADE, NormalRank.KING), nc(Suit.STAR, NormalRank.FOUR)],
        [nc(Suit.SWORD, NormalRank.THREE), nc(Suit.PAGODA, NormalRank.SIX)],
        [nc(Suit.JADE, NormalRank.SEVEN), nc(Suit.STAR, NormalRank.EIGHT)],
      ]);
      engine.state.currentPlayer = 0;

      // Player 0 leads 5, player 1 plays King
      engine.playCards(0, [`${Suit.JADE}_${NormalRank.FIVE}`]);
      engine.playCards(1, [`${Suit.JADE}_${NormalRank.KING}`]);

      expect(engine.state.currentTrick.currentWinner).toBe(1);

      // Players 2 and 3 pass
      engine.passTurn(2);
      // After player 2 passes, back to player 3
      engine.passTurn(engine.state.currentPlayer);

      // Player 0 needs to pass too (already played, but passCount check)
      // Actually after 2 passes with currentWinner=1 (who played), passCount=2 but
      // activePlayers=4, so need activePlayers-1=3 passes total
      engine.passTurn(engine.state.currentPlayer);

      expect(engine.state.trickWonPending).toBe(true);
      engine.completeTrickWon();

      expect(engine.state.currentPlayer).toBe(1); // King-player wins
      expect(engine.state.players[1].wonTricks.length).toBe(1);
    });
  });

  // ─── 7. Passing Turn ───────────────────────────────────────────────

  describe('passTurn', () => {
    it('rejects passing when leading (empty trick)', () => {
      advanceToPlaying(engine);
      expect(() => engine.passTurn(engine.state.currentPlayer)).toThrow('Cannot pass when leading');
    });

    it('rejects passing from wrong player', () => {
      advanceToPlaying(engine);
      const pos = engine.state.currentPlayer;
      const hand = engine.state.players[pos].hand;
      const cardId = findCardId(hand, (c) => c.type === 'normal');
      engine.playCards(pos, [cardId]);

      const wrongPlayer = ((engine.state.currentPlayer + 1) % 4) as PlayerPosition;
      expect(() => engine.passTurn(wrongPlayer)).toThrow('Not your turn');
    });

    it('increments pass count and records passed player', () => {
      setupControlledPlaying(engine, [
        [nc(Suit.JADE, NormalRank.KING), nc(Suit.STAR, NormalRank.TWO)],
        [nc(Suit.JADE, NormalRank.THREE), nc(Suit.STAR, NormalRank.FOUR)],
        [nc(Suit.SWORD, NormalRank.FIVE), nc(Suit.PAGODA, NormalRank.SIX)],
        [nc(Suit.JADE, NormalRank.SEVEN), nc(Suit.STAR, NormalRank.EIGHT)],
      ]);
      engine.state.currentPlayer = 0;
      engine.playCards(0, [`${Suit.JADE}_${NormalRank.KING}`]);

      engine.passTurn(1);
      expect(engine.state.currentTrick.passCount).toBe(1);
      expect(engine.state.currentTrick.passedPlayers).toContain(1);
    });
  });

  // ─── 8. Dog Handling ────────────────────────────────────────────────

  describe('Dog', () => {
    it('Dog lead sets dogPending and passes lead to partner after resolveDog()', () => {
      setupControlledPlaying(engine, [
        [sc(SpecialCardType.DOG), nc(Suit.JADE, NormalRank.TWO)],
        [nc(Suit.JADE, NormalRank.THREE)],
        [nc(Suit.STAR, NormalRank.FOUR)],
        [nc(Suit.SWORD, NormalRank.FIVE)],
      ]);
      engine.state.currentPlayer = 0;

      engine.playCards(0, [SpecialCardType.DOG]);

      expect(engine.state.dogPending).toBe(true);
      // Dog is visible on the trick
      expect(engine.state.currentTrick.plays.length).toBe(1);

      // Resolve dog
      engine.resolveDog();

      expect(engine.state.dogPending).toBe(false);
      expect(engine.state.currentTrick.plays.length).toBe(0);
      // Partner of position 0 is position 2
      expect(engine.state.currentPlayer).toBe(2);
    });

    it('Dog cannot be played on an existing trick', () => {
      setupControlledPlaying(engine, [
        [nc(Suit.JADE, NormalRank.KING), nc(Suit.STAR, NormalRank.ACE)],
        [sc(SpecialCardType.DOG), nc(Suit.JADE, NormalRank.THREE)],
        [nc(Suit.SWORD, NormalRank.FIVE)],
        [nc(Suit.PAGODA, NormalRank.SIX)],
      ]);
      engine.state.currentPlayer = 0;
      engine.playCards(0, [`${Suit.JADE}_${NormalRank.KING}`]);

      // Player 1 tries to play Dog on existing trick
      expect(() => engine.playCards(1, [SpecialCardType.DOG])).toThrow('Dog can only be led');
    });

    it('Dog lead passes to next active player if partner is out', () => {
      setupControlledPlaying(engine, [
        [sc(SpecialCardType.DOG), nc(Suit.JADE, NormalRank.TWO)],
        [nc(Suit.JADE, NormalRank.THREE)],
        [nc(Suit.STAR, NormalRank.FOUR)],
        [nc(Suit.SWORD, NormalRank.FIVE)],
      ]);
      engine.state.currentPlayer = 0;
      // Mark partner (position 2) as out
      engine.state.players[2].isOut = true;
      engine.state.players[2].hand = [];

      engine.playCards(0, [SpecialCardType.DOG]);
      engine.resolveDog();

      // Partner is out, so should go to next active player after partner (pos 3)
      expect(engine.state.currentPlayer).toBe(3);
    });

    it('rejects other plays while dogPending is true', () => {
      setupControlledPlaying(engine, [
        [sc(SpecialCardType.DOG), nc(Suit.JADE, NormalRank.TWO)],
        [nc(Suit.JADE, NormalRank.THREE)],
        [nc(Suit.STAR, NormalRank.FOUR)],
        [nc(Suit.SWORD, NormalRank.FIVE)],
      ]);
      engine.state.currentPlayer = 0;
      engine.playCards(0, [SpecialCardType.DOG]);

      expect(engine.state.dogPending).toBe(true);
      expect(() => engine.playCards(2, [`${Suit.STAR}_${NormalRank.FOUR}`])).toThrow('Dog to resolve');
    });
  });

  // ─── 9. Tichu Calling ──────────────────────────────────────────────

  describe('callTichu', () => {
    it('allows calling Tichu in PASSING phase', () => {
      engine.startRound();
      for (let i = 0; i < 4; i++) {
        engine.grandTichuDecision(i as PlayerPosition, false);
      }

      const events = engine.callTichu(0);
      expect(engine.state.players[0].tichuCall).toBe('tichu');
      expect(events.some((e) => e.type === 'TICHU_CALL')).toBe(true);
    });

    it('allows calling Tichu in PLAYING phase before first play', () => {
      advanceToPlaying(engine);
      const pos = engine.state.currentPlayer;
      expect(engine.state.players[pos].hasPlayedCards).toBe(false);

      const events = engine.callTichu(pos);
      expect(engine.state.players[pos].tichuCall).toBe('tichu');
    });

    it('rejects Tichu if already called Grand Tichu', () => {
      engine = new GameEngine(['Alice', 'Bob', 'Carol', 'Dave']);
      engine.startRound();
      engine.grandTichuDecision(0, true);
      for (let i = 1; i < 4; i++) {
        engine.grandTichuDecision(i as PlayerPosition, false);
      }

      expect(() => engine.callTichu(0)).toThrow('Already called');
    });

    it('rejects Tichu after player has played cards', () => {
      advanceToPlaying(engine);
      const pos = engine.state.currentPlayer;
      const hand = engine.state.players[pos].hand;
      const cardId = findCardId(hand, (c) => c.type === 'normal');
      engine.playCards(pos, [cardId]);

      expect(() => engine.callTichu(pos)).toThrow('Cannot call Tichu after playing');
    });

    it('rejects Tichu in GRAND_TICHU phase', () => {
      engine.startRound();
      expect(() => engine.callTichu(0)).toThrow('Cannot call Tichu in this phase');
    });

    it('rejects double Tichu call', () => {
      advanceToPlaying(engine);
      const pos = engine.state.currentPlayer;
      engine.callTichu(pos);
      expect(() => engine.callTichu(pos)).toThrow('Already called');
    });
  });

  // ─── 10. Dragon Give ───────────────────────────────────────────────

  describe('dragonGive', () => {
    function setupDragonGive(engine: GameEngine): void {
      // Set up state where Dragon trick was just won and phase is DRAGON_GIVE
      setupControlledPlaying(engine, [
        [sc(SpecialCardType.DRAGON), nc(Suit.JADE, NormalRank.TWO)],
        [nc(Suit.JADE, NormalRank.THREE), nc(Suit.STAR, NormalRank.FOUR)],
        [nc(Suit.SWORD, NormalRank.FIVE), nc(Suit.PAGODA, NormalRank.SIX)],
        [nc(Suit.JADE, NormalRank.SEVEN), nc(Suit.STAR, NormalRank.EIGHT)],
      ]);
      engine.state.currentPlayer = 0;

      // Play Dragon
      engine.playCards(0, [SpecialCardType.DRAGON]);
      // All others pass
      engine.passTurn(1);
      engine.passTurn(2);
      engine.passTurn(3);

      // Now should be in DRAGON_GIVE phase
      expect(engine.state.phase).toBe(GamePhase.DRAGON_GIVE);
      expect(engine.state.dragonWinner).toBe(0);
    }

    it('gives trick cards to chosen opponent', () => {
      setupDragonGive(engine);

      // Player 0 gives to opponent player 1
      engine.dragonGive(0, 1);

      expect(engine.state.players[1].wonTricks.length).toBe(1);
      expect(engine.state.phase).toBe(GamePhase.PLAYING);
      expect(engine.state.dragonWinner).toBeNull();
    });

    it('rejects giving to teammate', () => {
      setupDragonGive(engine);

      // Position 0's teammate is position 2
      expect(() => engine.dragonGive(0, 2)).toThrow('Must give Dragon trick to an opponent');
    });

    it('rejects from non-winner', () => {
      setupDragonGive(engine);

      expect(() => engine.dragonGive(1, 3)).toThrow('Not the Dragon trick winner');
    });

    it('rejects invalid position', () => {
      setupDragonGive(engine);

      expect(() => engine.dragonGive(0, 5 as PlayerPosition)).toThrow('Invalid position');
    });

    it('rejects when not in DRAGON_GIVE phase', () => {
      advanceToPlaying(engine);
      expect(() => engine.dragonGive(0, 1)).toThrow('Expected phase');
    });
  });

  // ─── 11. Wish (Mahjong) ────────────────────────────────────────────

  describe('setWish', () => {
    it('sets wish after playing Mahjong', () => {
      setupControlledPlaying(engine, [
        [sc(SpecialCardType.MAHJONG), nc(Suit.JADE, NormalRank.TWO)],
        [nc(Suit.JADE, NormalRank.THREE), nc(Suit.STAR, NormalRank.FOUR)],
        [nc(Suit.SWORD, NormalRank.FIVE), nc(Suit.PAGODA, NormalRank.SIX)],
        [nc(Suit.JADE, NormalRank.SEVEN), nc(Suit.STAR, NormalRank.EIGHT)],
      ]);
      engine.state.currentPlayer = 0;

      // Play Mahjong
      engine.playCards(0, [SpecialCardType.MAHJONG]);

      expect(engine.state.wishPending).toBe(0);

      // Set wish
      const events = engine.setWish(0, NormalRank.ACE);

      expect(engine.state.wish.active).toBe(true);
      expect(engine.state.wish.wishedRank).toBe(NormalRank.ACE);
      expect(engine.state.wishPending).toBeNull();
      expect(events.some((e) => e.type === 'WISH_MADE')).toBe(true);
    });

    it('rejects invalid wish rank (1)', () => {
      setupControlledPlaying(engine, [
        [sc(SpecialCardType.MAHJONG), nc(Suit.JADE, NormalRank.TWO)],
        [nc(Suit.JADE, NormalRank.THREE)],
        [nc(Suit.SWORD, NormalRank.FIVE)],
        [nc(Suit.JADE, NormalRank.SEVEN)],
      ]);
      engine.state.currentPlayer = 0;
      engine.playCards(0, [SpecialCardType.MAHJONG]);

      expect(() => engine.setWish(0, 1 as NormalRank)).toThrow('Invalid wish rank');
    });

    it('rejects invalid wish rank (15)', () => {
      setupControlledPlaying(engine, [
        [sc(SpecialCardType.MAHJONG), nc(Suit.JADE, NormalRank.TWO)],
        [nc(Suit.JADE, NormalRank.THREE)],
        [nc(Suit.SWORD, NormalRank.FIVE)],
        [nc(Suit.JADE, NormalRank.SEVEN)],
      ]);
      engine.state.currentPlayer = 0;
      engine.playCards(0, [SpecialCardType.MAHJONG]);

      expect(() => engine.setWish(0, 15 as NormalRank)).toThrow('Invalid wish rank');
    });

    it('rejects invalid wish rank (0)', () => {
      setupControlledPlaying(engine, [
        [sc(SpecialCardType.MAHJONG), nc(Suit.JADE, NormalRank.TWO)],
        [nc(Suit.JADE, NormalRank.THREE)],
        [nc(Suit.SWORD, NormalRank.FIVE)],
        [nc(Suit.JADE, NormalRank.SEVEN)],
      ]);
      engine.state.currentPlayer = 0;
      engine.playCards(0, [SpecialCardType.MAHJONG]);

      expect(() => engine.setWish(0, 0 as NormalRank)).toThrow('Invalid wish rank');
    });

    it('accepts all valid wish ranks (2-14)', () => {
      for (let rank = 2; rank <= 14; rank++) {
        const eng = new GameEngine(['A', 'B', 'C', 'D']);
        setupControlledPlaying(eng, [
          [sc(SpecialCardType.MAHJONG), nc(Suit.JADE, NormalRank.TWO)],
          [nc(Suit.JADE, NormalRank.THREE)],
          [nc(Suit.SWORD, NormalRank.FIVE)],
          [nc(Suit.JADE, NormalRank.SEVEN)],
        ]);
        eng.state.currentPlayer = 0;
        eng.playCards(0, [SpecialCardType.MAHJONG]);
        expect(() => eng.setWish(0, rank as NormalRank)).not.toThrow();
      }
    });

    it('rejects wish from wrong player', () => {
      setupControlledPlaying(engine, [
        [sc(SpecialCardType.MAHJONG), nc(Suit.JADE, NormalRank.TWO)],
        [nc(Suit.JADE, NormalRank.THREE)],
        [nc(Suit.SWORD, NormalRank.FIVE)],
        [nc(Suit.JADE, NormalRank.SEVEN)],
      ]);
      engine.state.currentPlayer = 0;
      engine.playCards(0, [SpecialCardType.MAHJONG]);

      expect(() => engine.setWish(1, NormalRank.ACE)).toThrow('Not your play');
    });

    it('blocks play while wishPending', () => {
      setupControlledPlaying(engine, [
        [sc(SpecialCardType.MAHJONG), nc(Suit.JADE, NormalRank.TWO)],
        [nc(Suit.JADE, NormalRank.THREE), nc(Suit.STAR, NormalRank.KING)],
        [nc(Suit.SWORD, NormalRank.FIVE)],
        [nc(Suit.JADE, NormalRank.SEVEN)],
      ]);
      engine.state.currentPlayer = 0;
      engine.playCards(0, [SpecialCardType.MAHJONG]);

      expect(engine.state.wishPending).toBe(0);
      // Player 1 tries to play before wish is set
      expect(() => engine.playCards(1, [`${Suit.STAR}_${NormalRank.KING}`])).toThrow('Mahjong wish');
    });

    it('blocks pass while wishPending', () => {
      setupControlledPlaying(engine, [
        [sc(SpecialCardType.MAHJONG), nc(Suit.JADE, NormalRank.TWO)],
        [nc(Suit.JADE, NormalRank.THREE)],
        [nc(Suit.SWORD, NormalRank.FIVE)],
        [nc(Suit.JADE, NormalRank.SEVEN)],
      ]);
      engine.state.currentPlayer = 0;
      engine.playCards(0, [SpecialCardType.MAHJONG]);

      expect(() => engine.passTurn(1)).toThrow('Mahjong wish');
    });
  });

  // ─── 12. Phoenix Single ────────────────────────────────────────────

  describe('Phoenix single', () => {
    it('Phoenix can beat a normal single', () => {
      setupControlledPlaying(engine, [
        [nc(Suit.JADE, NormalRank.KING), nc(Suit.STAR, NormalRank.TWO)],
        [sc(SpecialCardType.PHOENIX), nc(Suit.JADE, NormalRank.THREE)],
        [nc(Suit.SWORD, NormalRank.FIVE)],
        [nc(Suit.PAGODA, NormalRank.SIX)],
      ]);
      engine.state.currentPlayer = 0;

      engine.playCards(0, [`${Suit.JADE}_${NormalRank.KING}`]);
      // Phoenix should be able to beat King
      engine.playCards(1, [SpecialCardType.PHOENIX]);

      expect(engine.state.currentTrick.plays.length).toBe(2);
      expect(engine.state.currentTrick.currentWinner).toBe(1);
    });

    it('Phoenix can beat Mahjong', () => {
      setupControlledPlaying(engine, [
        [sc(SpecialCardType.MAHJONG), nc(Suit.STAR, NormalRank.TWO)],
        [sc(SpecialCardType.PHOENIX), nc(Suit.JADE, NormalRank.THREE)],
        [nc(Suit.SWORD, NormalRank.FIVE)],
        [nc(Suit.PAGODA, NormalRank.SIX)],
      ]);
      engine.state.currentPlayer = 0;

      engine.playCards(0, [SpecialCardType.MAHJONG]);
      // Dismiss wish first
      engine.setWish(0, NormalRank.ACE);

      engine.playCards(1, [SpecialCardType.PHOENIX]);

      expect(engine.state.currentTrick.currentWinner).toBe(1);
    });

    it('Phoenix cannot beat Dragon', () => {
      setupControlledPlaying(engine, [
        [sc(SpecialCardType.DRAGON), nc(Suit.STAR, NormalRank.TWO)],
        [sc(SpecialCardType.PHOENIX), nc(Suit.JADE, NormalRank.THREE)],
        [nc(Suit.SWORD, NormalRank.FIVE)],
        [nc(Suit.PAGODA, NormalRank.SIX)],
      ]);
      engine.state.currentPlayer = 0;

      engine.playCards(0, [SpecialCardType.DRAGON]);
      expect(() => engine.playCards(1, [SpecialCardType.PHOENIX])).toThrow('does not beat');
    });

    it('Phoenix can beat Ace', () => {
      setupControlledPlaying(engine, [
        [nc(Suit.JADE, NormalRank.ACE), nc(Suit.STAR, NormalRank.TWO)],
        [sc(SpecialCardType.PHOENIX), nc(Suit.JADE, NormalRank.THREE)],
        [nc(Suit.SWORD, NormalRank.FIVE)],
        [nc(Suit.PAGODA, NormalRank.SIX)],
      ]);
      engine.state.currentPlayer = 0;

      engine.playCards(0, [`${Suit.JADE}_${NormalRank.ACE}`]);
      engine.playCards(1, [SpecialCardType.PHOENIX]);

      expect(engine.state.currentTrick.currentWinner).toBe(1);
    });

    it('Phoenix as single gets rank = lastPlayed + 0.5', () => {
      setupControlledPlaying(engine, [
        [nc(Suit.JADE, NormalRank.TEN), nc(Suit.STAR, NormalRank.TWO)],
        [sc(SpecialCardType.PHOENIX), nc(Suit.JADE, NormalRank.THREE)],
        [nc(Suit.SWORD, NormalRank.JACK)],
        [nc(Suit.PAGODA, NormalRank.SIX)],
      ]);
      engine.state.currentPlayer = 0;

      engine.playCards(0, [`${Suit.JADE}_${NormalRank.TEN}`]);
      engine.playCards(1, [SpecialCardType.PHOENIX]);

      const phoenixPlay = engine.state.currentTrick.plays[1];
      expect(phoenixPlay.combination.rank).toBe(10.5);
    });
  });

  // ─── 13. Dragon ────────────────────────────────────────────────────

  describe('Dragon single', () => {
    it('Dragon can beat any normal single', () => {
      setupControlledPlaying(engine, [
        [nc(Suit.JADE, NormalRank.ACE), nc(Suit.STAR, NormalRank.TWO)],
        [sc(SpecialCardType.DRAGON), nc(Suit.JADE, NormalRank.THREE)],
        [nc(Suit.SWORD, NormalRank.FIVE)],
        [nc(Suit.PAGODA, NormalRank.SIX)],
      ]);
      engine.state.currentPlayer = 0;

      engine.playCards(0, [`${Suit.JADE}_${NormalRank.ACE}`]);
      engine.playCards(1, [SpecialCardType.DRAGON]);

      expect(engine.state.currentTrick.currentWinner).toBe(1);
    });

    it('Dragon triggers DRAGON_GIVE phase when trick is won', () => {
      setupControlledPlaying(engine, [
        [sc(SpecialCardType.DRAGON), nc(Suit.STAR, NormalRank.TWO)],
        [nc(Suit.JADE, NormalRank.THREE), nc(Suit.STAR, NormalRank.FOUR)],
        [nc(Suit.SWORD, NormalRank.FIVE), nc(Suit.PAGODA, NormalRank.SIX)],
        [nc(Suit.JADE, NormalRank.SEVEN), nc(Suit.STAR, NormalRank.EIGHT)],
      ]);
      engine.state.currentPlayer = 0;

      engine.playCards(0, [SpecialCardType.DRAGON]);
      engine.passTurn(1);
      engine.passTurn(2);
      engine.passTurn(3);

      expect(engine.state.phase).toBe(GamePhase.DRAGON_GIVE);
    });
  });

  // ─── 14. Bombs ─────────────────────────────────────────────────────

  describe('bombs', () => {
    it('four-of-a-kind bomb beats any non-bomb single', () => {
      setupControlledPlaying(engine, [
        [nc(Suit.JADE, NormalRank.ACE), nc(Suit.STAR, NormalRank.TWO)],
        [
          nc(Suit.JADE, NormalRank.THREE),
          nc(Suit.STAR, NormalRank.THREE),
          nc(Suit.SWORD, NormalRank.THREE),
          nc(Suit.PAGODA, NormalRank.THREE),
        ],
        [nc(Suit.SWORD, NormalRank.FIVE)],
        [nc(Suit.PAGODA, NormalRank.SIX)],
      ]);
      engine.state.currentPlayer = 0;

      engine.playCards(0, [`${Suit.JADE}_${NormalRank.ACE}`]);
      engine.playCards(1, [
        `${Suit.JADE}_${NormalRank.THREE}`,
        `${Suit.STAR}_${NormalRank.THREE}`,
        `${Suit.SWORD}_${NormalRank.THREE}`,
        `${Suit.PAGODA}_${NormalRank.THREE}`,
      ]);

      expect(engine.state.currentTrick.currentWinner).toBe(1);
      const combo = engine.state.currentTrick.plays[1].combination;
      expect(combo.type).toBe(CombinationType.FOUR_OF_A_KIND_BOMB);
    });

    it('emits BOMB event for four-of-a-kind', () => {
      setupControlledPlaying(engine, [
        [nc(Suit.JADE, NormalRank.ACE), nc(Suit.STAR, NormalRank.TWO)],
        [
          nc(Suit.JADE, NormalRank.FIVE),
          nc(Suit.STAR, NormalRank.FIVE),
          nc(Suit.SWORD, NormalRank.FIVE),
          nc(Suit.PAGODA, NormalRank.FIVE),
        ],
        [nc(Suit.SWORD, NormalRank.SEVEN)],
        [nc(Suit.PAGODA, NormalRank.SIX)],
      ]);
      engine.state.currentPlayer = 0;

      engine.playCards(0, [`${Suit.JADE}_${NormalRank.ACE}`]);
      const events = engine.playCards(1, [
        `${Suit.JADE}_${NormalRank.FIVE}`,
        `${Suit.STAR}_${NormalRank.FIVE}`,
        `${Suit.SWORD}_${NormalRank.FIVE}`,
        `${Suit.PAGODA}_${NormalRank.FIVE}`,
      ]);

      expect(events.some((e) => e.type === 'BOMB')).toBe(true);
    });
  });

  // ─── 15. Round Scoring ─────────────────────────────────────────────

  describe('round scoring', () => {
    it('round ends when 3 players are out', () => {
      setupControlledPlaying(engine, [
        [nc(Suit.JADE, NormalRank.TWO)],
        [nc(Suit.JADE, NormalRank.THREE)],
        [nc(Suit.JADE, NormalRank.FOUR)],
        [nc(Suit.JADE, NormalRank.FIVE), nc(Suit.STAR, NormalRank.SIX)],
      ]);
      engine.state.currentPlayer = 0;

      // Player 0 plays their last card
      engine.playCards(0, [`${Suit.JADE}_${NormalRank.TWO}`]);
      // Player 0 is now out (finishOrder[0] = 0)
      expect(engine.state.players[0].isOut).toBe(true);

      // Player 1 beats it
      engine.playCards(1, [`${Suit.JADE}_${NormalRank.THREE}`]);
      expect(engine.state.players[1].isOut).toBe(true);

      // Player 2 beats it
      engine.playCards(2, [`${Suit.JADE}_${NormalRank.FOUR}`]);
      expect(engine.state.players[2].isOut).toBe(true);

      // 3 of 4 players are out -> round end pending, then scoring
      expect(engine.state.roundEndPending).toBe(true);
      engine.completeRoundEnd();
      expect(engine.state.phase).toBe(GamePhase.ROUND_SCORING);
    });

    it('1-2 double victory awards 200 points to winning team', () => {
      // Player 0 (team 0) plays last card -> goes out 1st
      // Player 2 (team 0) plays last card -> goes out 2nd -> triggers double victory
      setupControlledPlaying(engine, [
        [nc(Suit.JADE, NormalRank.TWO)],   // team 0, plays 1st
        [nc(Suit.JADE, NormalRank.THREE), nc(Suit.STAR, NormalRank.NINE)],  // team 1
        [nc(Suit.JADE, NormalRank.FOUR)],   // team 0, plays 3rd
        [nc(Suit.JADE, NormalRank.FIVE), nc(Suit.STAR, NormalRank.EIGHT)],  // team 1
      ]);
      engine.state.currentPlayer = 0;

      // Single trick: 2 < 3 < 4 -- all on same trick
      // Player 0 leads 2 (goes out), player 1 plays 3, player 2 plays 4 (goes out)
      engine.playCards(0, [`${Suit.JADE}_${NormalRank.TWO}`]);
      // Player 0 goes out (finishOrder[0] = 0, team 0)
      expect(engine.state.players[0].isOut).toBe(true);

      engine.playCards(1, [`${Suit.JADE}_${NormalRank.THREE}`]);

      engine.playCards(2, [`${Suit.JADE}_${NormalRank.FOUR}`]);
      // Player 2 goes out (finishOrder[1] = 2, team 0) -> 1-2 double victory!
      expect(engine.state.players[2].isOut).toBe(true);

      expect(engine.state.roundEndPending).toBe(true);
      engine.completeRoundEnd();
      expect(engine.state.phase).toBe(GamePhase.ROUND_SCORING);
      expect(engine.state.roundScores[0]).toBe(200);
      expect(engine.state.roundScores[1]).toBe(0);
    });

    it('tichu bonus is applied (+100 on success for first place)', () => {
      setupControlledPlaying(engine, [
        [nc(Suit.JADE, NormalRank.TWO)],
        [nc(Suit.JADE, NormalRank.THREE), nc(Suit.STAR, NormalRank.NINE)],
        [nc(Suit.JADE, NormalRank.FOUR)],
        [nc(Suit.JADE, NormalRank.FIVE), nc(Suit.STAR, NormalRank.EIGHT)],
      ]);
      engine.state.players[0].tichuCall = 'tichu';
      engine.state.currentPlayer = 0;

      engine.playCards(0, [`${Suit.JADE}_${NormalRank.TWO}`]);
      engine.playCards(1, [`${Suit.JADE}_${NormalRank.THREE}`]);
      engine.playCards(2, [`${Suit.JADE}_${NormalRank.FOUR}`]);

      // Double victory (200) + tichu success (100) = 300
      engine.completeRoundEnd();
      expect(engine.state.phase).toBe(GamePhase.ROUND_SCORING);
      expect(engine.state.roundScores[0]).toBe(300);
    });

    it('tichu penalty applied when another team gets double victory', () => {
      // Simpler approach: positions 1, 3 (team 1) each have 1 card
      // positions 0, 2 (team 0) have 2 cards. Player 0 has tichu.
      // On the trick: p0 leads low, p1 beats (goes out), p2 plays higher, p3 beats (goes out)
      // -> team 1 double victory, player 0 tichu fails
      setupControlledPlaying(engine, [
        [nc(Suit.JADE, NormalRank.TWO), nc(Suit.STAR, NormalRank.NINE)],  // team 0
        [nc(Suit.JADE, NormalRank.THREE)],   // team 1
        [nc(Suit.JADE, NormalRank.SIX), nc(Suit.STAR, NormalRank.EIGHT)],   // team 0
        [nc(Suit.JADE, NormalRank.KING)],   // team 1
      ]);
      engine.state.players[0].tichuCall = 'tichu';
      engine.state.currentPlayer = 0;

      engine.playCards(0, [`${Suit.JADE}_${NormalRank.TWO}`]);
      // Player 1 plays 3, goes out
      engine.playCards(1, [`${Suit.JADE}_${NormalRank.THREE}`]);
      expect(engine.state.players[1].isOut).toBe(true);

      engine.playCards(2, [`${Suit.JADE}_${NormalRank.SIX}`]);
      // Player 3 plays King, goes out -> team 1 double victory
      engine.playCards(3, [`${Suit.JADE}_${NormalRank.KING}`]);
      expect(engine.state.players[3].isOut).toBe(true);

      engine.completeRoundEnd();
      expect(engine.state.phase).toBe(GamePhase.ROUND_SCORING);
      // Team 1 gets 200 (double victory), team 0 gets -100 (tichu failure)
      expect(engine.state.roundScores[1]).toBe(200);
      expect(engine.state.roundScores[0]).toBe(-100);
    });

    it('grand tichu bonus is +200 on success', () => {
      setupControlledPlaying(engine, [
        [nc(Suit.JADE, NormalRank.TWO)],
        [nc(Suit.JADE, NormalRank.THREE), nc(Suit.STAR, NormalRank.NINE)],
        [nc(Suit.JADE, NormalRank.FOUR)],
        [nc(Suit.JADE, NormalRank.FIVE), nc(Suit.STAR, NormalRank.EIGHT)],
      ]);
      engine.state.players[0].tichuCall = 'grand_tichu';
      engine.state.currentPlayer = 0;

      engine.playCards(0, [`${Suit.JADE}_${NormalRank.TWO}`]);
      engine.playCards(1, [`${Suit.JADE}_${NormalRank.THREE}`]);
      engine.playCards(2, [`${Suit.JADE}_${NormalRank.FOUR}`]);

      // Double victory (200) + grand tichu success (200) = 400
      engine.completeRoundEnd();
      expect(engine.state.phase).toBe(GamePhase.ROUND_SCORING);
      expect(engine.state.roundScores[0]).toBe(400);
    });

    it('grand tichu penalty is -200 on failure', () => {
      setupControlledPlaying(engine, [
        [nc(Suit.JADE, NormalRank.TWO), nc(Suit.STAR, NormalRank.NINE)],  // team 0
        [nc(Suit.JADE, NormalRank.THREE)],   // team 1
        [nc(Suit.JADE, NormalRank.SIX), nc(Suit.STAR, NormalRank.EIGHT)],   // team 0
        [nc(Suit.JADE, NormalRank.KING)],   // team 1
      ]);
      engine.state.players[0].tichuCall = 'grand_tichu';
      engine.state.currentPlayer = 0;

      engine.playCards(0, [`${Suit.JADE}_${NormalRank.TWO}`]);
      engine.playCards(1, [`${Suit.JADE}_${NormalRank.THREE}`]);
      engine.playCards(2, [`${Suit.JADE}_${NormalRank.SIX}`]);
      engine.playCards(3, [`${Suit.JADE}_${NormalRank.KING}`]);

      // Team 1 double victory (200), team 0 grand tichu penalty (-200)
      engine.completeRoundEnd();
      expect(engine.state.phase).toBe(GamePhase.ROUND_SCORING);
      expect(engine.state.roundScores[0]).toBe(-200);
      expect(engine.state.roundScores[1]).toBe(200);
    });

    it('scores accumulate across rounds', () => {
      engine.state.phase = GamePhase.ROUND_SCORING;
      engine.state.scores = [300, 200];

      engine.nextRound(); // starts new round since below WINNING_SCORE

      // Scores should persist
      expect(engine.state.scores).toEqual([300, 200]);
    });
  });

  // ─── 16. nextRound ─────────────────────────────────────────────────

  describe('nextRound', () => {
    it('starts new round when scores below winning threshold', () => {
      engine.state.phase = GamePhase.ROUND_SCORING;
      engine.state.scores = [100, 200];

      engine.nextRound();

      expect(engine.state.phase).toBe(GamePhase.GRAND_TICHU);
    });

    it('transitions to GAME_OVER when team 0 reaches winning score', () => {
      engine.state.phase = GamePhase.ROUND_SCORING;
      engine.state.scores = [WINNING_SCORE, 400];

      const events = engine.nextRound();

      expect(engine.state.phase).toBe(GamePhase.GAME_OVER);
      expect(events.some((e) => e.type === 'GAME_OVER')).toBe(true);
    });

    it('transitions to GAME_OVER when team 1 reaches winning score', () => {
      engine.state.phase = GamePhase.ROUND_SCORING;
      engine.state.scores = [400, WINNING_SCORE];

      const events = engine.nextRound();

      expect(engine.state.phase).toBe(GamePhase.GAME_OVER);
    });

    it('transitions to GAME_OVER when score exceeds winning score', () => {
      engine.state.phase = GamePhase.ROUND_SCORING;
      engine.state.scores = [WINNING_SCORE + 200, 400];

      const events = engine.nextRound();

      expect(engine.state.phase).toBe(GamePhase.GAME_OVER);
    });

    it('throws when not in ROUND_SCORING phase', () => {
      engine.state.phase = GamePhase.PLAYING;
      expect(() => engine.nextRound()).toThrow('Expected phase');
    });
  });

  // ─── 17. getNextActivePlayer ───────────────────────────────────────

  describe('getNextActivePlayer', () => {
    it('returns next player in order', () => {
      expect(engine.getNextActivePlayer(0)).toBe(1);
      expect(engine.getNextActivePlayer(1)).toBe(2);
      expect(engine.getNextActivePlayer(2)).toBe(3);
      expect(engine.getNextActivePlayer(3)).toBe(0);
    });

    it('skips players who are out', () => {
      engine.state.players[1].isOut = true;
      expect(engine.getNextActivePlayer(0)).toBe(2);
    });

    it('skips multiple out players', () => {
      engine.state.players[1].isOut = true;
      engine.state.players[2].isOut = true;
      expect(engine.getNextActivePlayer(0)).toBe(3);
    });

    it('wraps around', () => {
      engine.state.players[0].isOut = true;
      expect(engine.getNextActivePlayer(3)).toBe(1);
    });
  });

  // ─── 18. getClientState ────────────────────────────────────────────

  describe('getClientState', () => {
    it('returns player-specific state', () => {
      engine.startRound();
      const state = engine.getClientState(0, 'ABCD');

      expect(state.roomCode).toBe('ABCD');
      expect(state.phase).toBe(GamePhase.GRAND_TICHU);
      expect(state.myPosition).toBe(0);
      expect(state.myHand.length).toBe(8);
      expect(state.players.length).toBe(4);
    });

    it('does not reveal other players hands when not out', () => {
      engine.startRound();
      const state = engine.getClientState(0, 'ABCD');

      expect(state.players[1].hand).toBeUndefined();
      expect(state.players[1].cardCount).toBe(8);
    });

    it('includes grandTichuPending when player has not decided', () => {
      engine.startRound();
      const state = engine.getClientState(0, 'ABCD');
      expect(state.grandTichuPending).toBe(true);

      engine.grandTichuDecision(0, false);
      const state2 = engine.getClientState(0, 'ABCD');
      expect(state2.grandTichuPending).toBe(false);
    });

    it('includes target score', () => {
      const customEngine = new GameEngine(['A', 'B', 'C', 'D'], 500);
      customEngine.startRound();
      const state = customEngine.getClientState(0, 'ROOM');
      expect(state.targetScore).toBe(500);
    });
  });

  // ─── 19. Serialization ─────────────────────────────────────────────

  describe('serialize / restore', () => {
    it('round-trips engine state correctly', () => {
      engine.startRound();
      for (let i = 0; i < 4; i++) {
        engine.grandTichuDecision(i as PlayerPosition, false);
      }

      const json = engine.serialize();
      const restored = GameEngine.restore(json);

      expect(restored.state.phase).toBe(engine.state.phase);
      expect(restored.state.scores).toEqual(engine.state.scores);
      for (let i = 0; i < 4; i++) {
        expect(restored.state.players[i].hand.length).toBe(engine.state.players[i].hand.length);
        expect(restored.state.players[i].nickname).toBe(engine.state.players[i].nickname);
      }
    });

    it('preserves Grand Tichu remaining cards during GRAND_TICHU phase', () => {
      engine.startRound();
      // Serialize during GRAND_TICHU phase (remaining cards still held)
      const json = engine.serialize();
      const restored = GameEngine.restore(json);

      // After restoring, Grand Tichu decisions should still work
      for (let i = 0; i < 4; i++) {
        restored.grandTichuDecision(i as PlayerPosition, false);
      }
      expect(restored.state.phase).toBe(GamePhase.PASSING);
      for (const p of restored.state.players) {
        expect(p.hand.length).toBe(14);
      }
    });
  });

  // ─── 20. Clone ─────────────────────────────────────────────────────

  describe('clone', () => {
    it('creates independent copy of engine state', () => {
      advanceToPlaying(engine);

      const clone = engine.clone();

      // Modifying clone should not affect original
      clone.state.scores[0] = 999;
      expect(engine.state.scores[0]).toBe(0);

      // Hands should be equal but independent
      const origHand = engine.state.players[0].hand;
      const cloneHand = clone.state.players[0].hand;
      expect(cloneHand.length).toBe(origHand.length);

      clone.state.players[0].hand.pop();
      expect(engine.state.players[0].hand.length).toBe(origHand.length);
    });

    it('preserves phase and current player', () => {
      advanceToPlaying(engine);
      const clone = engine.clone();
      expect(clone.state.phase).toBe(engine.state.phase);
      expect(clone.state.currentPlayer).toBe(engine.state.currentPlayer);
    });
  });

  // ─── 21. Player Out & Finish Order ─────────────────────────────────

  describe('player out', () => {
    it('player goes out when hand is empty', () => {
      setupControlledPlaying(engine, [
        [nc(Suit.JADE, NormalRank.ACE)],
        [nc(Suit.JADE, NormalRank.TWO), nc(Suit.STAR, NormalRank.THREE)],
        [nc(Suit.SWORD, NormalRank.FOUR), nc(Suit.PAGODA, NormalRank.FIVE)],
        [nc(Suit.JADE, NormalRank.SIX), nc(Suit.STAR, NormalRank.SEVEN)],
      ]);
      engine.state.currentPlayer = 0;

      engine.playCards(0, [`${Suit.JADE}_${NormalRank.ACE}`]);

      expect(engine.state.players[0].isOut).toBe(true);
      expect(engine.state.players[0].finishOrder).toBe(1);
      expect(engine.state.finishOrder).toContain(0);
    });

    it('emits PLAYER_OUT event', () => {
      setupControlledPlaying(engine, [
        [nc(Suit.JADE, NormalRank.ACE)],
        [nc(Suit.JADE, NormalRank.TWO)],
        [nc(Suit.SWORD, NormalRank.FOUR)],
        [nc(Suit.JADE, NormalRank.SIX)],
      ]);
      engine.state.currentPlayer = 0;

      const events = engine.playCards(0, [`${Suit.JADE}_${NormalRank.ACE}`]);
      expect(events.some((e) => e.type === 'PLAYER_OUT')).toBe(true);
    });
  });

  // ─── 22. Phase Guards ──────────────────────────────────────────────

  describe('phase guards', () => {
    it('playCards rejects when not in PLAYING phase', () => {
      engine.startRound();
      // Still in GRAND_TICHU
      const hand = engine.state.players[0].hand;
      expect(() => engine.playCards(0, [hand[0].id])).toThrow('Expected phase');
    });

    it('passCards rejects when not in PASSING phase', () => {
      engine.startRound();
      // Still in GRAND_TICHU
      const hand = engine.state.players[0].hand;
      expect(() =>
        engine.passCards(0, { left: hand[0].id, across: hand[1].id, right: hand[2].id })
      ).toThrow('Expected phase');
    });

    it('passTurn rejects when not in PLAYING phase', () => {
      engine.startRound();
      expect(() => engine.passTurn(0)).toThrow('Expected phase');
    });
  });

  // ─── 23. resolveDog edge cases ─────────────────────────────────────

  describe('resolveDog edge cases', () => {
    it('resolveDog returns empty events if not pending', () => {
      engine.state.dogPending = false;
      const events = engine.resolveDog();
      expect(events).toEqual([]);
    });
  });

  // ─── 24. completeTrickWon edge cases ───────────────────────────────

  describe('completeTrickWon edge cases', () => {
    it('returns empty events if not pending', () => {
      engine.state.trickWonPending = false;
      const events = engine.completeTrickWon();
      expect(events).toEqual([]);
    });
  });

  // ─── 25. Round History ─────────────────────────────────────────────

  describe('round history', () => {
    it('records round history after scoring', () => {
      setupControlledPlaying(engine, [
        [nc(Suit.JADE, NormalRank.TWO)],
        [nc(Suit.JADE, NormalRank.THREE)],
        [nc(Suit.JADE, NormalRank.FOUR)],
        [nc(Suit.JADE, NormalRank.FIVE), nc(Suit.STAR, NormalRank.SIX)],
      ]);
      engine.state.currentPlayer = 0;

      engine.playCards(0, [`${Suit.JADE}_${NormalRank.TWO}`]);
      engine.playCards(1, [`${Suit.JADE}_${NormalRank.THREE}`]);
      engine.playCards(2, [`${Suit.JADE}_${NormalRank.FOUR}`]);

      engine.completeRoundEnd();
      const history = engine.getRoundHistory();
      expect(history.length).toBe(1);
      expect(history[0].round).toBe(1);
      expect(history[0].teamScores).toBeDefined();
      expect(history[0].runningTotals).toBeDefined();
    });
  });

  // ─── 26. Mahjong holder detection ─────────────────────────────────

  describe('Mahjong holder', () => {
    it('after card passing, Mahjong holder is set as current player', () => {
      // Run many times to test different random deals
      for (let trial = 0; trial < 5; trial++) {
        const eng = new GameEngine(['A', 'B', 'C', 'D']);
        advanceToPlaying(eng);

        const holder = eng.state.players[eng.state.currentPlayer];
        const hasMahjong = holder.hand.some((c) => isSpecialCard(c, SpecialCardType.MAHJONG));
        expect(hasMahjong).toBe(true);
      }
    });
  });

  // ─── 27. Full game flow (integration) ──────────────────────────────

  describe('full game integration', () => {
    it('can play a trick, win it, then lead again', () => {
      setupControlledPlaying(engine, [
        [nc(Suit.JADE, NormalRank.ACE), nc(Suit.STAR, NormalRank.KING)],
        [nc(Suit.JADE, NormalRank.TWO), nc(Suit.STAR, NormalRank.THREE)],
        [nc(Suit.SWORD, NormalRank.FOUR), nc(Suit.PAGODA, NormalRank.FIVE)],
        [nc(Suit.JADE, NormalRank.SIX), nc(Suit.STAR, NormalRank.SEVEN)],
      ]);
      engine.state.currentPlayer = 0;

      // Player 0 leads Ace
      engine.playCards(0, [`${Suit.JADE}_${NormalRank.ACE}`]);
      // Everyone else passes
      engine.passTurn(1);
      engine.passTurn(2);
      engine.passTurn(3);

      // Complete trick
      expect(engine.state.trickWonPending).toBe(true);
      engine.completeTrickWon();

      // Player 0 should lead again (won the trick)
      expect(engine.state.currentPlayer).toBe(0);
      expect(engine.state.currentTrick.plays.length).toBe(0);
      expect(engine.state.players[0].wonTricks.length).toBe(1);

      // Player 0 leads King and goes out
      engine.playCards(0, [`${Suit.STAR}_${NormalRank.KING}`]);
      expect(engine.state.players[0].isOut).toBe(true);
      expect(engine.state.players[0].finishOrder).toBe(1);
    });

    it('completes a full controlled round to ROUND_SCORING', () => {
      // Each player has exactly 1 card; they play in ascending order on a single trick
      setupControlledPlaying(engine, [
        [nc(Suit.JADE, NormalRank.TWO)],
        [nc(Suit.JADE, NormalRank.THREE)],
        [nc(Suit.JADE, NormalRank.FOUR)],
        [nc(Suit.JADE, NormalRank.FIVE)],
      ]);
      engine.state.currentPlayer = 0;

      // All play their single card on the same trick
      engine.playCards(0, [`${Suit.JADE}_${NormalRank.TWO}`]);
      engine.playCards(1, [`${Suit.JADE}_${NormalRank.THREE}`]);
      engine.playCards(2, [`${Suit.JADE}_${NormalRank.FOUR}`]);
      // After player 2, three players are out -> round end pending
      expect(engine.state.roundEndPending).toBe(true);
      engine.completeRoundEnd();
      expect(engine.state.phase).toBe(GamePhase.ROUND_SCORING);
    });
  });
});
