import path from 'node:path';
import { test, expect } from './helpers/fixtures';
import { enterAsGuest, startSoloGame, scoreBar, leaveGame, expectScoreTableAligned, settleAnimations, DESKTOP_WIDE, PHONE } from './helpers/lobby';
import { autoPlay, newStats, expectDogLeadsValid } from './helpers/autoplay';
import { SCREENSHOT_DIR } from './helpers/api';

/**
 * PR #2 items 2 + 4 for a normal-length game: after a full round of a 250
 * game the scoring button says "Next Round" (not "See result"), the bar keeps
 * "/ 250", and on wide desktop the score-history button appears in the bar.
 */
test.use({ viewport: DESKTOP_WIDE });

test('solo 250: one full round → "Next Round", history button in the bar, round 2 starts', async ({ page }, testInfo) => {
  test.setTimeout(480_000);
  await enterAsGuest(page, 'RoundQA');
  await startSoloGame(page, { length: '250', difficulty: 'medium' });
  const bar = scoreBar(page);
  await expect(bar.myTeam).toHaveText(/^Your Team: 0 \/ 250$/);
  await expect(bar.phaseTitle).not.toContainText('1 round');
  await expect(page.locator('.game-controls .history-btn')).toHaveCount(0);

  const stats = newStats();
  await autoPlay(page, { until: 'scoring', timeoutMs: 400_000 }, stats);

  const scoringBtn = page.locator('.scoring-layout .phase-view > .btn-primary');
  await expect(scoringBtn).toHaveText('Next Round');
  await expect(bar.myTeam).toHaveText(/^Your Team: -?\d+ \/ 250$/);
  await expect(bar.phaseTitle).not.toContainText('1 round');

  // Desktop: the history button joins the bar once a round is recorded.
  const historyBtn = page.locator('.game-controls .history-btn');
  await expect(historyBtn).toBeVisible();
  await expect(page.locator('.game-settings-btn')).toBeHidden();
  await historyBtn.click();
  const modal = page.locator('.history-modal');
  await expect(modal).toBeVisible();
  await expect(modal.locator('.score-table tbody tr')).toHaveCount(1);
  await expectScoreTableAligned(modal.locator('.score-table'));
  await settleAnimations(page);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'desktop-round1-history.png') });
  // Same table on a phone: still one value per column.
  await page.setViewportSize(PHONE);
  await expectScoreTableAligned(modal.locator('.score-table'));
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'phone-round1-history.png') });
  await page.setViewportSize(DESKTOP_WIDE);
  await modal.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(modal).toBeHidden();

  testInfo.annotations.push(
    { type: 'autoplay', description: `plays=${stats.plays} passes=${stats.passes} hints=${stats.hintsUsed} rejected=${stats.rejectedPlays} wishes=${stats.wishesMade} dragonGives=${stats.dragonGives} skips=${stats.skips}` },
    { type: 'dog-lead', description: stats.dogLeads.map((d) => `${d.from}: ${d.label} (dog on table: ${d.dogCardOnTable})`).join(' | ') || 'not seen this run' },
  );
  expectDogLeadsValid(stats, 'RoundQA');

  // Unless that round already reached 250, Next Round deals round 2.
  const totals = await page.locator('.scoring-layout .scores .score-total').allTextContents();
  const reached = totals.some((t) => Number(t) >= 250);
  await scoringBtn.click();
  if (reached) {
    await expect(page.locator('.game-over-view')).toBeVisible({ timeout: 15_000 });
  } else {
    await expect(page.locator('.grand-tichu-view, .pass-hand').first()).toBeVisible({ timeout: 20_000 });
    await expect(bar.phaseTitle).not.toContainText('1 round');
    await expect(historyBtn).toBeVisible();
    await leaveGame(page);
  }
});
