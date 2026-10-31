import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GamePhase, NormalRank, SpecialCardType, Suit, sortCards } from '@cyprus/shared';
import type { Card, PlayerPosition } from '@cyprus/shared';
import { RoomManager } from '../RoomManager.js';
import { TimerManager } from '../TimerManager.js';
import type { GameEngine } from '../GameEngine.js';

const card = (suit: Suit, rank: NormalRank): Card => ({ type: 'normal', suit, rank, id: `${suit}_${rank}` });
const special = (specialType: SpecialCardType): Card => ({ type: 'special', specialType, id: specialType });

/** Put a started game straight into the playing phase with these hands. */
function deal(engine: GameEngine, hands: Card[][], leader: PlayerPosition): void {
  engine.state.phase = GamePhase.PLAYING;
  hands.forEach((hand, i) => {
    const p = engine.state.players[i];
    p.hand = sortCards(hand);
    p.isOut = hand.length === 0;
    p.grandTichuDecided = true;
    p.passedCards = { left: 'x', across: 'y', right: 'z' };
  });
  engine.state.currentTrick = { plays: [], currentWinner: null, passCount: 0, passedPlayers: [] };
  engine.state.currentPlayer = leader;
}

function fourPlayerGame(rm: RoomManager): string {
  const created = rm.createRoom('s0', 'Alice') as { roomCode: string };
  rm.joinRoom('s1', created.roomCode, 'Bob');
  rm.joinRoom('s2', created.roomCode, 'Carol');
  rm.joinRoom('s3', created.roomCode, 'Dave');
  rm.startGame('s0');
  return created.roomCode;
}

describe('TimerManager', () => {
  let rm: RoomManager;
  let timers: TimerManager;

  beforeEach(() => {
    rm = new RoomManager();
    timers = new TimerManager(rm, () => {}, () => {});
  });

  afterEach(() => {
    timers.destroy();
    rm.destroy();
  });

  it('does not play for a disconnected player, and starts a two minute seat clock', () => {
    const code = fourPlayerGame(rm);
    const room = rm.getRoom(code)!;
    const current = room.engine!.state.currentPlayer;

    rm.handleDisconnect(`s${current}`);
    timers.scheduleTurnTimer(code);

    expect(timers.getTurnDeadline(code)).toBeNull();
    const deadline = timers.getDisconnectDeadlines(code)[current];
    expect(deadline).toBeGreaterThan(Date.now() + 110_000);
    expect(deadline).toBeLessThan(Date.now() + 130_000);
  });

  it('does not replace the only human in a solo game', () => {
    const created = rm.createSoloRoom('s0', 'Alice') as { roomCode: string };
    rm.startGame('s0');
    rm.handleDisconnect('s0');
    timers.scheduleTurnTimer(created.roomCode);
    expect(timers.getDisconnectDeadlines(created.roomCode)).toEqual({});
    expect(timers.getTurnDeadline(created.roomCode)).toBeNull();
  });

  it('keeps the same countdown across repeated updates', () => {
    const code = fourPlayerGame(rm);
    rm.handleDisconnect('s1');
    timers.scheduleTurnTimer(code);
    const first = timers.getDisconnectDeadlines(code)[1];
    timers.scheduleTurnTimer(code);
    expect(timers.getDisconnectDeadlines(code)[1]).toBe(first);
  });

  describe('lead timeout', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('leads the lowest card, not the Phoenix (it sorts next to the Dragon now)', () => {
      const code = fourPlayerGame(rm);
      const engine = rm.getRoom(code)!.engine!;
      deal(engine, [
        [special(SpecialCardType.PHOENIX), card(Suit.JADE, NormalRank.THREE), card(Suit.STAR, NormalRank.KING)],
        [card(Suit.JADE, NormalRank.FOUR)],
        [card(Suit.JADE, NormalRank.FIVE)],
        [card(Suit.JADE, NormalRank.SIX)],
      ], 0);

      timers.scheduleTurnTimer(code);
      vi.advanceTimersByTime(60_000);

      const led = engine.state.currentTrick.plays[0]?.combination.cards.map((c) => c.id);
      expect(led).toEqual([`${Suit.JADE}_${NormalRank.THREE}`]);
      expect(engine.state.players[0].hand.some((c) => c.id === SpecialCardType.PHOENIX)).toBe(true);
    });

    it('clears the Dog notice when the receiver times out and the server leads for them', () => {
      const code = fourPlayerGame(rm);
      const engine = rm.getRoom(code)!.engine!;
      deal(engine, [
        [special(SpecialCardType.DOG), card(Suit.JADE, NormalRank.TWO)],
        [card(Suit.JADE, NormalRank.FOUR)],
        [card(Suit.STAR, NormalRank.SEVEN), card(Suit.STAR, NormalRank.NINE)],
        [card(Suit.JADE, NormalRank.SIX)],
      ], 0);
      engine.playCards(0, [SpecialCardType.DOG]);
      engine.resolveDog();
      expect(engine.state.dogLead?.to).toBe(2);

      timers.scheduleTurnTimer(code);
      vi.advanceTimersByTime(60_000);

      expect(engine.state.dogLead).toBeNull();
      expect(engine.state.currentTrick.plays[0]?.playerPosition).toBe(2);
    });
  });
});
