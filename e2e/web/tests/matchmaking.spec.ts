import path from 'node:path';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import type { Socket } from 'socket.io-client';
import { test, expect } from './helpers/fixtures';
import { enterAsGuest, scoreBar, settleAnimations } from './helpers/lobby';
import { SCREENSHOT_DIR } from './helpers/api';
import { connectSocket, emitAck } from './helpers/sockets';

/**
 * PR #2 item 9 (revised): Play Online always plays to 500. The home panel has
 * no length picker, and the server ignores any length a client sends, so
 * everyone in the queue can be grouped together. Kept fast: four players
 * match instantly, long before the 30–60s bot-fill timers.
 */

test.describe.configure({ mode: 'serial' });

async function queuePlayer(browser: Browser, nick: string, track: (p: Page, l?: string) => void) {
  const context = await browser.newContext();
  const page = await context.newPage();
  track(page, nick);
  await enterAsGuest(page, nick);
  await page.locator('.btn-play-online').click();
  return { context, page };
}

test('four players are seated in one game whose bar shows "/ 500"; the queue says "Game to 500"', async ({ browser, trackErrors }) => {
  test.setTimeout(90_000);
  const players: Array<{ context: BrowserContext; page: Page }> = [];
  try {
    const names = ['MM500a', 'MM500b', 'MM500c', 'MM500d'];
    for (const [i, n] of names.entries()) {
      players.push(await queuePlayer(browser, n, trackErrors));
      if (i < 3) {
        const card = players[i].page.locator('.queue-card');
        await expect(card).toBeVisible();
        await expect(card.locator('.queue-length')).toHaveText('Game to 500');
        if (i === 0) {
          await settleAnimations(players[0].page);
          await players[0].page.screenshot({ path: path.join(SCREENSHOT_DIR, 'desktop-queue-500.png') });
        }
      }
    }
    const codes: string[] = [];
    for (const { page } of players) {
      await expect(page.locator('.game-board .game-info')).toBeVisible({ timeout: 10_000 });
      const bar = scoreBar(page);
      await expect(bar.myTeam).toHaveText(/^Your Team: \d+ \/ 500$/);
      await expect(bar.opponents).toHaveText(/^Opponents: \d+ \/ 500$/);
      await expect(bar.phaseTitle).not.toContainText('1 round');
      codes.push((await page.locator('.room-code-badge').textContent())!.trim());
    }
    expect(new Set(codes).size, `room codes: ${codes.join(', ')}`).toBe(1);
    // Four humans share one room code, so every seat is a human (no bot fill).
  } finally {
    for (const p of players) await p.context.close();
  }
});

test('players who ask for different lengths are all grouped into one 500 game', async ({ browser, baseURL, trackErrors }) => {
  test.setTimeout(60_000);
  const context = await browser.newContext();
  const sockets: Socket[] = [];
  try {
    // One player through the UI (the web client always sends 500 now)...
    const page = await context.newPage();
    trackErrors(page, 'MMui');
    await enterAsGuest(page, 'MMui');
    await page.locator('.btn-play-online').click();
    await expect(page.locator('.queue-card')).toBeVisible();

    // ...and three raw clients that still ask for 250, a quick game and 1000.
    const found: Array<Promise<{ roomCode: string; targetScore: number }>> = [];
    for (const [nick, length] of [
      ['MMraw250', 250],
      ['MMrawQuick', 0],
      ['MMraw1000', 1000],
    ] as const) {
      const socket = await connectSocket(baseURL!);
      sockets.push(socket);
      found.push(
        new Promise((resolve) => {
          let roomCode: string | null = null;
          let targetScore: number | null = null;
          const done = () => {
            if (roomCode !== null && targetScore !== null) resolve({ roomCode, targetScore });
          };
          socket.once('matchmaking:found', (data: { roomCode: string }) => {
            roomCode = data.roomCode;
            done();
          });
          socket.once('game:state', (state: { targetScore: number }) => {
            targetScore = state.targetScore;
            done();
          });
        }),
      );
      const res = await emitAck<{ success?: boolean; error?: string }>(socket, 'matchmaking:join', nick, length);
      expect(res, `${nick} joined the queue`).toEqual({ success: true });
    }

    // The fourth join fills the table at once: nobody waits for a same-length group.
    await expect(page.locator('.game-board .game-info')).toBeVisible({ timeout: 10_000 });
    const bar = scoreBar(page);
    await expect(bar.myTeam).toHaveText(/^Your Team: \d+ \/ 500$/);
    await expect(bar.phaseTitle).not.toContainText('1 round');
    const uiCode = (await page.locator('.room-code-badge').textContent())!.trim();

    const raw = await Promise.all(found);
    for (const r of raw) {
      expect(r.roomCode).toBe(uiCode);
      expect(r.targetScore).toBe(500);
    }
  } finally {
    for (const s of sockets) s.disconnect();
    await context.close();
  }
});

test('the player whose click completes the table goes straight to the game', async ({ browser, trackErrors }) => {
  // Regression: the matchmaking:join reply used to arrive after game:state and
  // send this player back to "Searching for Players" until the 15s resync.
  test.setTimeout(60_000);
  const players: Array<{ context: BrowserContext; page: Page }> = [];
  try {
    for (const n of ['MMlast1', 'MMlast2', 'MMlast3']) {
      players.push(await queuePlayer(browser, n, trackErrors));
      await expect(players[players.length - 1].page.locator('.queue-card')).toBeVisible();
    }
    const context = await browser.newContext();
    const page = await context.newPage();
    trackErrors(page, 'MMlast4');
    players.push({ context, page });
    await enterAsGuest(page, 'MMlast4');
    // Record every switch between the queue screen and the game board.
    await page.evaluate(() => {
      const w = window as any;
      w.__qaViews = [] as string[];
      const sample = () => {
        const v = document.querySelector('.game-board') ? 'game' : document.querySelector('.queue-card') ? 'queue' : 'other';
        if (w.__qaViews[w.__qaViews.length - 1] !== v) w.__qaViews.push(v);
      };
      new MutationObserver(sample).observe(document.body, { childList: true, subtree: true });
      sample();
    });
    await page.locator('.btn-play-online').click();
    await page.waitForTimeout(2_500);
    const views: string[] = await page.evaluate(() => (window as any).__qaViews);
    test.info().annotations.push({ type: 'views', description: views.join(' → ') });
    // A one-frame "queue" before the game is fine; ending on it (or going back to it) is the bug.
    expect(views.at(-1), `view sequence: ${views.join(' → ')}`).toBe('game');
    expect(views.slice(views.indexOf('game')), `view sequence: ${views.join(' → ')}`).not.toContain('queue');
    await expect(page.locator('.game-board .game-info')).toBeVisible();
  } finally {
    for (const p of players) await p.context.close();
  }
});
