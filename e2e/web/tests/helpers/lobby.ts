import { expect, type Page, type Locator } from '@playwright/test';

export type LengthLabel = 'Quick game' | '250' | '500' | '1000';
export type Difficulty = 'easy' | 'medium' | 'hard' | 'extreme' | 'unfair';

export const PHONE = { width: 390, height: 844 };
export const DESKTOP_WIDE = { width: 1440, height: 900 };

/** The lobby renders some links twice (inline + mobile footer); pick the visible one. */
export function visible(locator: Locator): Locator {
  return locator.locator('visible=true').first();
}

export async function openApp(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('.lobby-fullscreen')).toBeVisible();
}

/** Open the app as a guest and type a nickname. Lands on the home panel. */
export async function enterAsGuest(page: Page, nickname: string): Promise<void> {
  await openApp(page);
  await page.locator('.btn-guest').click();
  const name = page.locator('.lobby-form input.input-greek[type="text"]').first();
  await name.fill(nickname);
  await expect(page.locator('.btn-play-online')).toBeVisible();
}

/** Signed-in users skip the guest button; the nickname is prefilled. */
export async function waitForSignedInLobby(page: Page, displayName: string): Promise<void> {
  await openApp(page);
  await expect(page.locator('.user-badge-name')).toHaveText(displayName);
  await expect(page.locator('.btn-play-online')).toBeVisible();
}

export function lengthOption(scope: Page | Locator, label: LengthLabel): Locator {
  return scope.locator('.length-picker .length-option').filter({ hasText: new RegExp(`^${label}$`) });
}

export async function pickLength(scope: Page | Locator, label: LengthLabel): Promise<void> {
  const option = lengthOption(scope, label);
  await option.click();
  await expect(option).toHaveAttribute('aria-pressed', 'true');
}

/** Home → Solo Game → pick length + bot level → Start. Waits for the game board. */
export async function startSoloGame(
  page: Page,
  opts: { length?: LengthLabel; difficulty?: Difficulty } = {},
): Promise<void> {
  await page.getByRole('button', { name: 'Solo Game', exact: true }).click();
  const sub = page.locator('.lobby-subview');
  await expect(sub.locator('.lobby-subview-title')).toHaveText('Solo Game');
  if (opts.length) await pickLength(sub, opts.length);
  if (opts.difficulty) await sub.locator('select').selectOption(opts.difficulty);
  await sub.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.locator('.game-board .game-info')).toBeVisible({ timeout: 20_000 });
}

/** Home → Create Room → Start. Waits for the waiting room and returns the room code. */
export async function createRoomViaUi(page: Page, opts: { length?: LengthLabel } = {}): Promise<string> {
  await page.getByRole('button', { name: 'Create Room', exact: true }).click();
  const sub = page.locator('.lobby-subview');
  await expect(sub.locator('.lobby-subview-title')).toHaveText('Create Room');
  if (opts.length) await pickLength(sub, opts.length);
  await sub.getByRole('button', { name: 'Start', exact: true }).click();
  return waitingRoomCode(page);
}

export async function waitingRoomCode(page: Page): Promise<string> {
  const header = page.locator('.waiting-room .room-header h2');
  await expect(header).toHaveText(/Room: [A-Z0-9]{4}/, { timeout: 15_000 });
  const text = (await header.textContent()) ?? '';
  return /Room: ([A-Z0-9]{4})/.exec(text)![1];
}

/** In-game Exit → confirm. Lands back on the lobby. */
export async function leaveGame(page: Page): Promise<void> {
  await page.locator('.game-controls .leave-btn').click();
  await page.locator('.leave-modal .btn-danger').click();
  await expect(page.locator('.lobby-fullscreen')).toBeVisible();
}

/**
 * Let entrance / fade-in animations finish so a screenshot isn't caught mid-fade.
 * Endless ones (spinners) are ignored.
 */
export async function settleAnimations(page: Page): Promise<void> {
  await page
    .waitForFunction(
      () =>
        document
          .getAnimations()
          .every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().endTime === Infinity),
      null,
      { timeout: 5_000 },
    )
    .catch(() => {});
}

/** A guest back on the home panel: game buttons, not the sign-in card, nickname kept. */
export async function expectGuestHome(page: Page, nickname: string): Promise<void> {
  await expect(page.locator('.btn-play-online')).toBeVisible();
  await expect(page.locator('.btn-guest')).toHaveCount(0);
  await expect(page.locator('.lobby-form input.input-greek[type="text"]').first()).toHaveValue(nickname);
}

/**
 * Remember whether the "Reconnecting..." banner shows up at any point from now on,
 * even for a frame. Read it back with `bannerWasSeen`.
 */
export async function watchForReconnectBanner(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as any;
    w.__qaBannerSeen = !!document.querySelector('.connection-banner');
    new MutationObserver(() => {
      if (document.querySelector('.connection-banner')) w.__qaBannerSeen = true;
    }).observe(document.body, { childList: true, subtree: true });
  });
}

export async function bannerWasSeen(page: Page): Promise<boolean> {
  return page.evaluate(() => (window as any).__qaBannerSeen === true);
}

/**
 * Every score-history row has one real table cell per header, each sitting under
 * its own header on one line. A flex <td> breaks out of the grid and stacks.
 */
export async function expectScoreTableAligned(table: Locator): Promise<void> {
  const layout = await table.evaluate((el) => {
    const box = (c: Element) => {
      const r = c.getBoundingClientRect();
      return { x: r.x, w: r.width, y: r.y, display: getComputedStyle(c).display };
    };
    return {
      head: [...el.querySelectorAll('thead th')].map(box),
      rows: [...el.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map(box)),
    };
  });
  expect(layout.head).toHaveLength(4);
  expect(layout.rows.length, 'score table has rows').toBeGreaterThan(0);
  for (const [r, cells] of layout.rows.entries()) {
    expect(cells, `row ${r + 1} cell count`).toHaveLength(layout.head.length);
    for (const [i, c] of cells.entries()) {
      const where = `row ${r + 1}, column ${i + 1}`;
      expect(c.display, where).toBe('table-cell');
      expect(Math.abs(c.x - layout.head[i].x), `${where}: left edge under its header`).toBeLessThanOrEqual(1);
      expect(Math.abs(c.w - layout.head[i].w), `${where}: same width as its header`).toBeLessThanOrEqual(1);
      expect(Math.abs(c.y - cells[0].y), `${where}: on the row's line`).toBeLessThanOrEqual(1);
    }
  }
}

export function scoreBar(page: Page) {
  const info = page.locator('.game-board .game-info');
  return {
    info,
    myTeam: info.locator('> .name-teammate'),
    opponents: info.locator('> .name-opponent'),
    phaseTitle: info.locator('.game-phase-title'),
  };
}
