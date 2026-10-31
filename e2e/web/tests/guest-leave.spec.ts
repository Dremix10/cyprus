import type { WebSocketRoute } from '@playwright/test';
import { test, expect } from './helpers/fixtures';
import {
  enterAsGuest,
  startSoloGame,
  createRoomViaUi,
  leaveGame,
  expectGuestHome,
  watchForReconnectBanner,
  bannerWasSeen,
} from './helpers/lobby';

/**
 * Leaving a game on purpose takes a guest straight back to their home panel
 * (nickname kept, no sign-in card) with no "Reconnecting..." banner. A real
 * dropped connection still shows the banner.
 */

test('a guest who exits a solo game lands on the guest home panel with no Reconnecting banner', async ({ page }) => {
  await enterAsGuest(page, 'LeaveQA');
  await startSoloGame(page, { length: 'Quick game' });

  await watchForReconnectBanner(page);
  await leaveGame(page);
  await expectGuestHome(page, 'LeaveQA');
  // The socket is closed and reopened behind the scenes; give it time to settle.
  await page.waitForTimeout(1_500);
  expect(await bannerWasSeen(page), 'Reconnecting banner after leaving').toBe(false);
  await expect(page.locator('.connection-banner')).toHaveCount(0);

  // The lobby still works: a second game starts from here.
  await startSoloGame(page, { length: 'Quick game' });
  await leaveGame(page);
  await expectGuestHome(page, 'LeaveQA');
});

test('a guest who leaves a waiting room lands on the guest home panel with no Reconnecting banner', async ({ page }) => {
  await enterAsGuest(page, 'LeaveRoom');
  await createRoomViaUi(page);

  await watchForReconnectBanner(page);
  await page.locator('.waiting-room .room-header .btn-small').click();
  await expect(page.locator('.waiting-room')).toHaveCount(0);
  await expectGuestHome(page, 'LeaveRoom');
  await page.waitForTimeout(1_500);
  expect(await bannerWasSeen(page), 'Reconnecting banner after leaving').toBe(false);
});

test('a real dropped connection still shows the Reconnecting banner, then clears it', async ({ page, errorLog }) => {
  test.setTimeout(60_000);
  // Sit between the page and the server so the test can cut the line.
  let blocked = false;
  const line: { live: WebSocketRoute | null } = { live: null };
  await page.routeWebSocket(/\/socket\.io\//, (ws) => {
    if (blocked) {
      ws.close();
      return;
    }
    ws.connectToServer();
    line.live = ws;
  });
  // Keep the polling fallback from sneaking around the cut.
  await page.route('**/socket.io/**', (route) => (blocked ? route.abort() : route.continue()));

  await enterAsGuest(page, 'DropQA');
  await startSoloGame(page, { length: 'Quick game' });
  await expect(page.locator('.connection-banner')).toHaveCount(0);
  expect(line.live, 'the game socket went through the route').not.toBeNull();

  blocked = true;
  await line.live!.close();
  await expect(page.locator('.connection-banner')).toHaveText('Reconnecting...');
  // Still on the table; the drop is not a leave.
  await expect(page.locator('.game-board')).toBeVisible();

  blocked = false;
  await expect(page.locator('.connection-banner')).toHaveCount(0, { timeout: 20_000 });
  await expect(page.locator('.game-board .game-info')).toBeVisible();

  // The cut connection and refused retries are logged by the browser; that is the point here.
  const dropNoise = (text: string) => /WebSocket|socket\.io|ERR_FAILED/i.test(text);
  for (let i = errorLog.length - 1; i >= 0; i--) {
    if (dropNoise(`${errorLog[i].text} ${errorLog[i].url ?? ''}`)) errorLog.splice(i, 1);
  }
  await leaveGame(page);
});
