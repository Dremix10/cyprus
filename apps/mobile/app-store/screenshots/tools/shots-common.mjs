// Shared helpers for the screenshot server (port 3321). Copied from apps/mobile/e2e/helpers/qa-common.mjs
// and pointed at 3321. Refuses anything but localhost, so it can never touch https://aegist.dev.

export const BASE = (process.env.SHOTS_SERVER_URL ?? 'http://localhost:3321').replace(/\/+$/, '');
{
  const u = new URL(BASE);
  if (!['localhost', '127.0.0.1'].includes(u.hostname)) {
    console.error(`Refusing to run against ${BASE}: screenshot helpers only talk to a local server.`);
    process.exit(2);
  }
  if (['3301', '3311', '3001'].includes(u.port)) {
    console.error(`Refusing port ${u.port}: that belongs to another QA server or production.`);
    process.exit(2);
  }
}

/** Disposable local-only password for every seeded account (never used on production). */
export const SHOTS_PASSWORD = process.env.SHOTS_PASSWORD ?? 'showcase-pass-123';

/** The phone's owner in every screenshot. Username is what Maestro types to sign in. */
export const SHOWCASE = { username: 'andreas_cy', displayName: 'Andreas', avatar: 'poseidon' };

/**
 * Leaderboard regulars: Greek and Cypriot names, written the way people really type them
 * (some in Greek script, some in Latin). Display names: max 20 chars, letters/digits/space/_/-.
 * `friend: 'online'` = kept online by friends-online.mjs; `friend: 'offline'` = friend, not connected.
 */
export const PLAYERS = [
  { username: 'stelios_k', displayName: 'Στέλιος Κ', elo: 1648, gp: 312, wr: 0.63, avatar: 'zeus' },
  { username: 'maria_p', displayName: 'Μαρία', elo: 1601, gp: 241, wr: 0.61, avatar: 'athena', friend: 'online' },
  { username: 'kostas_lim', displayName: 'Kostas Lim', elo: 1577, gp: 198, wr: 0.6, avatar: 'ares', friend: 'online' },
  { username: 'eleni_ch', displayName: 'Ελένη Χ', elo: 1549, gp: 176, wr: 0.58, avatar: 'artemis', friend: 'offline' },
  { username: 'panikos', displayName: 'Panikos', elo: 1532, gp: 264, wr: 0.56, avatar: 'dionysus', friend: 'online' },
  { username: 'georgia_n', displayName: 'Γεωργία', elo: 1514, gp: 133, wr: 0.57, avatar: 'hera' },
  // SHOWCASE (Andreas) slots in here with elo 1498
  { username: 'christos_m', displayName: 'Χρίστος', elo: 1483, gp: 154, wr: 0.54, avatar: 'hermes', friend: 'offline' },
  { username: 'loukia', displayName: 'Loukia', elo: 1467, gp: 97, wr: 0.55, avatar: 'aphrodite', friend: 'offline' },
  { username: 'michalis_v', displayName: 'Μιχάλης', elo: 1452, gp: 121, wr: 0.53, avatar: 'hephaestus' },
  { username: 'sofia_a', displayName: 'Σοφία Α', elo: 1430, gp: 88, wr: 0.52, avatar: 'demeter' },
  { username: 'nikos_thess', displayName: 'Nikos Thess', elo: 1418, gp: 143, wr: 0.51, avatar: 'apollo' },
  { username: 'dimitra', displayName: 'Δήμητρα', elo: 1401, gp: 64, wr: 0.52, avatar: 'athena' },
  { username: 'pavlos_k', displayName: 'Παύλος', elo: 1388, gp: 112, wr: 0.49, avatar: 'zeus' },
  { username: 'katerina_r', displayName: 'Katerina R', elo: 1372, gp: 57, wr: 0.5, avatar: 'artemis' },
  { username: 'antonis', displayName: 'Αντώνης', elo: 1350, gp: 79, wr: 0.47, avatar: 'poseidon' },
  { username: 'yiannis_lar', displayName: 'Yiannis Larnaca', elo: 1336, gp: 45, wr: 0.47, avatar: 'ares' },
  { username: 'froso', displayName: 'Φρόσω', elo: 1321, gp: 38, wr: 0.45, avatar: 'hera' },
];

let ipSeq = Math.floor(Math.random() * 200) + 1;
/** Auth routes allow 5 req/min per IP; trust proxy is on, so a fresh X-Forwarded-For per call avoids it. */
function fakeIp() {
  ipSeq = (ipSeq % 250) + 1;
  return `10.88.${Math.floor(Math.random() * 250) + 1}.${ipSeq}`;
}

export async function http(path, { method = 'GET', body, token } = {}) {
  const headers = { Accept: 'application/json', 'X-Cyprus-Client': 'ios', 'X-Forwarded-For': fakeIp() };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, ok: res.ok, json };
}

/** Register (or log in if the username already exists). Returns { token, user }. */
export async function ensureUser({ username, displayName }, password = SHOTS_PASSWORD) {
  const reg = await http('/auth/register', {
    method: 'POST',
    body: { username, password, displayName, email: `${username}@shots.invalid` },
  });
  if (reg.ok && reg.json.token) return { token: reg.json.token, user: reg.json.user };
  const login = await http('/auth/login', { method: 'POST', body: { username, password } });
  if (!login.ok || !login.json.token) {
    throw new Error(`Could not register/login ${username}: ${reg.status} ${JSON.stringify(reg.json)} / ${login.status} ${JSON.stringify(login.json)}`);
  }
  return { token: login.json.token, user: login.json.user };
}

/** Make a and b friends (idempotent). */
export async function befriend(a, b) {
  await http('/api/friends/request', { method: 'POST', token: a.token, body: { friendId: b.user.id } });
  await http('/api/friends/accept', { method: 'POST', token: b.token, body: { userId: a.user.id } });
  const list = await http('/api/friends', { token: a.token });
  if (!Array.isArray(list.json) || !list.json.some((f) => f.id === b.user.id)) {
    throw new Error(`befriend failed: ${a.user.username} -> ${b.user.username}`);
  }
}
