import type { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@cyprus/shared';
import type { RoomManager } from './RoomManager.js';

type MatchSocket = Server<ClientToServerEvents, ServerToClientEvents>;

interface QueueEntry {
  socketId: string;
  nickname: string;
  targetScore: number;
  joinedAt: number;
}

const QUEUE_TIMEOUT_MS = 60_000; // 1 minute max wait
const MATCH_CHECK_INTERVAL_MS = 3_000; // check every 3 seconds
const UPDATE_INTERVAL_MS = 5_000; // send queue updates every 5 seconds

export class MatchmakingManager {
  private queue: QueueEntry[] = [];
  private matchCheckInterval: ReturnType<typeof setInterval>;
  private updateInterval: ReturnType<typeof setInterval>;

  constructor(
    private io: MatchSocket,
    private rooms: RoomManager,
    private onMatchCreated: (roomCode: string, socketIds: string[]) => void
  ) {
    this.matchCheckInterval = setInterval(() => this.processQueue(), MATCH_CHECK_INTERVAL_MS);
    this.updateInterval = setInterval(() => this.sendUpdates(), UPDATE_INTERVAL_MS);
  }

  destroy(): void {
    clearInterval(this.matchCheckInterval);
    clearInterval(this.updateInterval);
  }

  enqueue(socketId: string, nickname: string, targetScore: number): { success: true } | { error: string } {
    // Check if already in queue
    if (this.queue.some((e) => e.socketId === socketId)) {
      return { error: 'Already in queue' };
    }

    this.queue.push({
      socketId,
      nickname,
      targetScore,
      joinedAt: Date.now(),
    });

    // Immediate check — might already have enough players
    this.processQueue();

    return { success: true };
  }

  dequeue(socketId: string): { success: true } | { error: string } {
    const index = this.queue.findIndex((e) => e.socketId === socketId);
    if (index === -1) return { error: 'Not in queue' };
    this.queue.splice(index, 1);
    return { success: true };
  }

  /** Remove a player from queue on disconnect */
  handleDisconnect(socketId: string): void {
    const index = this.queue.findIndex((e) => e.socketId === socketId);
    if (index !== -1) this.queue.splice(index, 1);
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  private processQueue(): void {
    if (this.queue.length === 0) return;

    const now = Date.now();

    // Check if 4 players are ready — instant match
    if (this.queue.length >= 4) {
      const group = this.queue.splice(0, 4);
      this.createMatch(group);
      return;
    }

    // Check if oldest player has waited long enough to start with bots
    const oldest = this.queue[0];
    const elapsed = now - oldest.joinedAt;

    if (elapsed >= QUEUE_TIMEOUT_MS && this.queue.length >= 1) {
      // Time's up — start with however many humans we have (1-3)
      const group = this.queue.splice(0, Math.min(this.queue.length, 4));
      this.createMatch(group);
      return;
    }

    // If 3 players and waited 30+ seconds, start with 1 bot
    if (this.queue.length >= 3 && elapsed >= 30_000) {
      const group = this.queue.splice(0, 3);
      this.createMatch(group);
      return;
    }

    // If 2 players and waited 45+ seconds, start with 2 bots
    if (this.queue.length >= 2 && elapsed >= 45_000) {
      const group = this.queue.splice(0, 2);
      this.createMatch(group);
      return;
    }
  }

  private createMatch(players: QueueEntry[]): void {
    // Online matches are always 500 points for shorter games
    const targetScore = 500;

    // First player creates the room
    const creator = players[0];
    const createResult = this.rooms.createRoom(creator.socketId, creator.nickname, targetScore);
    if ('error' in createResult) {
      // Put players back in queue
      this.queue.unshift(...players);
      return;
    }

    const { roomCode, sessionId: creatorSessionId } = createResult;

    // Assign positions: if 2 humans, put them on opposite teams (pos 0 and 1)
    // Positions: 0 & 2 are team A, 1 & 3 are team B
    // So for 2 humans: pos 0 (team A) and pos 1 (team B) — opponents
    const socketIds = [creator.socketId];

    // Notify creator
    this.io.to(creator.socketId).emit('matchmaking:found', {
      roomCode,
      sessionId: creatorSessionId,
    });

    // Remaining players join the room
    for (let i = 1; i < players.length; i++) {
      const p = players[i];
      // Determine seat: for 2 humans, second goes to pos 1 (opponent)
      // For 3 humans, they go to 1 and 2. For 4, 1, 2, 3.
      const joinResult = this.rooms.joinRoom(p.socketId, roomCode, p.nickname);
      if ('error' in joinResult) continue;

      socketIds.push(p.socketId);

      this.io.to(p.socketId).emit('matchmaking:found', {
        roomCode,
        sessionId: joinResult.sessionId,
      });
    }

    // If 2 humans, reposition second human to position 1 (opposite team)
    // By default joinRoom puts them at next available position which should be 1
    // But let's ensure correct team placement for all cases
    if (players.length === 2) {
      // Player 0 is at pos 0 (team A), player 1 should be at pos 1 (team B)
      // joinRoom already places at first available (pos 1), so this is correct
    } else if (players.length === 3) {
      // 3 humans: pos 0, 1, 2 — one team has 2 humans, other has 1 + bot
      // This is fine and fair
    }

    // Start the game — this fills empty seats with bots
    this.rooms.startGame(creator.socketId);

    // Notify the callback to handle socket joins and game broadcast
    this.onMatchCreated(roomCode, socketIds);
  }

  private sendUpdates(): void {
    const now = Date.now();
    for (const entry of this.queue) {
      const elapsed = now - entry.joinedAt;
      this.io.to(entry.socketId).emit('matchmaking:update', {
        playersInQueue: this.queue.length,
        elapsed,
      });
    }
  }

}
