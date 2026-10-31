import path from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect } from './helpers/fixtures';
import { enterAsGuest, startSoloGame, expectGuestHome, PHONE, DESKTOP_WIDE } from './helpers/lobby';
import { SCREENSHOT_DIR } from './helpers/api';

/** PR #2 item 2: centered score bar; phone-width settings gear + sheet; desktop keeps the old buttons. */

async function expectPhaseCentered(page: Page) {
  const bar = await page.locator('.game-board .game-info').boundingBox();
  const phase = await page.locator('.game-board .game-info .phase-label').boundingBox();
  const vw = page.viewportSize()!.width;
  expect(bar && phase).toBeTruthy();
  const barCenter = bar!.x + bar!.width / 2;
  const phaseCenter = phase!.x + phase!.width / 2;
  // The bar sits in the middle of the window and the phase sits in the middle of the bar.
  expect(Math.abs(barCenter - vw / 2)).toBeLessThanOrEqual(4);
  expect(Math.abs(phaseCenter - barCenter)).toBeLessThanOrEqual(4);
}

test.describe('phone width (390px)', () => {
  test.use({ viewport: PHONE, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });

  test('gear opens the settings sheet with sound, score history, report and close', async ({ page }) => {
    await enterAsGuest(page, 'PhoneQA');
    await startSoloGame(page, { length: 'Quick game' });

    const gear = page.getByRole('button', { name: 'Settings', exact: true });
    await expect(gear).toBeVisible();
    await expect(gear).toHaveClass(/game-settings-btn/);
    const box = (await gear.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x + box.width).toBeLessThanOrEqual(PHONE.width);
    await expect(gear).toHaveAttribute('aria-expanded', 'false');

    // The old bar buttons move into the sheet on phones.
    await expect(page.locator('.game-controls .sound-toggle')).toBeHidden();
    await expect(page.locator('.game-controls .btn-report-bot')).toBeHidden();
    await expect(page.locator('.game-controls .history-btn')).toBeHidden();

    await expectPhaseCentered(page);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'phone-score-bar.png') });

    // Open.
    await gear.click();
    const sheet = page.getByRole('dialog', { name: 'Settings' });
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveClass(/game-settings-sheet/);
    await expect(gear).toHaveAttribute('aria-expanded', 'true');
    await expect(sheet.locator('h3')).toHaveText('Settings');

    // Sound row flips its label (sound is off by default).
    const soundRow = sheet.locator('.game-settings-row').first();
    await expect(soundRow).toHaveText('Sound off');
    await soundRow.click();
    await expect(soundRow).toHaveText('Sound on');
    expect(await page.evaluate(() => localStorage.getItem('cyprus-sound'))).toBe('on');
    await soundRow.click();
    await expect(soundRow).toHaveText('Sound off');
    expect(await page.evaluate(() => localStorage.getItem('cyprus-sound'))).toBe('off');

    // Report a bug is disabled for guests.
    const report = sheet.getByRole('button', { name: 'Report a bug' });
    await expect(report).toBeVisible();
    await expect(report).toBeDisabled();

    // Every row is a comfortable touch target.
    for (const row of await sheet.locator('.game-settings-row').all()) {
      const b = (await row.boundingBox())!;
      expect(b.height).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'phone-settings-sheet.png') });

    // Close button.
    await sheet.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(sheet).toBeHidden();
    await expect(gear).toHaveAttribute('aria-expanded', 'false');

    // Escape closes.
    await gear.click();
    await expect(sheet).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();

    // Backdrop click closes; a click inside the sheet does not.
    await gear.click();
    await expect(sheet).toBeVisible();
    await sheet.locator('h3').click();
    await expect(sheet).toBeVisible();
    await page.locator('.game-settings-overlay').click({ position: { x: 20, y: 20 } });
    await expect(sheet).toBeHidden();

    // Score History opens the history modal even with zero rounds played.
    await gear.click();
    await sheet.getByRole('button', { name: 'Score History', exact: true }).click();
    await expect(sheet).toBeHidden();
    const history = page.locator('.history-modal');
    await expect(history).toBeVisible();
    await expect(history.locator('.score-history-header h3')).toHaveText('Score History');
    await expect(history).toContainText('No rounds played yet.');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'phone-score-history-empty.png') });
    await history.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(history).toBeHidden();
  });
});

test.describe('phone width (390px) score readability', () => {
  test.use({ viewport: PHONE, isMobile: true, hasTouch: true });

  test('both team scores are readable in the phone score bar', async ({ page }, testInfo) => {
    // Regression: at 390px the phase cluster used to squeeze the scores to "Y" / "C".
    await enterAsGuest(page, 'ScoreQA');
    const results: string[] = [];
    for (const length of ['Quick game', '500'] as const) {
      await startSoloGame(page, { length });
      const m = await page.evaluate(() =>
        ['.game-info > .name-teammate', '.game-info > .name-opponent'].map((sel) => {
          const el = document.querySelector(sel) as HTMLElement;
          return { sel, text: el.textContent, client: el.clientWidth, scroll: el.scrollWidth };
        }),
      );
      results.push(`${length}: ${m.map((x) => `${x.text} ${x.client}/${x.scroll}px`).join(', ')}`);
      await page.locator('.game-controls .leave-btn').click();
      await page.locator('.leave-modal .btn-danger').click();
      // A guest goes straight back to the home panel with the nickname kept.
      await expectGuestHome(page, 'ScoreQA');
      for (const x of m) results.push(`${x.scroll <= x.client + 1 ? 'ok' : 'CLIPPED'} ${length} ${x.sel}`);
    }
    testInfo.annotations.push({ type: 'measured', description: results.join(' | ') });
    expect(results.filter((r) => r.startsWith('CLIPPED')), results.join('\n')).toEqual([]);
  });
});

test.describe('wide desktop (1440px)', () => {
  test.use({ viewport: DESKTOP_WIDE });

  test('gear is hidden and sound / report stay in the score bar', async ({ page }) => {
    await enterAsGuest(page, 'WideQA');
    await startSoloGame(page, { length: '500' });

    await expect(page.locator('.game-settings-btn')).toBeHidden();
    await expect(page.locator('.game-controls .sound-toggle')).toBeVisible();
    const report = page.locator('.game-controls .btn-report-bot');
    await expect(report).toBeVisible();
    await expect(report).toBeDisabled(); // guest
    // The history button only appears once a round is recorded (checked in gameplay-round.spec).
    await expect(page.locator('.game-controls .history-btn')).toHaveCount(0);

    // Sound toggle in the bar still works.
    const sound = page.locator('.game-controls .sound-toggle');
    await expect(sound).toHaveAttribute('title', 'Unmute');
    await sound.click();
    await expect(sound).toHaveAttribute('title', 'Mute');
    await sound.click();
    await expect(sound).toHaveAttribute('title', 'Unmute');

    await expectPhaseCentered(page);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'desktop-score-bar.png') });
  });
});
