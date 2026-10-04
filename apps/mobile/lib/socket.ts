import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@cyprus/shared';
import { BASE_URL } from './config';
import { getSocketToken } from './token';

export type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * One connection for the whole game. WebSocket first, polling fallback, reconnect forever.
 * Guests send no token. A signed-in phone sends the same session token the website
 * keeps in its cookie. autoConnect is off until that token has been read from the keychain.
 */
export const socket: TypedSocket = io(BASE_URL, {
  autoConnect: false,
  transports: ['websocket', 'polling'],
  upgrade: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 8000,
  timeout: 15000,
  auth: (cb) => cb({ token: getSocketToken() ?? '' }),
});
