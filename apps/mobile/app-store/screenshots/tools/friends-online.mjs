#!/usr/bin/env node
// Keep the showcase friends marked `friend: 'online'` (Μαρία, Kostas Lim, Panikos) connected to the
// screenshot server, so Friends shows them Online and they accept table invites from Andreas.
// Based on apps/mobile/e2e/helpers/qa-friend.mjs, for several users and port 3321.
//
//   node friends-online.mjs            # all online friends, auto-accept invites (staggered)
//   ACCEPT=0 node friends-online.mjs   # stay online, never accept
//   ONLY=maria_p,kostas_lim node friends-online.mjs
// Stops on Ctrl-C or after SHOTS_TIMEOUT_S (default 1800).
import { io } from 'socket.io-client';
import { BASE, PLAYERS, ensureUser } from './shots-common.mjs';

const accept = process.env.ACCEPT !== '0';
const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const timeoutS = Number(process.env.SHOTS_TIMEOUT_S ?? 1800);
const friends = PLAYERS.filter((p) => p.friend === 'online' && (!only || only.has(p.username)));
const log = (who, line) => console.log(`${new Date().toISOString().slice(11, 19)} [${who}] ${line}`);

const sockets = [];
friends.forEach(async (profile, i) => {
  const { token, user } = await ensureUser(profile);
  const name = user.displayName;
  let currentRoom = null;
  let accepting = false;
  const socket = io(BASE, { transports: ['websocket'], auth: { token }, reconnection: true });
  sockets.push(socket);
  socket.on('connect', () => log(name, `ONLINE userId=${user.id}`));
  socket.on('disconnect', (reason) => log(name, `OFFLINE ${reason}`));
  socket.on('connect_error', (err) => log(name, `CONNECT_ERROR ${err.message}`));
  socket.on('friend:invite:received', (data) => {
    log(name, `INVITE from=${data.inviterName} room=${data.roomCode}`);
    if (!accept || accepting || currentRoom === data.roomCode) return;
    // Stagger so the seats fill one by one, like real people.
    setTimeout(() => {
      if (currentRoom && currentRoom !== data.roomCode) {
        // Still seated in an older room: leave the way the apps do (drop + reconnect). On reconnect
        // the server re-sends the pending invite, which lands back here.
        log(name, `LEAVING ${currentRoom}`);
        currentRoom = null;
        socket.disconnect();
        socket.connect();
        return;
      }
      accepting = true;
      socket.emit('friend:invite:accept', (res) => {
        accepting = false;
        if ('error' in res) return log(name, `ACCEPT_ERROR ${res.error}`);
        currentRoom = res.roomCode;
        log(name, `ACCEPTED room=${res.roomCode}`);
      });
    }, 1200 + i * 1500);
  });
  socket.on('room:state', (state) => {
    log(name, `ROOM ${state.roomCode ?? currentRoom} players=[${(state.players ?? []).map((p) => `${p.nickname}@${p.position}`).join(', ')}]`);
  });
  socket.on('game:state', (g) => {
    if (g.phase) log(name, `GAME phase=${g.phase}`);
  });
});

const stop = () => {
  for (const s of sockets) s.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setTimeout(stop, timeoutS * 1000);
