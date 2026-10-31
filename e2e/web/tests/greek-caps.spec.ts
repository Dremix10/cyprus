import path from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect } from './helpers/fixtures';
import { openApp, visible, PHONE } from './helpers/lobby';
import { SCREENSHOT_DIR } from './helpers/api';

/**
 * PR #2 item 8 (src/greekCaps.ts): Greek text shown through CSS
 * `text-transform: uppercase` must not carry tonos (Κατάταξη → ΚΑΤΑΤΑΞΗ, not
 * ΚΑΤΆΤΑΞΗ). `.special-name` card labels are title case and keep accents.
 */

type Scan = { checked: number; greek: number; bad: string[]; samples: string[] };

/** Every text node whose parent renders uppercase: uppercase it the way CSS does and look for an acute. */
async function scanUppercase(page: Page): Promise<Scan> {
  return page.evaluate(() => {
    const out = { checked: 0, greek: 0, bad: [] as string[], samples: [] as string[] };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const el = node.parentElement;
      const text = node.nodeValue ?? '';
      if (!el || !text.trim() || el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
      if (el.closest('.special-name')) continue;
      if (getComputedStyle(el).textTransform !== 'uppercase') continue;
      if (el.getClientRects().length === 0) continue; // not rendered
      out.checked++;
      if (/[Ͱ-Ͽἀ-῿]/.test(text)) {
        out.greek++;
        if (out.samples.length < 8) out.samples.push(text.trim());
      }
      const rendered = text.toUpperCase().normalize('NFD');
      // U+0301 combining acute = tonos. Dialytika (U+0308) is allowed.
      if (/́/.test(rendered)) {
        const cls = typeof el.className === 'string' ? el.className : '';
        out.bad.push(`<${el.tagName.toLowerCase()} class="${cls}"> "${text.trim()}" → "${text.toUpperCase().trim()}"`);
      }
    }
    return out;
  });
}

async function expectNoTonos(page: Page, where: string, minGreek = 1) {
  // The MutationObserver rewrites synchronously-ish; give React a frame to settle.
  await page.waitForTimeout(150);
  const scan = await scanUppercase(page);
  expect(scan.bad, `${where}: uppercase Greek still carries tonos:\n${scan.bad.join('\n')}`).toEqual([]);
  expect(scan.greek, `${where}: expected some uppercase Greek text to check (samples: ${scan.samples.join(' | ')})`).toBeGreaterThanOrEqual(
    minGreek,
  );
  return scan;
}

test('Greek UI: uppercase labels drop tonos across lobby, leaderboard, tutorial and game; card names keep accents', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const report: string[] = [];

  // Switch the language from the sign-in card, like a user would (live re-render path).
  await openApp(page);
  await page.locator('.lang-toggle .lang-btn', { hasText: 'EL' }).click();
  await expect(page.locator('.btn-guest')).toHaveText(/ΠΑΙΞΕ ΩΣ ΕΠΙΣΚΕΠΤΗΣ|Παίξε ως Επισκέπτης/);
  report.push(`auth: ${(await expectNoTonos(page, 'sign-in card')).samples.join(' | ')}`);

  // Home panel (guest).
  await page.locator('.btn-guest').click();
  await page.locator('.lobby-form input.input-greek[type="text"]').first().fill('Ellinas');
  await expect(page.locator('.btn-play-online')).toBeVisible();
  report.push(`home: ${(await expectNoTonos(page, 'home panel')).samples.join(' | ')}`);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'greek-home.png') });

  // Create Room sub-view.
  await page.locator('.lobby-room-row .btn-create').click();
  await expect(page.locator('.lobby-subview')).toBeVisible();
  await expectNoTonos(page, 'create room');
  await page.locator('.lobby-subview .lobby-back').click();

  // Leaderboard (Κατάταξη → ΚΑΤΑΤΑΞΗ if uppercase).
  await visible(page.locator('.lobby-links .lobby-link').nth(1)).click();
  await expect(page.locator('.leaderboard-fullscreen')).toBeVisible();
  await expect(page.locator('.leaderboard-loading')).toHaveCount(0);
  report.push(`leaderboard: ${(await expectNoTonos(page, 'leaderboard')).samples.join(' | ')}`);
  await page.locator('.btn-back-lobby').click();

  // Tutorial step with all four special cards: names keep their accents.
  await page.locator('.btn-guest').or(page.locator('.btn-play-online')).first().waitFor();
  if (await page.locator('.btn-guest').isVisible()) await page.locator('.btn-guest').click();
  await visible(page.locator('.lobby-links .lobby-link').first()).click();
  const navItems = page.locator('.tutorial-nav .tutorial-nav-item');
  await expect(navItems.first()).toBeVisible();
  const specials = page.locator('.tutorial-cards .special-card');
  for (let i = 0; i < (await navItems.count()); i++) {
    await navItems.nth(i).click();
    if ((await specials.count()) === 4) break;
  }
  await expect(specials).toHaveCount(4);
  await expect(page.locator('.tutorial-cards .special-name')).toHaveText(['Ματζόνγκ', 'Σκύλος', 'Φοίνικας', 'Δράκος']);
  const nameTransforms = await page
    .locator('.tutorial-cards .special-name')
    .evaluateAll((els) => els.map((e) => getComputedStyle(e).textTransform));
  expect(nameTransforms.every((t) => t !== 'uppercase')).toBe(true);
  await expectNoTonos(page, 'tutorial', 0);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'greek-tutorial-specials.png') });

  // Into a solo game (phone width, where the bar labels are uppercase too).
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await page.locator('.btn-guest').click();
  await page.locator('.lobby-form input.input-greek[type="text"]').first().fill('Ellinas');
  await page.locator('.lobby-form > .btn-solo-greek, .lobby-form .btn-solo-greek').first().click();
  await page.locator('.lobby-subview .btn-solo-greek').click();
  await expect(page.locator('.game-board .game-info')).toBeVisible({ timeout: 20_000 });
  report.push(`game GT: ${(await expectNoTonos(page, 'game (Grand Tichu)', 0)).samples.join(' | ')}`);
  await page.locator('.grand-tichu-actions .btn-secondary').click();
  await expect(page.locator('.pass-hand')).toBeVisible({ timeout: 15_000 });
  report.push(`game passing: ${(await expectNoTonos(page, 'game (passing)')).samples.join(' | ')}`);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'greek-game-passing.png') });

  // Any special cards in this hand keep their accents too.
  const handNames = await page.locator('.pass-hand .special-name').allTextContents();
  for (const n of handNames) expect(['Ματζόνγκ', 'Σκύλος', 'Φοίνικας', 'Δράκος']).toContain(n);

  testInfo.annotations.push({ type: 'greek-samples', description: report.join(' || ') });
});

test('Greek UI: a Greek nickname can start a solo game', async ({ page }) => {
  // Regression: nickname validation used to refuse every Greek letter.
  await page.addInitScript(() => localStorage.setItem('cyprus-lang', 'el'));
  await openApp(page);
  await page.locator('.btn-guest').click();
  await page.locator('.lobby-form input.input-greek[type="text"]').first().fill('Δημήτρης');
  await page.locator('.lobby-form .btn-solo-greek').first().click();
  await page.locator('.lobby-subview .btn-solo-greek').click();
  await expect(page.locator('.lobby-form .error')).toHaveCount(0, { timeout: 3_000 });
  await expect(page.locator('.game-board .game-info')).toBeVisible({ timeout: 10_000 });
});
