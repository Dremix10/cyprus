import type { Room, RoomManager } from './RoomManager.js';
import { writeFileSync, appendFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const ROOMS_PERSIST_FILE = join(DATA_DIR, 'persisted-rooms.json');

try { mkdirSync(DATA_DIR, { recursive: true }); } catch { /* ignore */ }

export class GamePersistence {
  private persistTimer: NodeJS.Timeout | null = null;

  constructor(private rooms: RoomManager) {}

  destroy(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistRoomsSync();
  }

  /** Save latest game state snapshot and move log to disk for debugging. */
  saveGameState(roomCode: string, room: Room): void {
    try {
      const engine = room.engine;
      if (!engine) return;

      const snapshot = {
        roomCode,
        timestamp: new Date().toISOString(),
        phase: engine.state.phase,
        currentPlayer: engine.state.currentPlayer,
        scores: engine.state.scores,
        roundScores: engine.state.roundScores,
        finishOrder: engine.state.finishOrder,
        currentTrick: engine.state.currentTrick,
        wish: engine.state.wish,
        dragonWinner: engine.state.dragonWinner,
        players: engine.state.players.map((p) => ({
          position: p.position,
          nickname: p.nickname,
          hand: p.hand.map((c) => c.id),
          cardCount: p.hand.length,
          tichuCall: p.tichuCall,
          isOut: p.isOut,
          finishOrder: p.finishOrder,
          hasPlayedCards: p.hasPlayedCards,
          wonTricksCount: p.wonTricks.length,
          collectedCards: p.wonTricks.reduce((sum, t) => sum + t.length, 0),
        })),
        isSolo: room.botPositions.size > 0,
        botDifficulty: room.botDifficulty,
      };

      writeFileSync(
        join(DATA_DIR, `latest-game-${roomCode}.json`),
        JSON.stringify(snapshot, null, 2)
      );

      const logLine = {
        t: snapshot.timestamp,
        phase: snapshot.phase,
        currentPlayer: snapshot.currentPlayer,
        trick: snapshot.currentTrick.plays.map((p) => ({
          pos: p.playerPosition,
          cards: p.combination.cards.map((c) => c.id),
          type: p.combination.type,
        })),
        trickWinner: snapshot.currentTrick.currentWinner,
        finishOrder: snapshot.finishOrder,
        scores: snapshot.scores,
        roundScores: snapshot.roundScores,
        players: snapshot.players.map((p) => ({
          pos: p.position,
          name: p.nickname,
          cards: p.cardCount,
          hand: p.hand,
          tichu: p.tichuCall,
          out: p.isOut,
          finishPos: p.finishOrder,
        })),
      };

      appendFileSync(
        join(DATA_DIR, `game-log-${roomCode}.jsonl`),
        JSON.stringify(logLine) + '\n'
      );
    } catch {
      // Don't crash the game if saving fails
    }
  }

  /** Save all active rooms with games to disk (debounced — at most once per 5s). */
  persistRooms(): void {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.persistRoomsSync();
    }, 5_000);
  }

  /** Immediate synchronous persist (used by debounce timer and shutdown). */
  persistRoomsSync(): void {
    try {
      mkdirSync(DATA_DIR, { recursive: true });
      const data = this.rooms.serializeRooms();
      writeFileSync(ROOMS_PERSIST_FILE, JSON.stringify(data));
    } catch {
      // Don't crash if persistence fails
    }
  }

  /** Load persisted rooms from disk (call on server startup). Returns restored room data. */
  loadPersistedRooms(): unknown[] {
    try {
      if (!existsSync(ROOMS_PERSIST_FILE)) return [];
      const raw = readFileSync(ROOMS_PERSIST_FILE, 'utf-8');
      const data = JSON.parse(raw);
      this.rooms.restoreRooms(data);
      writeFileSync(ROOMS_PERSIST_FILE, '[]');
      return data;
    } catch {
      return [];
    }
  }
}

