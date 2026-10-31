import { io, type Socket } from 'socket.io-client';
import type { APIRequestContext } from '@playwright/test';
import { uniqueIp } from './api';

/** A raw Socket.IO client (Node) for setting up rooms the UI cannot reach directly. */
export async function connectSocket(baseURL: string, opts: { authCookie?: string } = {}): Promise<Socket> {
  const headers: Record<string, string> = { 'x-forwarded-for': uniqueIp() };
  if (opts.authCookie) headers.cookie = `cyprus_auth=${opts.authCookie}`;
  const socket = io(baseURL, {
    transports: ['websocket'],
    extraHeaders: headers,
    forceNew: true,
    reconnection: false,
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('socket connect timeout')), 8_000);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
  return socket;
}

export function emitAck<T = any>(socket: Socket, event: string, ...args: unknown[]): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ack for ${event}`)), 8_000);
    socket.emit(event, ...args, (res: T) => {
      clearTimeout(timer);
      resolve(res);
    });
  });
}

export async function authCookieOf(api: APIRequestContext): Promise<string> {
  const state = await api.storageState();
  const cookie = state.cookies.find((c) => c.name === 'cyprus_auth');
  if (!cookie) throw new Error('no cyprus_auth cookie on this request context');
  return cookie.value;
}
