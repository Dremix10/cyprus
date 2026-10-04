import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RoomManager } from '../RoomManager.js';
import { TimerManager } from '../TimerManager.js';

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
});
