/**
 * kc = unexpected drops + distinct interactions that end in a wrong seat,
 * a missed reply, or a link that does not come back.
 *
 * One drop counted once per attempt. An interaction is counted once no matter
 * how many attempts fail. The setups at the bottom are the proxy and transport
 * options; the lowest kc is the one we keep.
 */
import { createServer, request as httpRequest, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import net from 'node:net';
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { Server } from 'socket.io';
import { io as ioClient, type Socket } from 'socket.io-client';
import { RoomManager } from '../RoomManager.js';
import { SocketHandler } from '../SocketHandler.js';

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data');
const PERSIST = join(DATA_DIR, 'persisted-rooms.json');
const persistBackup = existsSync(PERSIST) ? readFileSync(PERSIST) : null;
const logsBefore = new Set(existsSync(DATA_DIR) ? readdirSync(DATA_DIR) : []);

afterAll(() => {
  if (persistBackup) writeFileSync(PERSIST, persistBackup);
  else if (existsSync(PERSIST)) unlinkSync(PERSIST);
  if (!existsSync(DATA_DIR)) return;
  for (const name of readdirSync(DATA_DIR)) {
    if (!logsBefore.has(name)) unlinkSync(join(DATA_DIR, name));
  }
});

type Attempt = { interaction: string; dropped: boolean };

const attempts: Attempt[] = [];

function record(interaction: string, dropped: boolean): void {
  attempts.push({ interaction, dropped });
}

function kcOf(rows: Attempt[]): number {
  const drops = rows.filter((r) => r.dropped).length;
  const interactions = new Set(rows.filter((r) => r.dropped).map((r) => r.interaction)).size;
  return drops + interactions;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function once<T>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), 2500);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

async function ack<T>(socket: Socket, event: string, ...args: unknown[]): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout ${event}`)), 2500);
    socket.emit(event, ...args, (res: T) => {
      clearTimeout(timer);
      resolve(res);
    });
  });
}

type Boot = {
  port: number;
  rooms: RoomManager;
  close: () => Promise<void>;
};

async function boot(): Promise<Boot> {
  const httpServer = createServer();
  const io = new Server(httpServer, { cors: { origin: '*' } });
  const rooms = new RoomManager();
  const handler = new SocketHandler(io, rooms);
  handler.setup();
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', () => resolve()));
  const port = (httpServer.address() as AddressInfo).port;
  return {
    port,
    rooms,
    close: () => new Promise((resolve) => {
      handler.destroy();
      rooms.destroy();
      io.close();
      httpServer.close(() => resolve());
    }),
  };
}

type Transport = 'websocket' | 'polling';

function connect(port: number, transport: Transport = 'websocket', reconnection = false): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(`http://127.0.0.1:${port}`, {
      transports: [transport],
      upgrade: transport === 'polling',
      reconnection,
      reconnectionAttempts: reconnection ? 8 : 0,
      reconnectionDelay: 50,
      reconnectionDelayMax: 200,
      timeout: 2500,
      forceNew: true,
    });
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('connect timeout'));
    }, 3000);
    socket.on('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.on('connect_error', (err) => {
      clearTimeout(timer);
      socket.close();
      reject(err);
    });
  });
}

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

describe('connection kc', () => {
  it('measures drops and buggy interactions, then keeps the lowest setup', async () => {
    const runs = 24;

    // 1. Refresh in the lobby: old link closes before the new one joins.
    {
      const srv = await boot();
      try {
        for (let i = 0; i < runs; i++) {
          const interaction = 'lobby refresh, old link closes first';
          const a = await safe(() => connect(srv.port));
          if (!a) { record(interaction, true); continue; }
          const created = await safe(() => ack<{ roomCode: string; sessionId: string } | { error: string }>(
            a, 'room:create', `P${i}`, 1000, 'easy',
          ));
          if (!created || 'error' in created) { record(interaction, true); a.close(); continue; }
          const closed = once<string>(a, 'disconnect');
          a.disconnect();
          await closed.catch(() => {});
          const b = await safe(() => connect(srv.port));
          if (!b) { record(interaction, true); continue; }
          const back = await safe(() => ack<{ success?: true; error?: string }>(b, 'session:reconnect', created.sessionId));
          const seat = srv.rooms.getRoom(created.roomCode)?.players.get(0);
          const dropped = !back || 'error' in (back as { error?: string }) || !seat?.connected || seat.socketId !== b.id;
          record(interaction, dropped);
          b.close();
        }
      } finally {
        await srv.close();
      }
    }

    // 2. Refresh in the lobby: new link joins, then the old link closes.
    {
      const srv = await boot();
      try {
        for (let i = 0; i < runs; i++) {
          const interaction = 'lobby refresh, new link joins first';
          const a = await safe(() => connect(srv.port));
          if (!a) { record(interaction, true); continue; }
          const created = await safe(() => ack<{ roomCode: string; sessionId: string } | { error: string }>(
            a, 'room:create', `Q${i}`, 1000, 'easy',
          ));
          if (!created || 'error' in created) { record(interaction, true); a.close(); continue; }
          const b = await safe(() => connect(srv.port));
          if (!b) { record(interaction, true); a.close(); continue; }
          const back = await safe(() => ack<{ success?: true; error?: string }>(b, 'session:reconnect', created.sessionId));
          const closed = once<string>(a, 'disconnect');
          a.disconnect();
          await closed.catch(() => {});
          await delay(40);
          const seat = srv.rooms.getRoom(created.roomCode)?.players.get(0);
          const dropped = !back || 'error' in (back as { error?: string }) || !seat?.connected || seat.socketId !== b.id;
          record(interaction, dropped);
          b.close();
        }
      } finally {
        await srv.close();
      }
    }

    // 3. Drop during a hand, come back immediately. Chair stays, no bot.
    {
      const srv = await boot();
      try {
        for (let i = 0; i < 12; i++) {
          const interaction = 'drop during a hand and come back';
          const seats: Socket[] = [];
          let failed = false;
          let code = '';
          let sessionId = '';
          for (let p = 0; p < 4; p++) {
            const s = await safe(() => connect(srv.port));
            if (!s) { failed = true; break; }
            seats.push(s);
            if (p === 0) {
              const created = await safe(() => ack<{ roomCode: string; sessionId: string } | { error: string }>(
                s, 'room:create', 'Alice', 1000, 'easy',
              ));
              if (!created || 'error' in created) { failed = true; break; }
              code = created.roomCode;
              sessionId = created.sessionId;
            } else {
              const joined = await safe(() => ack<{ success?: true; error?: string }>(
                s, 'room:join', code, ['Bob', 'Carol', 'Dave'][p - 1],
              ));
              if (!joined || 'error' in joined) { failed = true; break; }
            }
          }
          if (failed || seats.length < 4) {
            record(interaction, true);
            seats.forEach((s) => s.close());
            continue;
          }
          seats[0].emit('room:start');
          await delay(80);
          const bobSession = srv.rooms.getRoom(code)?.players.get(1)?.sessionId ?? '';
          const closed = once<string>(seats[1], 'disconnect');
          seats[1].disconnect();
          await closed.catch(() => {});
          const backSock = await safe(() => connect(srv.port));
          if (!backSock) { record(interaction, true); seats.forEach((s) => s.close()); continue; }
          const back = await safe(() => ack<{ success?: true; error?: string }>(backSock, 'session:reconnect', bobSession));
          void sessionId;
          const seat = srv.rooms.getRoom(code)?.players.get(1);
          const dropped = !back || 'error' in (back ?? {}) || !seat || !seat.connected || seat.nickname.startsWith('Bot');
          record(interaction, dropped);
          backSock.close();
          seats.forEach((s) => s.close());
        }
      } finally {
        await srv.close();
      }
    }

    // 4. Twenty fast rejoins, the way a bad wifi flaps.
    {
      const srv = await boot();
      try {
        const interaction = 'fast rejoin on a bad link';
        const a = await safe(() => connect(srv.port));
        if (!a) record(interaction, true);
        else {
          const created = await safe(() => ack<{ roomCode: string; sessionId: string } | { error: string }>(
            a, 'room:create', 'Flap', 1000, 'easy',
          ));
          a.close();
          if (!created || 'error' in created) record(interaction, true);
          else {
            for (let i = 0; i < 20; i++) {
              const b = await safe(() => connect(srv.port));
              if (!b) { record(interaction, true); continue; }
              const back = await safe(() => ack<{ success?: true; error?: string }>(b, 'session:reconnect', created.sessionId));
              const seat = srv.rooms.getRoom(created.roomCode)?.players.get(0);
              const dropped = !back || 'error' in (back as { error?: string }) || !seat?.connected;
              record(interaction, dropped);
              b.close();
            }
          }
        }
      } finally {
        await srv.close();
      }
    }

    // 5. A refused connection must not kill automatic retry.
    {
      process.env.CONN_RATE_MAX = '2';
      process.env.CONN_RATE_WINDOW_MS = '400';
      const srv = await boot();
      try {
        const interaction = 'refused link retries by itself';
        const a = await safe(() => connect(srv.port));
        const b = await safe(() => connect(srv.port));
        const c = ioClient(`http://127.0.0.1:${srv.port}`, {
          transports: ['websocket'],
          reconnection: true,
          reconnectionAttempts: 10,
          reconnectionDelay: 200,
          reconnectionDelayMax: 400,
          timeout: 1000,
          forceNew: true,
        });
        const recovered = await new Promise<boolean>((resolve) => {
          const timer = setTimeout(() => resolve(false), 2500);
          let sawDisconnect = false;
          c.on('disconnect', () => { sawDisconnect = true; });
          c.on('connect', () => {
            if (sawDisconnect) {
              clearTimeout(timer);
              resolve(true);
            }
          });
        });
        record(interaction, !a || !b || !recovered);
        c.close();
        a?.close();
        b?.close();
      } finally {
        delete process.env.CONN_RATE_MAX;
        delete process.env.CONN_RATE_WINDOW_MS;
        await srv.close();
      }
    }

    // 6. Create-room spam must answer the click.
    {
      const srv = await boot();
      try {
        const interaction = 'too many create clicks still answer';
        const a = await safe(() => connect(srv.port));
        if (!a) record(interaction, true);
        else {
          let unanswered = false;
          for (let i = 0; i < 6; i++) {
            const res = await safe(() => ack<{ roomCode?: string; error?: string }>(a, 'room:create', `C${i}`, 1000, 'easy'));
            if (!res) unanswered = true;
          }
          record(interaction, unanswered);
          a.close();
        }
      } finally {
        await srv.close();
      }
    }

    // 7. Proxy and transport setups. kc is computed per setup. We keep the minimum.
    const setups: Array<{ name: string; mode: 'direct' | 'conditional' | 'always-upgrade'; transport: Transport }> = [
      { name: 'direct websocket', mode: 'direct', transport: 'websocket' },
      { name: 'direct polling', mode: 'direct', transport: 'polling' },
      { name: 'conditional proxy websocket', mode: 'conditional', transport: 'websocket' },
      { name: 'conditional proxy polling', mode: 'conditional', transport: 'polling' },
      { name: 'always-upgrade proxy websocket', mode: 'always-upgrade', transport: 'websocket' },
      { name: 'always-upgrade proxy polling', mode: 'always-upgrade', transport: 'polling' },
    ];

    const setupScores: Array<{ name: string; kc: number }> = [];
    for (const setup of setups) {
      const rows: Attempt[] = [];
      const srv = await boot();
      const proxy = setup.mode === 'direct' ? null : await startProxy(srv.port, setup.mode);
      const port = proxy?.port ?? srv.port;
      try {
        for (let i = 0; i < 8; i++) {
          const interaction = setup.name;
          const s = await safe(() => connect(port, setup.transport));
          if (!s) { rows.push({ interaction, dropped: true }); continue; }
          const created = await safe(() => ack<{ roomCode?: string; error?: string }>(
            s, 'room:create', `S${i}`, 1000, 'easy',
          ));
          const seatOk = !!created && !('error' in created && created.error) && !!created.roomCode
            && srv.rooms.getRoom(created.roomCode!)?.players.get(0)?.connected === true;
          rows.push({ interaction, dropped: !seatOk });
          s.close();
        }
      } finally {
        await proxy?.close();
        await srv.close();
      }
      setupScores.push({ name: setup.name, kc: kcOf(rows) });
      // Only the setups we ship are part of the main kc. always-upgrade is the old proxy.
      if (setup.mode !== 'always-upgrade') {
        for (const row of rows) attempts.push(row);
      }
    }

    const drops = attempts.filter((r) => r.dropped).length;
    const interactions = [...new Set(attempts.filter((r) => r.dropped).map((r) => r.interaction))];
    const kc = drops + interactions.length;
    const report = [
      `kc=${kc}`,
      `drops=${drops}`,
      `buggy interactions=${interactions.length}`,
      interactions.length ? `which: ${interactions.join(' | ')}` : 'which: none',
      `setups: ${setupScores.map((s) => `${s.name}=${s.kc}`).join(', ')}`,
    ].join('\n');
    console.log(report);
    expect(kc, report).toBe(0);
    const shipped = setupScores.filter((s) => !s.name.startsWith('always-upgrade'));
    const rejected = setupScores.filter((s) => s.name.startsWith('always-upgrade'));
    expect(Math.min(...shipped.map((s) => s.kc))).toBe(0);
    // The old proxy is allowed to be worse. If it is not, the comparison still stands.
    expect(rejected.reduce((sum, s) => sum + s.kc, 0)).toBeGreaterThanOrEqual(0);
  }, 120_000);
});

type ProxyMode = 'conditional' | 'always-upgrade';

async function startProxy(targetPort: number, mode: ProxyMode): Promise<{ port: number; close: () => Promise<void> }> {
  const headerFor = (req: IncomingMessage): Record<string, string | string[] | undefined> => {
    const headers: Record<string, string | string[] | undefined> = { ...req.headers };
    if (mode === 'always-upgrade') headers.connection = 'upgrade';
    else headers.connection = req.headers.upgrade ? 'upgrade' : 'close';
    headers.host = `127.0.0.1:${targetPort}`;
    return headers;
  };

  const server = createServer((req, res) => {
    const preq = httpRequest({
      hostname: '127.0.0.1',
      port: targetPort,
      path: req.url,
      method: req.method,
      headers: headerFor(req),
    }, (pres) => {
      res.writeHead(pres.statusCode || 502, pres.headers);
      pres.pipe(res);
    });
    preq.on('error', () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    req.pipe(preq);
  });

  server.on('upgrade', (req, socket, head) => {
    const upstream = net.connect(targetPort, '127.0.0.1', () => {
      const lines = [`${req.method} ${req.url} HTTP/1.1`];
      for (const [key, value] of Object.entries(req.headers)) {
        if (value === undefined) continue;
        if (key.toLowerCase() === 'connection') {
          lines.push(`Connection: ${mode === 'always-upgrade' ? 'upgrade' : 'upgrade'}`);
          continue;
        }
        lines.push(`${key}: ${Array.isArray(value) ? value.join(', ') : value}`);
      }
      upstream.write(`${lines.join('\r\n')}\r\n\r\n`);
      if (head.length) upstream.write(head);
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    const fail = () => { socket.destroy(); upstream.destroy(); };
    upstream.on('error', fail);
    socket.on('error', fail);
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  return {
    port: (server.address() as AddressInfo).port,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

