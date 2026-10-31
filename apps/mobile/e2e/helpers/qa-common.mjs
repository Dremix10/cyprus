// Shared bits for the disposable local QA server helpers.
// These scripts refuse to talk to anything but localhost / 127.0.0.1, so they can never
// create accounts or games on production (https://aegist.dev).

export const BASE = (process.env.QA_SERVER_URL ?? 'http://localhost:3301').replace(/\/+$/, '');

{
  const host = new URL(BASE).hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') {
    console.error(`Refusing to run against ${BASE}: QA helpers only talk to a local server.`);
    process.exit(2);
  }
}

export const QA_PASSWORD = process.env.QA_PASSWORD ?? 'qa-password-123';

export const USERS = {
  host: { username: 'qa_host', displayName: 'QA Host' },
  friend: { username: 'qa_friend', displayName: 'QA Friend' },
  friend2: { username: 'qa_friend2', displayName: 'QA Pal' },
};

let ipSeq = Math.floor(Math.random() * 200) + 1;
/** Auth routes allow 5 req/min per IP; trust proxy is on, so a fresh X-Forwarded-For per call avoids it. */
function fakeIp() {
  ipSeq = (ipSeq % 250) + 1;
  return `10.77.${Math.floor(Math.random() * 250) + 1}.${ipSeq}`;
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
export async function ensureUser({ username, displayName }, password = QA_PASSWORD) {
  const reg = await http('/auth/register', { method: 'POST', body: { username, password, displayName, email: `${username}@qa.invalid` } });
  if (reg.ok && reg.json.token) return { token: reg.json.token, user: reg.json.user };
  const login = await http('/auth/login', { method: 'POST', body: { username, password } });
  if (!login.ok || !login.json.token) {
    throw new Error(`Could not register/login ${username}: ${reg.status} ${JSON.stringify(reg.json)} / ${login.status} ${JSON.stringify(login.json)}`);
  }
  return { token: login.json.token, user: login.json.user };
}

/** Make a and b friends (idempotent). */
export async function befriend(a, b) {
  const req = await http('/api/friends/request', { method: 'POST', token: a.token, body: { friendId: b.user.id } });
  const acc = await http('/api/friends/accept', { method: 'POST', token: b.token, body: { userId: a.user.id } });
  const list = await http('/api/friends', { token: a.token });
  const ok = Array.isArray(list.json) && list.json.some((f) => f.id === b.user.id);
  if (!ok) throw new Error(`befriend failed: request=${req.status} ${JSON.stringify(req.json)} accept=${acc.status} ${JSON.stringify(acc.json)}`);
}
