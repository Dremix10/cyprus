import path from 'node:path';
import type { Browser, Page } from '@playwright/test';
import { test, expect } from './helpers/fixtures';
import { createRoomViaUi, waitingRoomCode, waitForSignedInLobby, openApp } from './helpers/lobby';
import { loginContext, makeFriends, registerUser, SCREENSHOT_DIR, type TestUser } from './helpers/api';
import { authCookieOf, connectSocket, emitAck } from './helpers/sockets';

/**
 * PR #2 item 6: one tap "Invite" in the Friends panel opens a waiting room and
 * sends the friend an invite popup; Accept seats them in the same room.
 */

async function friendPair(baseURL: string) {
  const a = await registerUser(baseURL, { prefix: 'inva_' });
  const b = await registerUser(baseURL, { prefix: 'invb_' });
  await makeFriends(a, b);
  return { a, b };
}

/** New browser context signed in through the API, page loaded (its socket carries the auth cookie). */
async function openSignedIn(browser: Browser, baseURL: string, user: TestUser, label: string, track: (p: Page, l?: string) => void) {
  const context = await browser.newContext({ baseURL });
  await loginContext(context, user);
  const page = await context.newPage();
  track(page, label);
  await waitForSignedInLobby(page, user.displayName);
  return { context, page };
}

/** Wait until the server sees `friend` online from `viewer`'s point of view. */
async function waitOnline(viewerApi: import('@playwright/test').APIRequestContext, friendId: number) {
  await expect
    .poll(
      async () => {
        const res = await viewerApi.get('/api/friends');
        const list = (await res.json()) as Array<{ id: number; online: boolean }>;
        return list.find((f) => f.id === friendId)?.online ?? false;
      },
      { timeout: 10_000, intervals: [300, 500, 1000] },
    )
    .toBe(true);
}

async function expectSeated(page: Page, names: string[]) {
  const seats = page.locator('.seats-grid .seat .player-name');
  await expect(seats).toHaveCount(names.length);
  for (const n of names) await expect(page.locator('.seats-grid')).toContainText(n);
}

test('Invite in the Friends panel opens a new waiting room; the friend accepts into the same room', async ({
  browser,
  baseURL,
  trackErrors,
}) => {
  const { a, b } = await friendPair(baseURL!);
  const B = await openSignedIn(browser, baseURL!, b.user, 'B', trackErrors);
  await waitOnline(a.api, b.user.id);
  const A = await openSignedIn(browser, baseURL!, a.user, 'A', trackErrors);
  try {
    await A.page.locator('.friends-toggle').click();
    const online = A.page.locator('.friends-section', { hasText: 'Online' });
    const row = online.locator('.friend-item', { hasText: b.user.displayName });
    await expect(row).toBeVisible();
    await A.page.locator('.friends-panel').screenshot({ path: path.join(SCREENSHOT_DIR, 'friends-panel-invite.png') });
    await row.getByRole('button', { name: 'Invite', exact: true }).click();

    // A lands in a brand-new waiting room.
    const code = await waitingRoomCode(A.page);
    await expectSeated(A.page, [a.user.displayName]);

    // B gets the popup with A's name and the room code.
    const popup = B.page.locator('.friend-invite-popup');
    await expect(popup).toBeVisible();
    await expect(popup.locator('.friend-invite-title strong')).toHaveText(a.user.displayName);
    await expect(popup.locator('.friend-invite-room code')).toHaveText(code);
    await B.page.screenshot({ path: path.join(SCREENSHOT_DIR, 'friend-invite-popup.png') });

    await popup.getByRole('button', { name: 'Accept', exact: true }).click();
    await expect(popup).toBeHidden();
    expect(await waitingRoomCode(B.page)).toBe(code);
    await expectSeated(B.page, [a.user.displayName, b.user.displayName]);
    await expectSeated(A.page, [a.user.displayName, b.user.displayName]);
  } finally {
    await A.context.close();
    await B.context.close();
  }
});

test('Inviting from an existing waiting room keeps the same room code', async ({ browser, baseURL, trackErrors }) => {
  const { a, b } = await friendPair(baseURL!);
  const B = await openSignedIn(browser, baseURL!, b.user, 'B', trackErrors);
  await waitOnline(a.api, b.user.id);
  const A = await openSignedIn(browser, baseURL!, a.user, 'A', trackErrors);
  try {
    // The Friends panel only lives on the lobby, so from a waiting room the
    // invite goes through the waiting room's "Invite friend" picker.
    const code = await createRoomViaUi(A.page, { length: '500' });
    await A.page.getByRole('button', { name: 'Invite friend', exact: true }).click();
    const picker = A.page.locator('.invite-picker');
    await expect(picker).toBeVisible();
    const pickRow = picker.locator('.invite-picker-row', { hasText: b.user.displayName });
    await pickRow.getByRole('button', { name: 'Invite', exact: true }).click();
    await expect(pickRow.locator('.invite-sent')).toHaveText('Invited');
    await picker.getByRole('button', { name: 'Close', exact: true }).click();

    // Still the same room for A; B's popup points at it.
    expect(await waitingRoomCode(A.page)).toBe(code);
    const popup = B.page.locator('.friend-invite-popup');
    await expect(popup.locator('.friend-invite-room code')).toHaveText(code);
    await popup.getByRole('button', { name: 'Accept', exact: true }).click();
    expect(await waitingRoomCode(B.page)).toBe(code);
    expect(await waitingRoomCode(A.page)).toBe(code);
    await expectSeated(A.page, [a.user.displayName, b.user.displayName]);
  } finally {
    await A.context.close();
    await B.context.close();
  }
});

test('Decline clears the popup and leaves the inviter alone in the room', async ({ browser, baseURL, trackErrors }) => {
  const { a, b } = await friendPair(baseURL!);
  const B = await openSignedIn(browser, baseURL!, b.user, 'B', trackErrors);
  await waitOnline(a.api, b.user.id);
  const A = await openSignedIn(browser, baseURL!, a.user, 'A', trackErrors);
  try {
    await A.page.locator('.friends-toggle').click();
    await A.page.locator('.friend-item', { hasText: b.user.displayName }).getByRole('button', { name: 'Invite' }).click();
    const code = await waitingRoomCode(A.page);
    const popup = B.page.locator('.friend-invite-popup');
    await expect(popup.locator('.friend-invite-room code')).toHaveText(code);
    await popup.getByRole('button', { name: 'Decline', exact: true }).click();
    await expect(popup).toBeHidden();
    await expect(B.page.locator('.lobby-fullscreen')).toBeVisible();
    await expectSeated(A.page, [a.user.displayName]);
  } finally {
    await A.context.close();
    await B.context.close();
  }
});

test('Invites into a full room or a started game are refused', async ({ browser, baseURL, trackErrors }) => {
  const { a, b } = await friendPair(baseURL!);
  const B = await openSignedIn(browser, baseURL!, b.user, 'B', trackErrors);
  await waitOnline(a.api, b.user.id);
  const sockets: Array<Awaited<ReturnType<typeof connectSocket>>> = [];
  const A = await openSignedIn(browser, baseURL!, a.user, 'A', trackErrors);
  try {
    // UI: once the room is full the waiting room hides "Invite friend".
    const code = await createRoomViaUi(A.page);
    await expect(A.page.getByRole('button', { name: 'Invite friend', exact: true })).toBeVisible();
    for (let i = 0; i < 3; i++) {
      const g = await connectSocket(baseURL!);
      sockets.push(g);
      const res = await emitAck(g, 'room:join', code, `Guest${i}`);
      expect(res).toHaveProperty('success', true);
    }
    await expect(A.page.locator('.seats-grid .seat .player-name')).toHaveCount(4);
    await expect(A.page.getByRole('button', { name: 'Invite friend', exact: true })).toHaveCount(0);

    // Server: a full room refuses the invite (A's own authenticated socket, separate room).
    const aSock = await connectSocket(baseURL!, { authCookie: await authCookieOf(a.api) });
    sockets.push(aSock);
    const created = await emitAck<{ roomCode: string }>(aSock, 'room:create', a.user.displayName, 1000, 'medium');
    expect(created.roomCode).toMatch(/^[A-Z0-9]{4}$/);
    for (let i = 0; i < 3; i++) {
      const g = await connectSocket(baseURL!);
      sockets.push(g);
      expect(await emitAck(g, 'room:join', created.roomCode, `Filler${i}`)).toHaveProperty('success', true);
    }
    expect(await emitAck(aSock, 'friend:invite:send', b.user.id)).toEqual({ error: 'Room is full' });

    // Server: a started game refuses the invite.
    const aSock2 = await connectSocket(baseURL!, { authCookie: await authCookieOf(a.api) });
    sockets.push(aSock2);
    const room2 = await emitAck<{ roomCode: string }>(aSock2, 'room:create', a.user.displayName, 1000, 'medium');
    const joiner = await connectSocket(baseURL!);
    sockets.push(joiner);
    expect(await emitAck(joiner, 'room:join', room2.roomCode, 'Joiner')).toHaveProperty('success', true);
    const started = new Promise<void>((resolve) => aSock2.once('game:state', () => resolve()));
    aSock2.emit('room:start');
    await started;
    expect(await emitAck(aSock2, 'friend:invite:send', b.user.id)).toEqual({ error: 'Game already started' });

    // B never saw an invite popup for any of this.
    await B.page.waitForTimeout(500);
    await expect(B.page.locator('.friend-invite-popup')).toHaveCount(0);
  } finally {
    sockets.forEach((s) => s.disconnect());
    await A.context.close();
    await B.context.close();
  }
});

test('Invite works right after signing in through the form (no reload)', async ({ browser, baseURL, trackErrors }) => {
  // Regression: the server reads the login cookie only at connect time, so
  // login has to reconnect the socket or the invite is refused as a guest.
  const { a, b } = await friendPair(baseURL!);
  const B = await openSignedIn(browser, baseURL!, b.user, 'B', trackErrors);
  await waitOnline(a.api, b.user.id);
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  trackErrors(page, 'A-form');
  try {
    await openApp(page);
    const form = page.locator('.auth-form');
    await form.locator('input[autocomplete="username"]').fill(a.user.username);
    await form.locator('input[type="password"]').fill(a.user.password);
    // Sign-in is rate limited per IP (5/min); route this one request through a unique X-Forwarded-For.
    await page.route('**/auth/login', (route) =>
      route.continue({ headers: { ...route.request().headers(), 'x-forwarded-for': `10.250.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } }),
    );
    await form.locator('button[type="submit"]').click();
    await expect(page.locator('.user-badge-name')).toHaveText(a.user.displayName);

    await page.locator('.friends-toggle').click();
    const row = page.locator('.friend-item', { hasText: b.user.displayName });
    await row.getByRole('button', { name: 'Invite', exact: true }).click();
    const code = await waitingRoomCode(page);
    await expect(page.locator('.waiting-room .error')).toHaveCount(0);
    await expect(B.page.locator('.friend-invite-popup .friend-invite-room code')).toHaveText(code);
  } finally {
    await context.close();
    await B.context.close();
  }
});
