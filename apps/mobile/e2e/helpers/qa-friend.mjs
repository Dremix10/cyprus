#!/usr/bin/env node
// A scripted, signed-in second player for the friend-invite Maestro flows.
//
//   node apps/mobile/e2e/helpers/qa-friend.mjs [friend|friend2]
//
// Logs in as qa_friend (or qa_friend2), stays online on the local QA server, and auto-accepts
// every friend:invite:received after ACCEPT_DELAY_MS (default 1500). Prints one line per event:
//   ONLINE <name> userId=<id>
//   INVITE from=<inviterName> room=<roomCode>
//   ACCEPTED room=<roomCode>          or  ACCEPT_ERROR <message>
//   ROOM <roomCode> players=[A@0, B@1]
// Set ACCEPT=0 to only log invites. Set START_AFTER_MS=<n> to emit room:start n ms after each
// accepted invite (any seated player may start). Exits after QA_TIMEOUT_S (default 900) or on SIGTERM/SIGINT.
import { io } from 'socket.io-client';
import { BASE, USERS, ensureUser } from './qa-common.mjs';

const who = process.argv[2] ?? 'friend';
const profile = USERS[who];
if (!profile) {
  console.error(`unknown user "${who}" (use friend or friend2)`);
  process.exit(2);
}
const accept = process.env.ACCEPT !== '0';
const delay = Number(process.env.ACCEPT_DELAY_MS ?? 1500);
const timeoutS = Number(process.env.QA_TIMEOUT_S ?? 900);
const startAfter = process.env.START_AFTER_MS ? Number(process.env.START_AFTER_MS) : null;

const { token, user } = await ensureUser(profile);
const log = (line) => console.log(`${new Date().toISOString().slice(11, 19)} ${line}`);

let currentRoom = null;
const socket = io(BASE, { transports: ['websocket'], auth: { token }, reconnection: true });

socket.on('connect', () => log(`ONLINE ${user.displayName} userId=${user.id}`));
socket.on('disconnect', (reason) => log(`OFFLINE ${reason}`));
socket.on('connect_error', (err) => log(`CONNECT_ERROR ${err.message}`));

let accepting = false;
const doAccept = () => {
  if (accepting) return;
  accepting = true;
  socket.emit('friend:invite:accept', (res) => {
    accepting = false;
    if ('error' in res) return log(`ACCEPT_ERROR ${res.error}`);
    currentRoom = res.roomCode;
    log(`ACCEPTED room=${res.roomCode}`);
    if (startAfter !== null) {
      setTimeout(() => {
        log(`START room=${res.roomCode}`);
        socket.emit('room:start');
      }, startAfter);
    }
  });
};
let lastPhase = null;
socket.on('game:state', (g) => {
  if (g.phase !== lastPhase) log(`GAME ${g.roomCode ?? currentRoom} phase=${(lastPhase = g.phase)}`);
});
socket.on('game:error', (msg) => log(`GAME_ERROR ${msg}`));

socket.on('friend:invite:received', (data) => {
  log(`INVITE from=${data.inviterName} room=${data.roomCode}`);
  if (!accept || currentRoom === data.roomCode) return;
  setTimeout(() => {
    if (currentRoom && currentRoom !== data.roomCode) {
      // Still seated in an older room: leave it the way the apps do (drop + reconnect).
      // On reconnect the server re-sends the pending invite, which lands back here.
      log(`LEAVING ${currentRoom}`);
      currentRoom = null;
      socket.disconnect();
      socket.connect();
      return;
    }
    doAccept();
  }, delay);
});
socket.on('friend:invite:cleared', () => log('INVITE_CLEARED'));

socket.on('room:state', (state) => {
  const players = (state.players ?? []).map((p) => `${p.nickname}@${p.position}`).join(', ');
  log(`ROOM ${state.roomCode ?? currentRoom} players=[${players}]`);
});

const stop = () => {
  log('STOP');
  socket.close();
  process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
setTimeout(stop, timeoutS * 1000);
