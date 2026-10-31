import path from 'node:path';
import { test, expect } from './helpers/fixtures';
import {
  enterAsGuest,
  startSoloGame,
  scoreBar,
  expectGuestHome,
  expectScoreTableAligned,
  watchForReconnectBanner,
  bannerWasSeen,
  settleAnimations,
  PHONE,
} from './helpers/lobby';
import { autoPlay, newStats, expectDogLeadsValid } from './helpers/autoplay';
import { SCREENSHOT_DIR } from './helpers/api';

/**
 * PR #2 items 4 + 5 (+ 10 opportunistically): a solo Quick game (one round)
 * played entirely through the UI, from Grand Tichu to Game Over and back.
 */
test('solo Quick game plays through the UI to Game Over and back to the lobby', async ({ page }, testInfo) => {
  test.setTimeout(480_000);

  await enterAsGuest(page, 'QuickQA');
  await startSoloGame(page, { length: 'Quick game', difficulty: 'medium' });

  // Quick game: no "/ N" target in the bar, "· 1 round" next to the phase.
  const bar = scoreBar(page);
  await expect(bar.myTeam).toHaveText(/^Your Team: \d+$/);
  await expect(bar.opponents).toHaveText(/^Opponents: \d+$/);
  await expect(bar.phaseTitle).toContainText('· 1 round');

  const stats = newStats();
  let shotPlaying = false;
  await autoPlay(
    page,
    {
      until: 'scoring',
      timeoutMs: 400_000,
      onState: async (st) => {
        if (!shotPlaying && st.s === 'myTurn') {
          shotPlaying = true;
          await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'quick-game-playing.png') });
        }
      },
    },
    stats,
  );

  // Round over: the quick game's only button says "See result".
  const scoringBtn = page.locator('.scoring-layout .phase-view > .btn-primary');
  await expect(scoringBtn).toHaveText('See result');
  await expect(bar.phaseTitle).toContainText('· 1 round');
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'quick-game-scoring.png') });
  await scoringBtn.click();

  // Game over: Victory / Defeat / Tie, consistent with the final scores.
  const title = page.locator('.game-over-banner h2');
  await expect(title).toHaveText(/^(Victory!|Defeat|Tie)$/, { timeout: 15_000 });
  const totals = await page.locator('.game-over-view .scores .score-total').allTextContents();
  const [mine, theirs] = totals.map((t) => Number(t.trim()));
  const expected = mine > theirs ? 'Victory!' : mine < theirs ? 'Defeat' : 'Tie';
  await expect(title).toHaveText(expected);
  await page.waitForTimeout(900); // let the 0.6s winner-entrance animation finish before the shot
  // The round's score table: each value under its own column header.
  const table = page.locator('.game-over-view .score-table');
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expectScoreTableAligned(table);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'quick-game-over.png') });
  const desktopViewport = page.viewportSize()!;
  await page.setViewportSize(PHONE);
  await expectScoreTableAligned(table);
  await table.scrollIntoViewIfNeeded();
  await settleAnimations(page);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'phone-game-over-score-table.png') });
  await page.setViewportSize(desktopViewport);

  testInfo.annotations.push(
    { type: 'result', description: `${expected} ${mine}-${theirs}` },
    {
      type: 'autoplay',
      description: `plays=${stats.plays} passes=${stats.passes} hints=${stats.hintsUsed} rejected=${stats.rejectedPlays} wishes=${stats.wishesMade} forcedWish=${stats.forcedWishTurns} dragonGives=${stats.dragonGives} skips=${stats.skips}`,
    },
    { type: 'dog-lead', description: stats.dogLeads.map((d) => `${d.from}: ${d.label} (dog on table: ${d.dogCardOnTable})`).join(' | ') || 'not seen this run' },
  );

  // Item 10, only if it happened: "Dog → lead passes to <partner>", Dog stays on the table.
  expectDogLeadsValid(stats, 'QuickQA');

  // Back to Lobby: a guest returns to their home panel (not the sign-in card),
  // and leaving on purpose never flashes the "Reconnecting..." banner.
  await watchForReconnectBanner(page);
  await page.locator('.game-over-view .btn-play-again').click();
  await expect(page.locator('.lobby-fullscreen')).toBeVisible();
  await expect(page.locator('.game-board')).toHaveCount(0);
  await expectGuestHome(page, 'QuickQA');
  await page.waitForTimeout(1_500);
  expect(await bannerWasSeen(page), 'Reconnecting banner after Back to Lobby').toBe(false);
});
