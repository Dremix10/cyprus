import type { Page } from '@playwright/test';
import { test, expect } from './helpers/fixtures';
import { enterAsGuest, startSoloGame, leaveGame } from './helpers/lobby';

/**
 * PR #2 item 7: App.tsx holds a screen wake lock while view === 'game'.
 * navigator.wakeLock and document.visibilityState are stubbed so we can see
 * request('screen') / release() and simulate the tab going hidden (browsers
 * drop the lock then) and visible again.
 */

declare global {
  interface Window {
    __qaWakeLog: Array<{ op: 'request' | 'release' | 'system-release'; type?: string }>;
    __qaSetVisibility: (v: 'visible' | 'hidden') => void;
  }
}

async function installWakeLockStub(page: Page) {
  await page.addInitScript(() => {
    const log: Window['__qaWakeLog'] = [];
    window.__qaWakeLog = log;
    let state: 'visible' | 'hidden' = 'visible';
    Object.defineProperty(Document.prototype, 'visibilityState', { configurable: true, get: () => state });
    Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get: () => state !== 'visible' });

    type Sentinel = {
      released: boolean;
      type: string;
      release(): Promise<void>;
      addEventListener(t: string, fn: () => void): void;
      removeEventListener(): void;
      drop(): void;
    };
    const active = new Set<Sentinel>();
    const makeSentinel = (): Sentinel => {
      const listeners: Array<() => void> = [];
      const end = (op: 'release' | 'system-release') => {
        if (s.released) return;
        s.released = true;
        active.delete(s);
        log.push({ op });
        listeners.forEach((fn) => fn());
      };
      const s: Sentinel = {
        released: false,
        type: 'screen',
        release: () => {
          end('release');
          return Promise.resolve();
        },
        addEventListener: (t, fn) => {
          if (t === 'release') listeners.push(fn);
        },
        removeEventListener: () => {},
        drop: () => end('system-release'),
      };
      return s;
    };
    const wakeLock = {
      request(type: string) {
        log.push({ op: 'request', type });
        const s = makeSentinel();
        active.add(s);
        return Promise.resolve(s);
      },
    };
    Object.defineProperty(Navigator.prototype, 'wakeLock', { configurable: true, get: () => wakeLock });
    window.__qaSetVisibility = (v) => {
      state = v;
      if (v !== 'visible') [...active].forEach((s) => s.drop()); // what a real browser does
      document.dispatchEvent(new Event('visibilitychange'));
    };
  });
}

const count = (page: Page, op: string) =>
  page.evaluate((o) => window.__qaWakeLog.filter((e) => e.op === o).length, op);

test('wake lock: requested in game, re-requested after hidden→visible, released on leaving', async ({ page }) => {
  await installWakeLockStub(page);
  await enterAsGuest(page, 'WakeQA');

  // Lobby: no lock.
  expect(await count(page, 'request')).toBe(0);

  await startSoloGame(page, { length: 'Quick game' });
  await expect.poll(() => count(page, 'request')).toBe(1);
  expect(await page.evaluate(() => window.__qaWakeLog[0])).toEqual({ op: 'request', type: 'screen' });

  // A visibilitychange while the lock is still held must not stack a second request.
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForTimeout(300);
  expect(await count(page, 'request')).toBe(1);

  // Tab hidden: the browser drops the lock and nothing is requested while hidden.
  await page.evaluate(() => window.__qaSetVisibility('hidden'));
  expect(await count(page, 'system-release')).toBe(1);
  await page.waitForTimeout(300);
  expect(await count(page, 'request')).toBe(1);

  // Visible again: the game asks for the lock again.
  await page.evaluate(() => window.__qaSetVisibility('visible'));
  await expect.poll(() => count(page, 'request')).toBe(2);

  // Leaving the game releases the held lock.
  await leaveGame(page);
  await expect.poll(() => count(page, 'release')).toBe(1);

  // Back in the lobby a hidden→visible cycle requests nothing.
  await page.evaluate(() => window.__qaSetVisibility('hidden'));
  await page.evaluate(() => window.__qaSetVisibility('visible'));
  await page.waitForTimeout(300);
  expect(await count(page, 'request')).toBe(2);
  expect(await page.evaluate(() => window.__qaWakeLog.map((e) => e.op))).toEqual([
    'request',
    'system-release',
    'request',
    'release',
  ]);
});

test('wake lock: missing navigator.wakeLock is ignored (no errors, game still loads)', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'wakeLock', { configurable: true, get: () => undefined });
  });
  await enterAsGuest(page, 'WakeNone');
  await startSoloGame(page, { length: 'Quick game' });
  await expect(page.locator('.game-board .game-info')).toBeVisible();
  await leaveGame(page);
});

test('wake lock: a refused request is swallowed', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__qaRefused = 0;
    const wakeLock = {
      request() {
        (window as any).__qaRefused++;
        return Promise.reject(new DOMException('Refused', 'NotAllowedError'));
      },
    };
    Object.defineProperty(Navigator.prototype, 'wakeLock', { configurable: true, get: () => wakeLock });
  });
  await enterAsGuest(page, 'WakeRefused');
  await startSoloGame(page, { length: 'Quick game' });
  await expect.poll(() => page.evaluate(() => (window as any).__qaRefused)).toBe(1);
  await expect(page.locator('.game-board .game-info')).toBeVisible();
  await leaveGame(page);
});
