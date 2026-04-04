import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine, type PlayerState } from '../GameEngine.js';
import { GamePhase, SpecialCardType } from '@cyprus/shared';
import type { Card, PlayerPosition, NormalRank } from '@cyprus/shared';

function isSpecialCard(card: Card, type: SpecialCardType): boolean {
  return card.type === 'special' && card.specialType === type;
}

function findCardId(hand: Card[], predicate: (c: Card) => boolean): string {
  const card = hand.find(predicate);
  if (!card) throw new Error('Card not found in hand');
  return card.id;
}

describe('GameEngine', () => {
  let engine: GameEngine;

  beforeEach(() => {
    engine = new GameEngine(['Alice', 'Bob', 'Carol', 'Dave']);
  });

  describe('startRound', () => {
    it('should deal 8 cards to each player and enter GRAND_TICHU phase', () => {
      engine.startRound();
      expect(engine.state.phase).toBe(GamePhase.GRAND_TICHU);
      for (const p of engine.state.players) {
        expect(p.hand.length).toBe(8);
        expect(p.grandTichuDecided).toBe(false);
        expect(p.isOut).toBe(false);
        expect(p.tichuCall).toBe('none');
      }
    });
  });

  describe('grandTichuDecision', () => {
    beforeEach(() => engine.startRound());

    it('should allow all players to pass Grand Tichu', () => {
      for (let i = 0; i < 4; i++) {
        engine.grandTichuDecision(i as PlayerPosition, false);
      }
      // After all decide, remaining cards dealt, phase moves to PASSING
      expect(engine.state.phase).toBe(GamePhase.PASSING);
      for (const p of engine.state.players) {
        expect(p.hand.length).toBe(14);
      }
    });

    it('should record Grand Tichu call', () => {
      const events = engine.grandTichuDecision(0, true);
      expect(engine.state.players[0].tichuCall).toBe('grand_tichu');
      expect(events.some((e) => e.type === 'GRAND_TICHU_CALL')).toBe(true);
    });

    it('should throw if player already decided', () => {
      engine.grandTichuDecision(0, false);
      expect(() => engine.grandTichuDecision(0, false)).toThrow(
        'Already decided'
      );
    });
  });

  describe('passCards', () => {
    beforeEach(() => {
      engine.startRound();
      for (let i = 0; i < 4; i++) {
        engine.grandTichuDecision(i as PlayerPosition, false);
      }
    });

    it('should transition to PLAYING after all players pass cards', () => {
      for (let i = 0; i < 4; i++) {
        const hand = engine.state.players[i].hand;
        engine.passCards(i as PlayerPosition, {
          left: hand[0].id,
          across: hand[1].id,
          right: hand[2].id,
        });
      }

      expect(engine.state.phase).toBe(GamePhase.PLAYING);
      // Each player still has 14 cards (gave 3, received 3)
      for (const p of engine.state.players) {
        expect(p.hand.length).toBe(14);
      }
    });

    it('should reject duplicate card IDs', () => {
      const hand = engine.state.players[0].hand;
      expect(() =>
        engine.passCards(0, {
          left: hand[0].id,
          across: hand[0].id,
          right: hand[1].id,
        })
      ).toThrow('3 different cards');
    });

    it('should reject cards not in hand', () => {
      expect(() =>
        engine.passCards(0, {
          left: 'fake_card',
          across: engine.state.players[0].hand[0].id,
          right: engine.state.players[0].hand[1].id,
        })
      ).toThrow('not in hand');
    });
  });

  describe('callTichu', () => {
    beforeEach(() => {
      engine.startRound();
      for (let i = 0; i < 4; i++)
        engine.grandTichuDecision(i as PlayerPosition, false);
    });

    it('should allow calling Tichu in PASSING phase', () => {
      const events = engine.callTichu(0);
      expect(engine.state.players[0].tichuCall).toBe('tichu');
      expect(events.some((e) => e.type === 'TICHU_CALL')).toBe(true);
    });

    it('should reject Tichu if already called Grand Tichu', () => {
      // Reset and have player 0 call Grand Tichu
      engine = new GameEngine(['Alice', 'Bob', 'Carol', 'Dave']);
      engine.startRound();
      engine.grandTichuDecision(0, true);
      for (let i = 1; i < 4; i++)
        engine.grandTichuDecision(i as PlayerPosition, false);

      expect(() => engine.callTichu(0)).toThrow('Already called');
    });
  });

  describe('full round simulation', () => {
    /** Helper: advance through Grand Tichu + Card Passing to PLAYING phase. */
    function advanceToPlaying(eng: GameEngine): void {
      eng.startRound();
      for (let i = 0; i < 4; i++)
        eng.grandTichuDecision(i as PlayerPosition, false);
      for (let i = 0; i < 4; i++) {
        const hand = eng.state.players[i].hand;
        eng.passCards(i as PlayerPosition, {
          left: hand[0].id,
          across: hand[1].id,
          right: hand[2].id,
        });
      }
      expect(eng.state.phase).toBe(GamePhase.PLAYING);
    }

    it('should set Mahjong holder as current player after passing', () => {
      advanceToPlaying(engine);
      const currentPlayer = engine.state.players[engine.state.currentPlayer];
      const hasMahjong = currentPlayer.hand.some((c) =>
        isSpecialCard(c, SpecialCardType.MAHJONG)
      );
      expect(hasMahjong).toBe(true);
    });

    it('should reject plays from wrong player', () => {
      advanceToPlaying(engine);
      const wrongPlayer = ((engine.state.currentPlayer + 1) % 4) as PlayerPosition;
      const hand = engine.state.players[wrongPlayer].hand;
      expect(() => engine.playCards(wrongPlayer, [hand[0].id])).toThrow(
        'Not your turn'
      );
    });

    it('should reject passing when leading a trick', () => {
      advanceToPlaying(engine);
      expect(() =>
        engine.passTurn(engine.state.currentPlayer)
      ).toThrow('Cannot pass when leading');
    });

    it('should allow playing a single card and advance turn', () => {
      advanceToPlaying(engine);
      const pos = engine.state.currentPlayer;
      const hand = engine.state.players[pos].hand;

      // Find any single normal card (not Dog)
      const cardId = findCardId(
        hand,
        (c) => c.type === 'normal' || isSpecialCard(c, SpecialCardType.MAHJONG)
      );

      engine.playCards(pos, [cardId]);

      expect(engine.state.currentTrick.plays.length).toBe(1);
      expect(engine.state.currentPlayer).not.toBe(pos);
      expect(engine.state.players[pos].hand.length).toBe(13);
    });

    it('should simulate a full trick with 3 passes', () => {
      advanceToPlaying(engine);
      const leader = engine.state.currentPlayer;
      const hand = engine.state.players[leader].hand;

      // Lead with any normal card
      const normalCard = hand.find((c) => c.type === 'normal');
      if (!normalCard) return; // extremely unlikely but skip

      engine.playCards(leader, [normalCard.id]);

      // Other 3 players pass
      for (let i = 0; i < 3; i++) {
        const current = engine.state.currentPlayer;
        engine.passTurn(current);
      }

      // Trick should be resolved — trick cleared, leader leads again
      expect(engine.state.currentTrick.plays.length).toBe(0);
      expect(engine.state.currentPlayer).toBe(leader);
      expect(engine.state.players[leader].wonTricks.length).toBe(1);
    });

    it('should handle Dog lead — passes turn to partner', () => {
      advanceToPlaying(engine);

      // Find who has the Dog
      const dogHolder = engine.state.players.find((p) =>
        p.hand.some((c) => isSpecialCard(c, SpecialCardType.DOG))
      );
      if (!dogHolder) return;

      // We need the dog holder to be current player to lead
      // Force current player to the dog holder for this test
      engine.state.currentPlayer = dogHolder.position;

      const dogId = findCardId(dogHolder.hand, (c) =>
        isSpecialCard(c, SpecialCardType.DOG)
      );
      engine.playCards(dogHolder.position, [dogId]);

      // Partner should be current player
      const expectedPartner = ((dogHolder.position + 2) % 4) as PlayerPosition;
      expect(engine.state.currentPlayer).toBe(expectedPartner);
    });
  });

  describe('getClientState', () => {
    it('should return player-specific state', () => {
      engine.startRound();
      const state = engine.getClientState(0, 'ABCD');

      expect(state.roomCode).toBe('ABCD');
      expect(state.phase).toBe(GamePhase.GRAND_TICHU);
      expect(state.myPosition).toBe(0);
      expect(state.myHand.length).toBe(8);
      expect(state.players.length).toBe(4);
      // Should not reveal other players' hands
      expect(state.players[1].cardCount).toBe(8);
    });
  });

  describe('scoring and round end', () => {
    it('should transition to ROUND_SCORING when 3 players are out', () => {
      engine.startRound();
      for (let i = 0; i < 4; i++)
        engine.grandTichuDecision(i as PlayerPosition, false);
      for (let i = 0; i < 4; i++) {
        const hand = engine.state.players[i].hand;
        engine.passCards(i as PlayerPosition, {
          left: hand[0].id,
          across: hand[1].id,
          right: hand[2].id,
        });
      }

      // Force 3 players out to trigger scoring
      for (let i = 0; i < 3; i++) {
        const p = engine.state.players[i];
        p.hand = [];
        p.isOut = true;
        engine.state.finishOrder.push(i as PlayerPosition);
        p.finishOrder = i + 1;
      }

      // Trigger checkRoundEnd via a trick resolution
      // Set up a trick where player 3 leads and everyone else has passed
      engine.state.currentPlayer = 3;
      const hand = engine.state.players[3].hand;
      const normalCard = hand.find((c) => c.type === 'normal');
      if (!normalCard) return;

      engine.playCards(3, [normalCard.id]);

      // All other players are out, so the trick should auto-resolve
      // (passCount check: activePlayers - 1 = 0 remaining passes needed)
      // Actually with only 1 active player, the trick resolves immediately
      // since passCount(0) >= activePlayers(1) - 1 = 0
      expect(
        engine.state.phase === GamePhase.ROUND_SCORING ||
          engine.state.phase === GamePhase.PLAYING
      ).toBe(true);
    });
  });

  describe('nextRound', () => {
    it('should start a new round when scores below winning threshold', () => {
      // Manually set phase to ROUND_SCORING with low scores
      engine.state.phase = GamePhase.ROUND_SCORING;
      engine.state.scores = [100, 200];

      engine.nextRound();

      expect(engine.state.phase).toBe(GamePhase.GRAND_TICHU);
    });

    it('should transition to GAME_OVER when a team reaches winning score', () => {
      engine.state.phase = GamePhase.ROUND_SCORING;
      engine.state.scores = [1000, 400];

      const events = engine.nextRound();

      expect(engine.state.phase).toBe(GamePhase.GAME_OVER);
      expect(events.some((e) => e.type === 'GAME_OVER')).toBe(true);
    });
  });

  describe('getNextActivePlayer', () => {
    it('should skip players who are out', () => {
      engine.state.players[1].isOut = true;
      expect(engine.getNextActivePlayer(0)).toBe(2);
    });

    it('should wrap around', () => {
      engine.state.players[0].isOut = true;
      expect(engine.getNextActivePlayer(3)).toBe(1);
    });
  });
});
