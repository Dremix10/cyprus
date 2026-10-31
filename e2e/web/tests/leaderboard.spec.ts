import path from 'node:path';
import { test, expect } from './helpers/fixtures';
import { enterAsGuest, visible, waitForSignedInLobby, PHONE, DESKTOP_WIDE } from './helpers/lobby';
import { SCREENSHOT_DIR, seedLeaderboard, seedGameHistory, registerUser, loginContext } from './helpers/api';

/** PR #2 item 1: "Back to Lobby" lives in a header; the rankings scroll underneath it. */

const SEEDED = 45;

test.beforeAll(() => {
  // Rows straight into the QA SQLite DB (leaderboard needs games_played >= 3).
  seedLeaderboard(SEEDED, 'lb');
});

for (const vp of [PHONE, DESKTOP_WIDE]) {
  test(`Back to Lobby stays on screen while a long list scrolls (${vp.width}px)`, async ({ page }) => {
    await page.setViewportSize(vp);
    await enterAsGuest(page, 'LbQA');
    await visible(page.getByRole('button', { name: 'Leaderboard', exact: true })).click();

    const back = page.getByRole('button', { name: 'Back to Lobby', exact: true });
    await expect(back).toBeVisible();
    await expect(back).toHaveClass(/btn-back-lobby/);
    await expect(page.locator('.leaderboard-header .btn-back-lobby')).toHaveCount(1);
    await expect(page.locator('.leaderboard-scroll .btn-back-lobby')).toHaveCount(0);

    const rows = page.locator('.leaderboard-table tbody tr');
    await expect.poll(() => rows.count(), { timeout: 10_000 }).toBeGreaterThanOrEqual(SEEDED);

    // Whichever element actually scrolls the rows. It must be .leaderboard-scroll:
    // .leaderboard-table-wrapper has overflow-x:auto (so overflow-y computes to auto)
    // and used to shrink as a column flex item and scroll the rows itself.
    const scrollerClass = await rows.first().evaluate((row) => {
      let el: HTMLElement | null = row.parentElement;
      while (el && el !== document.body) {
        if (el.scrollHeight > el.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(el).overflowY)) {
          return el.className;
        }
        el = el.parentElement;
      }
      return null;
    });
    expect(scrollerClass, 'the rankings should scroll with .leaderboard-scroll, not the page or the table box').toMatch(
      /(^| )leaderboard-scroll( |$)/,
    );
    const scroll = page.locator(`.${scrollerClass!.split(' ')[0]}`);
    await expect(scroll.locator('xpath=ancestor-or-self::*[contains(@class,"leaderboard-scroll")]')).toHaveCount(1);
    const dims = await scroll.evaluate((el) => ({ sh: el.scrollHeight, ch: el.clientHeight }));
    expect(dims.sh, 'list should be long enough to scroll').toBeGreaterThan(dims.ch + 200);
    test.info().annotations.push({ type: 'scroller', description: `${scrollerClass} (${dims.sh}px content in ${dims.ch}px)` });

    const before = (await back.boundingBox())!;
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `leaderboard-top-${vp.width}.png`) });

    // Scroll like a person (wheel over the list), then all the way down.
    const sbox = (await scroll.boundingBox())!;
    await page.mouse.move(sbox.x + sbox.width / 2, sbox.y + Math.min(sbox.height / 2, 300));
    await page.mouse.wheel(0, 1200);
    await expect.poll(() => scroll.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    await scroll.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await expect
      .poll(() => scroll.evaluate((el) => el.scrollTop + el.clientHeight - el.scrollHeight))
      .toBeGreaterThanOrEqual(-2);

    // The header did not move and is fully inside the viewport; the page itself did not scroll.
    const after = (await back.boundingBox())!;
    expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);
    expect(after.y).toBeGreaterThanOrEqual(0);
    expect(after.y + after.height).toBeLessThanOrEqual(vp.height);
    await expect(back).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    // The last row is reachable and not cut off at the bottom. (Only the vertical
    // axis: at 390px the 9-column table is wider than the screen and scrolls sideways.)
    const lastRow = (await rows.last().boundingBox())!;
    expect(lastRow.y).toBeGreaterThanOrEqual(after.y + after.height);
    expect(lastRow.y + lastRow.height).toBeLessThanOrEqual(vp.height);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `leaderboard-scrolled-${vp.width}.png`) });

    await back.click();
    await expect(page.locator('.leaderboard-fullscreen')).toHaveCount(0);
    await expect(page.locator('.lobby-fullscreen')).toBeVisible();
  });
}

test('recent games: a tie gets its own neutral badge instead of "L"', async ({ browser, baseURL, trackErrors }) => {
  const { user, api } = await registerUser(baseURL!, { prefix: 'tie_' });
  await api.dispose();
  // Newest first: tie, loss, win.
  seedGameHistory(user.id, ['tie', 'loss', 'win']);

  const context = await browser.newContext({ baseURL });
  await loginContext(context, user);
  const page = await context.newPage();
  trackErrors(page, 'tie');
  try {
    await waitForSignedInLobby(page, user.displayName);
    await visible(page.getByRole('button', { name: 'Leaderboard', exact: true })).click();

    const dots = page.locator('.leaderboard-my-stats .game-history-dots .game-dot');
    await expect(dots).toHaveText(['T', 'L', 'W']);
    await expect(dots.nth(0)).toHaveClass(/game-dot-tie/);
    await expect(dots.nth(0)).not.toHaveClass(/game-dot-(win|loss)/);
    await expect(dots.nth(0)).toHaveAttribute('title', /^Tie — 400-400/);
    await expect(dots.nth(1)).toHaveClass(/game-dot-loss/);
    await expect(dots.nth(1)).toHaveAttribute('title', /^Loss — 300-520/);
    await expect(dots.nth(2)).toHaveClass(/game-dot-win/);
    await expect(dots.nth(2)).toHaveAttribute('title', /^Win — 520-300/);
    await page.locator('.leaderboard-my-stats').screenshot({ path: path.join(SCREENSHOT_DIR, 'leaderboard-recent-tie.png') });

    // Greek: the initials of Νίκη / Ήττα / Ισοπαλία.
    await page.evaluate(() => localStorage.setItem('cyprus-lang', 'el'));
    await page.reload();
    await expect(page.locator('.user-badge-name')).toHaveText(user.displayName);
    await visible(page.locator('.lobby-links .lobby-link:nth-of-type(2)')).click();
    await expect(dots).toHaveText(['\u0399', '\u0397', '\u039d']);
    await expect(dots.nth(0)).toHaveAttribute('title', /^\u0399\u03c3\u03bf\u03c0\u03b1\u03bb\u03af\u03b1 — /);
  } finally {
    await context.close();
  }
});
