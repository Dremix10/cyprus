import type { Server, Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  PlayerPosition,
  NormalRank,
} from '@cyprus/shared';
import { RoomManager } from './RoomManager.js';

type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;
type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export class SocketHandler {
  constructor(
    private io: TypedServer,
    private rooms: RoomManager
  ) {}

  setup(): void {
    this.io.on('connection', (socket) => {
      console.log(`Client connected: ${socket.id}`);

      socket.on('room:create', (nickname, callback) => {
        const result = this.rooms.createRoom(socket.id, nickname);
        if ('error' in result) {
          callback({ error: result.error });
          return;
        }
        socket.join(result.roomCode);
        callback({ roomCode: result.roomCode });
        this.broadcastRoomState(result.roomCode);
      });

      socket.on('room:join', (roomCode, nickname, callback) => {
        const result = this.rooms.joinRoom(socket.id, roomCode, nickname);
        if ('error' in result) {
          callback({ error: result.error });
          return;
        }
        socket.join(roomCode.toUpperCase());
        callback({ success: true });

        // If game is in progress (reconnect), send game state
        const info = this.rooms.getRoomForSocket(socket.id);
        if (info && info.room.engine) {
          const state = info.room.engine.getClientState(
            info.position,
            info.room.code
          );
          socket.emit('game:state', state);
          // Notify others of reconnection
          socket.to(info.room.code).emit('room:player_reconnected', nickname);
        } else {
          this.broadcastRoomState(roomCode.toUpperCase());
        }
      });

      socket.on('room:sit', (position) => {
        const success = this.rooms.sitAt(socket.id, position);
        if (success) {
          const info = this.rooms.getRoomForSocket(socket.id);
          if (info) this.broadcastRoomState(info.room.code);
        }
      });

      socket.on('room:start', () => {
        const result = this.rooms.startGame(socket.id);
        if (result.error) {
          socket.emit('game:error', result.error);
          return;
        }
        const info = this.rooms.getRoomForSocket(socket.id);
        if (info) this.broadcastGameState(info.room.code);
      });

      socket.on('game:grand_tichu_decision', (call) => {
        this.handleGameAction(socket, (engine, position) =>
          engine.grandTichuDecision(position, call)
        );
      });

      socket.on('game:pass_cards', (cards) => {
        this.handleGameAction(socket, (engine, position) =>
          engine.passCards(position, cards)
        );
      });

      socket.on('game:play', (cardIds) => {
        this.handleGameAction(socket, (engine, position) =>
          engine.playCards(position, cardIds)
        );
      });

      socket.on('game:pass_turn', () => {
        this.handleGameAction(socket, (engine, position) =>
          engine.passTurn(position)
        );
      });

      socket.on('game:call_tichu', () => {
        this.handleGameAction(socket, (engine, position) =>
          engine.callTichu(position)
        );
      });

      socket.on('game:dragon_give', (opponentPosition) => {
        this.handleGameAction(socket, (engine, position) =>
          engine.dragonGive(position, opponentPosition)
        );
      });

      socket.on('game:wish', (rank) => {
        this.handleGameAction(socket, (engine, position) =>
          engine.setWish(position, rank)
        );
      });

      socket.on('game:next_round', () => {
        this.handleGameAction(socket, (engine) => engine.nextRound());
      });

      socket.on('disconnect', () => {
        const result = this.rooms.handleDisconnect(socket.id);
        if (result) {
          this.io
            .to(result.roomCode)
            .emit('room:player_disconnected', result.nickname);
          this.broadcastRoomState(result.roomCode);
        }
      });
    });
  }

  private handleGameAction(
    socket: TypedSocket,
    action: (
      engine: import('./GameEngine.js').GameEngine,
      position: PlayerPosition
    ) => import('@cyprus/shared').GameEvent[]
  ): void {
    const info = this.rooms.getRoomForSocket(socket.id);
    if (!info || !info.room.engine) {
      socket.emit('game:error', 'No active game');
      return;
    }

    try {
      const events = action(info.room.engine, info.position);

      // Broadcast events to the room
      for (const event of events) {
        this.io.to(info.room.code).emit('game:event', event);
      }

      // Broadcast updated game state to each player
      this.broadcastGameState(info.room.code);
    } catch (err) {
      socket.emit('game:error', (err as Error).message);
    }
  }

  private broadcastRoomState(roomCode: string): void {
    const state = this.rooms.getRoomState(roomCode);
    if (state) {
      this.io.to(roomCode).emit('room:state', state);
    }
  }

  private broadcastGameState(roomCode: string): void {
    const room = this.rooms.getRoom(roomCode);
    if (!room || !room.engine) return;

    const sockets = this.rooms.getSocketIdsForRoom(roomCode);
    for (const [position, socketId] of sockets) {
      const state = room.engine.getClientState(position, roomCode);
      this.io.to(socketId).emit('game:state', state);
    }
  }
}
