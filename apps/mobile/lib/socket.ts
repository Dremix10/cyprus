import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@cyprus/shared';
import { BASE_URL } from './config';

export type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * One connection for the whole game. WebSocket first, polling fallback, reconnect forever.
 * Guests send no cookie; the server always accepts the handshake.
 */
export const socket: TypedSocket = io(BASE_URL, {
  transports: ['websocket', 'polling'],
  upgrade: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 8000,
  timeout: 15000,
});
