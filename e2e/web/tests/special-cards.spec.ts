import path from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { test, expect } from './helpers/fixtures';
import { enterAsGuest, startSoloGame, leaveGame, expectGuestHome } from './helpers/lobby';
import { SCREENSHOT_DIR } from './helpers/api';

/**
 * PR #2 item 3: special cards show Greek names (.special-name), Mahjong has a
 * "1" corner, there are no "Ph"/"Dr" corners, and the Phoenix sorts between
 * the Ace and the Dragon. Hands are random, so deal several solo games and
 * assert on whatever shows up.
 */

const GREEK: Record<string, string> = {
  dragon: 'Δράκος',
  phoenix: 'Φοίνικας',
  dog: 'Σκύλος',
  mahjong: 'Ματζόνγκ',
};
const RANK_LABEL: Record<string, number> = { J: 11, Q: 12, K: 13, A: 14 };

/** Sort rank used by the hand: Dog 0, Mahjong 1, 2..14, Phoenix 14.5, Dragon 15. */
function sortRankFromId(id: string): number {
  switch (id) {
    case 'DOG':
      return 0;
    case 'MAHJONG':
      return 1;
    case 'PHOENIX':
      return 14.5;
    case 'DRAGON':
      return 15;
    default:
      return Number(id.split('_')[1]);
  }
}
function sortRankFromType(type: string): number {
  return sortRankFromId(type.toUpperCase());
}

function assertHandOrder(ranks: number[], where: string) {
  for (let i = 1; i < ranks.length; i++) {
    expect(ranks[i], `${where}: card ${i} (${ranks[i]}) sorts before card ${i - 1} (${ranks[i - 1]}) — ${ranks.join(',')}`).toBeGreaterThanOrEqual(
      ranks[i - 1],
    );
  }
  const phoenix = ranks.indexOf(14.5);
  if (phoenix >= 0) {
    const lastAce = ranks.lastIndexOf(14);
    const dragon = ranks.indexOf(15);
    if (lastAce >= 0) expect(phoenix, `${where}: Phoenix must come after every Ace`).toBeGreaterThan(lastAce);
    if (dragon >= 0) expect(phoenix, `${where}: Phoenix must come before the Dragon`).toBeLessThan(dragon);
  }
}

/** Read a rendered hand (CardComponent elements) as sort ranks, plus the special cards found. */
async function readRenderedCards(cards: Locator) {
  return cards.evaluateAll((els) =>
    els.map((el) => {
      if (el.classList.contains('special-card')) {
        const type = Array.from(el.classList).find((c) => c.startsWith('special-') && c !== 'special-card')!.slice(8);
        return {
          kind: 'special' as const,
          type,
          aria: el.getAttribute('aria-label'),
          name: el.querySelector('.special-name')?.textContent ?? null,
          mark: el.querySelector('.special-mark')?.textContent ?? null,
          hasMini: !!el.querySelector('.special-mini svg'),
          indexText: el.querySelector('.special-index')?.textContent ?? '',
          cornerText: el.querySelector('.card-corner')?.textContent ?? '',
        };
      }
      return { kind: 'normal' as const, rank: el.querySelector('.card-rank')?.textContent ?? '' };
    }),
  );
}

type Rendered = Awaited<ReturnType<typeof readRenderedCards>>[number];

function renderedRank(c: Rendered): number {
  if (c.kind === 'special') return sortRankFromType(c.type);
  return RANK_LABEL[c.rank] ?? Number(c.rank);
}

function assertSpecialRendering(c: Extract<Rendered, { kind: 'special' }>, where: string) {
  expect(Object.keys(GREEK), `${where}: unknown special type ${c.type}`).toContain(c.type);
  expect(c.name, `${where}: .special-name for ${c.type}`).toBe(GREEK[c.type]);
  expect(c.aria, `${where}: aria-label for ${c.type}`).toBe(GREEK[c.type]);
  expect(c.indexText, `${where}: old "Ph"/"Dr" corner on ${c.type}`).not.toMatch(/Ph|Dr/);
  expect(c.cornerText).toBe('');
  if (c.type === 'mahjong') {
    expect(c.mark, `${where}: Mahjong corner`).toBe('1');
  } else {
    expect(c.mark, `${where}: ${c.type} should have no text mark`).toBeNull();
    expect(c.hasMini, `${where}: ${c.type} should show the mini art in the corner`).toBe(true);
  }
}

/** Let the deal / fan-in animations settle so screenshots show the whole hand. */
async function settle(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'), null, { timeout: 5_000 }).catch(() => {});
}

async function backToHome(page: Page, nick: string) {
  await leaveGame(page);
  await expectGuestHome(page, nick);
}

test('special cards: Greek names, Mahjong "1" corner, no Ph/Dr, Phoenix between Ace and Dragon', async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  const MAX_DEALS = 8;
  const seen = new Set<string>();
  let phoenixWithAce = false;
  let phoenixWithDragon = false;
  let bestShot = -1;
  let deals = 0;

  await enterAsGuest(page, 'SpecialQA');

  for (let deal = 1; deal <= MAX_DEALS; deal++) {
    deals = deal;
    await startSoloGame(page, { length: 'Quick game' });

    // Grand Tichu preview (first 8 cards): order by card id.
    const gtHand = page.locator('.grand-tichu-hand button.hand-card-hitbox');
    await expect(gtHand).toHaveCount(8, { timeout: 15_000 });
    const gtIds = (await gtHand.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')!))).map((l) =>
      l.replace(/^(Select|Deselect) card /, ''),
    );
    assertHandOrder(gtIds.map(sortRankFromId), `deal ${deal} grand-tichu hand ${gtIds.join(' ')}`);
    for (const c of await readRenderedCards(page.locator('.grand-tichu-hand .card'))) {
      if (c.kind === 'special') assertSpecialRendering(c, `deal ${deal} GT hand`);
    }
    await page.locator('.grand-tichu-actions .btn-secondary').click();

    // Passing view: all 14 cards, rendered without ids — read ranks / special classes.
    const passCards = page.locator('.pass-hand .pass-hand-card .card');
    await expect(passCards).toHaveCount(14, { timeout: 20_000 });
    const rendered = await readRenderedCards(passCards);
    assertHandOrder(rendered.map(renderedRank), `deal ${deal} pass hand`);
    const specials = rendered.filter((c): c is Extract<Rendered, { kind: 'special' }> => c.kind === 'special');
    for (const c of specials) {
      assertSpecialRendering(c, `deal ${deal} pass hand`);
      seen.add(c.type);
    }
    const ranks = rendered.map(renderedRank);
    if (ranks.includes(14.5) && ranks.includes(14)) phoenixWithAce = true;
    if (ranks.includes(14.5) && ranks.includes(15)) phoenixWithDragon = true;
    if (specials.length > bestShot) {
      bestShot = specials.length;
      await settle(page);
      await page.locator('.pass-hand').screenshot({ path: path.join(SCREENSHOT_DIR, 'special-cards-pass-hand.png') });
    }

    // Pass three normal cards and check the sorted playing hand (by card id) after the exchange.
    for (let i = 0; i < 3; i++) {
      const free = page.locator('.pass-hand .pass-hand-card:not(.pass-hand-assigned)');
      const idx = await free.evaluateAll((els) => els.findIndex((e) => !e.querySelector('.special-card')));
      await free.nth(Math.max(idx, 0)).click();
      await page.locator('.pass-zone.pass-zone-active').first().click();
    }
    await page.locator('.phase-view .btn-group .btn-primary').click();
    const playHand = page.locator('.my-hand-row button.hand-card-hitbox');
    await expect(playHand).toHaveCount(14, { timeout: 30_000 });
    const playIds = (await playHand.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')!))).map((l) =>
      l.replace(/^(Select|Deselect) card /, ''),
    );
    assertHandOrder(playIds.map(sortRankFromId), `deal ${deal} playing hand ${playIds.join(' ')}`);
    for (const id of playIds) if (/^[A-Z]+$/.test(id)) seen.add(id.toLowerCase());
    if (playIds.includes('PHOENIX') && playIds.some((id) => id.endsWith('_14'))) phoenixWithAce = true;
    if (playIds.includes('PHOENIX') && playIds.includes('DRAGON')) phoenixWithDragon = true;
    for (const c of await readRenderedCards(page.locator('.my-hand-row .card'))) {
      if (c.kind === 'special') assertSpecialRendering(c, `deal ${deal} playing hand`);
    }
    if (playIds.includes('PHOENIX') && (playIds.includes('DRAGON') || playIds.some((id) => id.endsWith('_14')))) {
      await settle(page);
      await page.locator('.my-hand-row').screenshot({ path: path.join(SCREENSHOT_DIR, 'special-cards-phoenix-order.png') });
    }

    await backToHome(page, 'SpecialQA');
    if (seen.size === 4 && phoenixWithAce && phoenixWithDragon) break;
  }

  testInfo.annotations.push({
    type: 'observed',
    description: `deals=${deals} specials=[${[...seen].join(', ')}] phoenix+ace=${phoenixWithAce} phoenix+dragon=${phoenixWithDragon}`,
  });
  // ~70% of hands hold a special; across up to 8 deals this is effectively certain.
  expect(seen.size, 'no special card appeared in any dealt hand').toBeGreaterThan(0);
});
