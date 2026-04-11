import type { PlayerPosition } from '@cyprus/shared';
import { GamePhase, findPlayableFromHand } from '@cyprus/shared';
import type { RoomManager, Room } from './RoomManager.js';

const TURN_TIMEOUT_MS = 60_000;
const DISCONNECT_REPLACE_MS = 60_000;

type BroadcastFn = (roomCode: string) => void;
type EmitFn = (roomCode: string, event: string, ...args: unknown[]) => void;

export class TimerManager {
  private turnTimers = new Map<string, NodeJS.Timeout>();
  private turnDeadlines = new Map<string, number>();
  private disconnectTimers = new Map<string, NodeJS.Timeout>();
  private dogTimers = new Map<string, NodeJS.Timeout>();
  private trickWonTimers = new Map<string, NodeJS.Timeout>();
  /** Tracks userId of players replaced by bots, so game-end can still credit them */
  readonly disconnectedPlayers = new Map<string, Map<number, number>>();

  constructor(
    private rooms: RoomManager,
    private emit: EmitFn,
    private broadcastGameState: BroadcastFn,
  ) {}

  getTurnDeadline(roomCode: string): number | null {
    return this.turnDeadlines.get(roomCode) ?? null;
  }

  destroy(): void {
    for (const timer of this.turnTimers.values()) clearTimeout(timer);
    for (const timer of this.disconnectTimers.values()) clearTimeout(timer);
    for (const timer of this.dogTimers.values()) clearTimeout(timer);
    for (const timer of this.trickWonTimers.values()) clearTimeout(timer);
  }

  /** Clear all timers associated with a room (called when room is deleted). */
  clearAllTimersForRoom(roomCode: string): void {
    this.clearTurnTimer(roomCode);
    for (const pos of [0, 1, 2, 3]) {
      const timerKey = `${roomCode}-${pos}`;
      const existing = this.disconnectTimers.get(timerKey);
      if (existing) {
        clearTimeout(existing);
        this.disconnectTimers.delete(timerKey);
      }
    }
    const dogTimer = this.dogTimers.get(roomCode);
    if (dogTimer) { clearTimeout(dogTimer); this.dogTimers.delete(roomCode); }
    const trickTimer = this.trickWonTimers.get(roomCode);
    if (trickTimer) { clearTimeout(trickTimer); this.trickWonTimers.delete(roomCode); }
    this.disconnectedPlayers.delete(roomCode);
  }

  // ─── Turn Timer ────────────────────────────────────────────────────

  clearTurnTimer(roomCode: string): void {
    const existing = this.turnTimers.get(roomCode);
    if (existing) clearTimeout(existing);
    this.turnTimers.delete(roomCode);
    this.turnDeadlines.delete(roomCode);
  }

  scheduleTurnTimer(roomCode: string): void {
    this.clearTurnTimer(roomCode);

    const room = this.rooms.getRoom(roomCode);
    if (!room || !room.engine) return;
    if (room.botPositions.size >= 3) return;

    const engine = room.engine;
    if (engine.state.phase !== GamePhase.PLAYING) return;
    if (engine.state.wishPending !== null) return;

    const currentPlayer = engine.state.currentPlayer;
    if (room.botPositions.has(currentPlayer)) return;

    const deadline = Date.now() + TURN_TIMEOUT_MS;
    this.turnDeadlines.set(roomCode, deadline);

    const timer = setTimeout(() => {
      this.turnTimers.delete(roomCode);
      this.turnDeadlines.delete(roomCode);

      const currentRoom = this.rooms.getRoom(roomCode);
      if (!currentRoom || !currentRoom.engine) return;

      const eng = currentRoom.engine;
      if (eng.state.phase !== GamePhase.PLAYING) return;
      if (eng.state.currentPlayer !== currentPlayer) return;

      try {
        let events;
        const hasTrickOnTable = eng.state.currentTrick.plays.length > 0;
        if (hasTrickOnTable) {
          if (eng.state.wish.active && eng.state.wish.wishedRank !== null) {
            const player = eng.state.players[currentPlayer];
            const currentTop = eng.state.currentTrick.plays[eng.state.currentTrick.plays.length - 1].combination;
            const playable = findPlayableFromHand(player.hand, currentTop, eng.state.wish);
            const wishedPlays = playable.filter((cards) =>
              cards.some((c) => c.type === 'normal' && c.rank === eng.state.wish.wishedRank)
            );
            if (wishedPlays.length > 0) {
              const cheapest = wishedPlays.sort((a, b) => a.length - b.length)[0];
              events = eng.playCards(currentPlayer, cheapest.map((c) => c.id));
            } else {
              events = eng.passTurn(currentPlayer);
            }
          } else {
            events = eng.passTurn(currentPlayer);
          }
        } else {
          const player = eng.state.players[currentPlayer];
          const lowestCard = player.hand[0];
          events = eng.playCards(currentPlayer, [lowestCard.id]);
        }

        for (const event of events) {
          this.emit(roomCode, 'game:event', event);
        }
        this.broadcastGameState(roomCode);
      } catch (err) {
        console.error(`Turn timer auto-action error in room ${roomCode}:`, err);
      }
    }, TURN_TIMEOUT_MS);

    this.turnTimers.set(roomCode, timer);
  }

  // ─── Disconnect → Bot Replacement ──────────────────────────────────

  cancelDisconnectTimer(roomCode: string, position: PlayerPosition): void {
    const timerKey = `${roomCode}-${position}`;
    const existing = this.disconnectTimers.get(timerKey);
    if (existing) {
      clearTimeout(existing);
      this.disconnectTimers.delete(timerKey);
    }
  }

  scheduleDisconnectReplace(roomCode: string, position: PlayerPosition, nickname: string): void {
    const timerKey = `${roomCode}-${position}`;
    const existing = this.disconnectTimers.get(timerKey);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.disconnectTimers.delete(timerKey);

      const roomBeforeReplace = this.rooms.getRoom(roomCode);
      const playerBeforeReplace = roomBeforeReplace?.players.get(position);
      if (playerBeforeReplace?.userId) {
        if (!this.disconnectedPlayers.has(roomCode)) {
          this.disconnectedPlayers.set(roomCode, new Map());
        }
        this.disconnectedPlayers.get(roomCode)!.set(position, playerBeforeReplace.userId);
      }

      const replaced = this.rooms.replacePlayerWithBot(roomCode, position);
      if (!replaced) return;

      const room = this.rooms.getRoom(roomCode);
      if (!room) return;

      const botPlayer = room.players.get(position);
      const botName = botPlayer?.nickname ?? 'Bot';

      this.emit(roomCode, 'room:player_disconnected', `${nickname} was replaced by ${botName}`);
      this.broadcastGameState(roomCode);
    }, DISCONNECT_REPLACE_MS);

    this.disconnectTimers.set(timerKey, timer);
  }

  // ─── Dog / Trick Won Delays ────────────────────────────────────────

  scheduleDogResolve(roomCode: string): void {
    const existing = this.dogTimers.get(roomCode);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.dogTimers.delete(roomCode);
      const room = this.rooms.getRoom(roomCode);
      if (!room || !room.engine || !room.engine.state.dogPending) return;

      try {
        const events = room.engine.resolveDog();
        for (const event of events) {
          this.emit(roomCode, 'game:event', event);
        }
        this.broadcastGameState(roomCode);
      } catch (err) {
        console.error(`Dog resolve error in room ${roomCode}:`, err);
      }
    }, 1500);

    this.dogTimers.set(roomCode, timer);
  }

  scheduleTrickWonResolve(roomCode: string): void {
    const existing = this.trickWonTimers.get(roomCode);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.trickWonTimers.delete(roomCode);
      const room = this.rooms.getRoom(roomCode);
      if (!room || !room.engine || !room.engine.state.trickWonPending) return;

      try {
        const events = room.engine.completeTrickWon();
        for (const event of events) {
          this.emit(roomCode, 'game:event', event);
        }
        this.broadcastGameState(roomCode);
      } catch (err) {
        console.error(`Trick won resolve error in room ${roomCode}:`, err);
      }
    }, 1200);

    this.trickWonTimers.set(roomCode, timer);
  }
}
