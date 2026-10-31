import path from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect } from './helpers/fixtures';
import {
  enterAsGuest,
  lengthOption,
  pickLength,
  startSoloGame,
  createRoomViaUi,
  scoreBar,
  leaveGame,
  expectGuestHome,
  settleAnimations,
  PHONE,
  type LengthLabel,
} from './helpers/lobby';
import { SCREENSHOT_DIR } from './helpers/api';

/**
 * PR #2 item 4: the game-length picker on Create Room and Solo. Play Online has
 * no picker: online games always go to 500, and the home panel says so.
 */

const LABELS = ['Quick game', '250', '500', '1000'];

test('home has no length picker, just a "500 points" note under Play Online; Create / Solo keep the picker', async ({ page }) => {
  await enterAsGuest(page, 'LenQA');

  // Home panel: no picker, a muted note right under Play Online.
  const home = page.locator('.lobby-form');
  await expect(home.locator('.length-picker')).toHaveCount(0);
  const note = home.locator('.play-online-note');
  await expect(note).toHaveText('Online games go to 500 points');
  const noteBox = (await note.boundingBox())!;
  const playBox = (await page.locator('.btn-play-online').boundingBox())!;
  const createBox = (await page.getByRole('button', { name: 'Create Room', exact: true }).boundingBox())!;
  expect(noteBox.y).toBeGreaterThanOrEqual(playBox.y + playBox.height - 1);
  expect(noteBox.y + noteBox.height).toBeLessThanOrEqual(createBox.y + 1);
  await settleAnimations(page);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'desktop-home-online-note.png') });

  // Create Room shows the picker. Default is 1000; exactly one option pressed at a time.
  await page.getByRole('button', { name: 'Create Room', exact: true }).click();
  const sub = page.locator('.lobby-subview');
  const picker = sub.locator('.length-picker');
  await expect(picker.locator('.length-label')).toHaveText('Game length');
  await expect(picker.getByRole('group', { name: 'Game length' })).toBeVisible();
  await expect(picker.locator('.length-option')).toHaveText(LABELS);
  await expect(lengthOption(sub, '1000')).toHaveAttribute('aria-pressed', 'true');
  await expect(picker.locator('.length-option[aria-pressed="true"]')).toHaveCount(1);
  for (const label of ['Quick game', '250', '500'] as const) {
    await expect(lengthOption(sub, label)).toHaveAttribute('aria-pressed', 'false');
  }
  await pickLength(sub, '500');
  await expect(lengthOption(sub, '1000')).toHaveAttribute('aria-pressed', 'false');
  await expect(lengthOption(sub, '500')).toHaveClass(/length-option-active/);
  await expect(picker.locator('.length-option[aria-pressed="true"]')).toHaveCount(1);
  await pickLength(sub, 'Quick game');
  await sub.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(home.locator('.length-picker')).toHaveCount(0);

  // Solo shows it too, keeping the choice.
  await page.getByRole('button', { name: 'Solo Game', exact: true }).click();
  await expect(sub.locator('.length-picker .length-option')).toHaveText(LABELS);
  await expect(lengthOption(sub, 'Quick game')).toHaveAttribute('aria-pressed', 'true');
  await pickLength(sub, '250');
  await sub.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Create Room', exact: true }).click();
  await expect(lengthOption(sub, '250')).toHaveAttribute('aria-pressed', 'true');
});

test('390px phone: the note and the Solo picker fit without horizontal scrolling', async ({ browser, trackErrors }) => {
  const context = await browser.newContext({ viewport: PHONE, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  trackErrors(page, 'phone');
  const noOverflow = async () =>
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  try {
    await enterAsGuest(page, 'LenPhone');
    const note = page.locator('.lobby-form .play-online-note');
    await expect(note).toBeVisible();
    const nb = (await note.boundingBox())!;
    expect(nb.x).toBeGreaterThanOrEqual(0);
    expect(nb.x + nb.width).toBeLessThanOrEqual(PHONE.width);
    await noOverflow();
    await settleAnimations(page);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'phone-home-online-note.png') });

    await page.getByRole('button', { name: 'Solo Game', exact: true }).click();
    const options = page.locator('.lobby-subview .length-picker .length-option');
    await expect(options).toHaveCount(4);
    for (const o of await options.all()) {
      const b = (await o.boundingBox())!;
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(PHONE.width);
    }
    await noOverflow();
  } finally {
    await context.close();
  }
});

/** Create a room with `length` and read the waiting room's length line. */
async function waitingRoomLength(page: Page, length: LengthLabel) {
  await createRoomViaUi(page, { length });
  return page.locator('.waiting-room .room-length');
}

for (const [label, expected] of [
  ['Quick game', 'Quick game · 1 round'],
  ['250', 'Game to 250'],
  ['1000', 'Game to 1000'],
] as const) {
  test(`waiting room shows the game length: ${label} → "${expected}"`, async ({ page }) => {
    await enterAsGuest(page, `Wait${label.slice(0, 4)}`);
    const line = await waitingRoomLength(page, label);
    await expect(line).toHaveText(expected);
    // It sits between the room header and the share hint.
    const lineBox = (await line.boundingBox())!;
    const headerBox = (await page.locator('.waiting-room .room-header').boundingBox())!;
    const hintBox = (await page.locator('.waiting-room .room-code-hint').boundingBox())!;
    expect(lineBox.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height - 1);
    expect(lineBox.y + lineBox.height).toBeLessThanOrEqual(hintBox.y + 1);
    if (label === 'Quick game') {
      await settleAnimations(page);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'desktop-waiting-room-length.png') });
    }
    await page.locator('.waiting-room .room-header .btn-small').click();
    await expectGuestHome(page, `Wait${label.slice(0, 4)}`);
  });
}

test('390px phone: the waiting room length line fits', async ({ browser, trackErrors }) => {
  const context = await browser.newContext({ viewport: PHONE, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  trackErrors(page, 'phone');
  try {
    await enterAsGuest(page, 'WaitPhone');
    const line = await waitingRoomLength(page, '500');
    await expect(line).toHaveText('Game to 500');
    const b = (await line.boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(PHONE.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await settleAnimations(page);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'phone-waiting-room-length.png') });
  } finally {
    await context.close();
  }
});

for (const [label, target] of [
  ['250', 250],
  ['500', 500],
  ['1000', 1000],
] as const) {
  test(`solo ${label}: score bar shows "/ ${target}" and no "1 round"`, async ({ page }) => {
    await enterAsGuest(page, `Len${label}`);
    await startSoloGame(page, { length: label });
    const bar = scoreBar(page);
    await expect(bar.myTeam).toHaveText(new RegExp(`^Your Team: \\d+ / ${target}$`));
    await expect(bar.opponents).toHaveText(new RegExp(`^Opponents: \\d+ / ${target}$`));
    await expect(bar.phaseTitle).not.toContainText('1 round');
    await leaveGame(page);
  });
}

test('solo Quick game: score bar shows no "/ N" and shows "· 1 round"', async ({ page }) => {
  await enterAsGuest(page, 'LenQuick');
  await startSoloGame(page, { length: 'Quick game' });
  const bar = scoreBar(page);
  await expect(bar.myTeam).toHaveText(/^Your Team: \d+$/);
  await expect(bar.opponents).toHaveText(/^Opponents: \d+$/);
  await expect(bar.phaseTitle).toHaveText(/· 1 round$/);
  await leaveGame(page);
});
