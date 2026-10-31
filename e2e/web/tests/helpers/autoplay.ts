import { expect, type Page } from '@playwright/test';

/**
 * UI auto-player for a solo game. It only clicks what a person would click:
 * Grand Tichu "Pass", the three pass slots, cards in hand, Play / Pass, the
 * solo Hint bulb, the Mahjong wish grid, the Dragon give buttons, Skip, and
 * the scoring button.
 *
 * Strategy on my turn:
 *   - leading: play the lowest card (Dog/Mahjong first, which exercises the
 *     dog-lead notice and the wish prompt when we hold them);
 *   - following: ask the solo Hint; play what it selects, otherwise Pass;
 *   - wish forces a play (no Pass button): Hint first, then try singles.
 * A rejected play (hand unchanged, still my turn) marks those cards as tried.
 */

export type GameUiState =
  | { s: 'gameover'; title: string }
  | { s: 'scoring'; button: string }
  | { s: 'grandTichu' }
  | { s: 'grandTichuWait' }
  | { s: 'passing' }
  | { s: 'passWait' }
  | { s: 'wish' }
  | { s: 'skip' }
  | { s: 'dragonGive' }
  | {
      s: 'myTurn';
      canPass: boolean;
      wishForced: boolean;
      leading: boolean;
      hand: string[];
      hintEnabled: boolean;
      trickSig: string;
    }
  | { s: 'waiting'; phase: string }
  | { s: 'lobby' }
  | { s: 'unknown' };

export type AutoplayStats = {
  actions: string[];
  plays: number;
  passes: number;
  hintsUsed: number;
  rejectedPlays: number;
  wishesMade: number;
  forcedWishTurns: number;
  dragonGives: number;
  skips: number;
  scoringButtons: string[];
  dogLeadLabels: string[];
  /** Each distinct dog-lead notice seen: who played the Dog, the label, whether the Dog card stayed on the table. */
  dogLeads: DogLead[];
  specialsInHand: Set<string>;
  rounds: number;
  final: GameUiState['s'];
};

export type DogLead = {
  label: string;
  from: string;
  dogCardOnTable: boolean;
  top: string;
  left: string;
  right: string;
  /** Names of the players already out when the notice showed. */
  out: string[];
};

export function newStats(): AutoplayStats {
  return {
    actions: [],
    plays: 0,
    passes: 0,
    hintsUsed: 0,
    rejectedPlays: 0,
    wishesMade: 0,
    forcedWishTurns: 0,
    dragonGives: 0,
    skips: 0,
    scoringButtons: [],
    dogLeadLabels: [],
    dogLeads: [],
    specialsInHand: new Set(),
    rounds: 0,
    final: 'unknown',
  };
}

export async function detectState(page: Page): Promise<GameUiState & { dogLead: string | null; dogInfo: DogLead | null }> {
  return page.evaluate(() => {
    const $ = (sel: string, root: ParentNode = document) => root.querySelector(sel) as HTMLElement | null;
    const dogLead = $('.dog-lead-label')?.textContent ?? null;
    const dogInfo = dogLead
      ? {
          label: dogLead,
          // While the Dog resolves (dogPending) it is still a trick play; afterwards it
          // moves into .dog-lead-notice. Either way it must be on the table.
          from: (Array.from(document.querySelectorAll('.trick-area .trick-play')).find((p) => p.querySelector('.special-dog'))
            ?.querySelector('.trick-player')?.textContent ?? '').replace('★', '').trim(),
          dogCardOnTable: !!$('.trick-area .special-dog'),
          top: $('.opponent-top .opponent-name')?.textContent ?? '',
          left: $('.opponent-left .opponent-name')?.textContent ?? '',
          right: $('.opponent-right .opponent-name')?.textContent ?? '',
          out: Array.from(document.querySelectorAll('.opponent-top, .opponent-left, .opponent-right'))
            .filter((o) => o.querySelector('.out-badge'))
            .map((o) => o.querySelector('.opponent-name')?.textContent ?? '')
            .concat(document.querySelectorAll('.my-hand-row button.hand-card-hitbox').length === 0 ? ['__me__'] : []),
        }
      : null;
    const wrap = <T extends object>(o: T) => ({ ...o, dogLead, dogInfo });

    if (!$('.game-board')) return wrap($('.lobby-fullscreen') ? { s: 'lobby' as const } : { s: 'unknown' as const });
    const over = $('.game-over-view');
    if (over) return wrap({ s: 'gameover' as const, title: $('.game-over-banner h2', over)?.textContent ?? '' });
    const scoring = $('.scoring-layout');
    if (scoring) {
      return wrap({ s: 'scoring' as const, button: $('.phase-view > .btn-primary', scoring)?.textContent ?? '' });
    }
    if ($('.grand-tichu-view')) return wrap({ s: 'grandTichu' as const });
    if ($('.pass-hand')) return wrap({ s: 'passing' as const });
    if ($('.wish-selector')) return wrap({ s: 'wish' as const });
    if ($('.btn-skip')) return wrap({ s: 'skip' as const });

    const bar = $('.game-action-bar');
    const play = $('.play-pass-group .btn-play');
    if (bar && !play && bar.querySelectorAll(':scope > button.btn-secondary').length > 0) {
      return wrap({ s: 'dragonGive' as const });
    }
    if (play) {
      const hand = Array.from(document.querySelectorAll('.my-hand-row button.hand-card-hitbox')).map((b) =>
        (b.getAttribute('aria-label') ?? '').replace(/^(Select|Deselect) card /, ''),
      );
      const trick = $('.trick-area .trick-cards:not(.dog-lead-notice)');
      return wrap({
        s: 'myTurn' as const,
        canPass: !!$('.play-pass-group .btn-pass'),
        wishForced: !!$('.play-pass-group .wish-forced-label'),
        leading: !trick,
        hand,
        hintEnabled: !!$('.game-controls .hint-btn:not([disabled])'),
        trickSig: trick?.textContent ?? '',
      });
    }
    const phase = $('.game-phase-title')?.textContent ?? '';
    if (/Change Cards/.test($('.phase-view')?.textContent ?? '')) return wrap({ s: 'passWait' as const });
    if ($('.phase-view') === null && /Grand Tichu/i.test(phase)) return wrap({ s: 'grandTichuWait' as const });
    return wrap({ s: 'waiting' as const, phase });
  });
}

function handButton(page: Page, id: string, selected: boolean) {
  return page.locator(`.my-hand-row button.hand-card-hitbox[aria-label="${selected ? 'Deselect' : 'Select'} card ${id}"]`);
}

/** Select a card in the playing hand: tap it; fall back to keyboard if a neighbour overlaps it. */
export async function selectCard(page: Page, id: string): Promise<void> {
  const btn = handButton(page, id, false);
  try {
    await btn.click({ timeout: 2_500 });
  } catch {
    await btn.focus();
    await page.keyboard.press('Enter');
  }
  await expect(handButton(page, id, true)).toHaveCount(1, { timeout: 2_000 });
}

async function clearSelection(page: Page): Promise<void> {
  const selected = page.locator('.my-hand-row button.hand-card-hitbox[aria-pressed="true"]');
  const n = await selected.count();
  for (let i = 0; i < n; i++) {
    try {
      await selected.first().click({ timeout: 1_500 });
    } catch {
      await selected.first().focus();
      await page.keyboard.press('Enter');
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Wait until it is no longer "my turn with this exact hand", or time out. */
async function waitForTurnChange(page: Page, handBefore: number, timeoutMs = 4_000): Promise<'changed' | 'same'> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    await sleep(150);
    const st = await detectState(page);
    if (st.s !== 'myTurn') return 'changed';
    if (st.hand.length !== handBefore) return 'changed';
  }
  return 'same';
}

async function doPassPhase(page: Page): Promise<void> {
  for (let i = 0; i < 3; i++) {
    const free = page.locator('.pass-hand .pass-hand-card:not(.pass-hand-assigned)');
    // Keep the specials so the playing phase exercises Dog / Mahjong / Dragon.
    const idx = await free.evaluateAll((els) => els.findIndex((e) => !e.querySelector('.special-card')));
    const card = free.nth(idx >= 0 ? idx : 0);
    try {
      await card.click({ timeout: 2_500 });
    } catch {
      await card.dispatchEvent('click');
    }
    await page.locator('.pass-zone.pass-zone-active').first().click();
  }
  await page.locator('.phase-view .btn-group .btn-primary').click();
  await expect(page.locator('.pass-hand')).toHaveCount(0, { timeout: 5_000 });
}

async function useHint(page: Page, stats: AutoplayStats): Promise<'play' | 'pass' | 'none'> {
  const hint = page.locator('.game-controls .hint-btn');
  if (!(await hint.isEnabled().catch(() => false))) return 'none';
  await hint.click({ timeout: 2_000 });
  stats.hintsUsed++;
  // Resolves to: cards auto-selected, or the bulb turns into a "Pass" suggestion, or an error title.
  const end = Date.now() + 8_000;
  while (Date.now() < end) {
    await sleep(150);
    const selected = await page.locator('.my-hand-row button.hand-card-hitbox[aria-pressed="true"]').count();
    if (selected > 0) return 'play';
    const cls = (await hint.getAttribute('class').catch(() => '')) ?? '';
    if (cls.includes('hint-btn-pass')) return 'pass';
    if (!(await hint.count())) return 'none';
    if (cls.includes('hint-btn-used')) return 'none';
    const title = (await hint.getAttribute('title').catch(() => '')) ?? '';
    if (!cls.includes('hint-btn-loading') && title && !/Get a hint|Thinking/.test(title)) return 'none';
  }
  return 'none';
}

export type AutoplayOptions = {
  /** 'scoring' stops on the round-over screen; 'gameover' clicks through to Game Over. */
  until: 'scoring' | 'gameover';
  timeoutMs?: number;
  strategy?: 'hint' | 'passive';
  /** Called once per loop with the detected state (for screenshots / observations). */
  onState?: (state: GameUiState & { dogLead: string | null; dogInfo: DogLead | null }) => Promise<void> | void;
};

export async function autoPlay(page: Page, opts: AutoplayOptions, stats: AutoplayStats = newStats()): Promise<AutoplayStats> {
  const deadline = Date.now() + (opts.timeoutMs ?? 300_000);
  const strategy = opts.strategy ?? 'hint';
  let tried = new Set<string>();
  let triedSig = '';
  let consecutiveErrors = 0;
  let lastScoringClick = 0;

  while (Date.now() < deadline) {
    let st: GameUiState & { dogLead: string | null; dogInfo: DogLead | null };
    try {
      st = await detectState(page);
    } catch (err) {
      if (++consecutiveErrors > 20) throw err;
      await sleep(300);
      continue;
    }
    if (st.dogLead && !stats.dogLeadLabels.includes(st.dogLead)) stats.dogLeadLabels.push(st.dogLead);
    if (st.dogInfo && !stats.dogLeads.some((d) => d.label === st.dogInfo!.label && d.from === st.dogInfo!.from)) {
      stats.dogLeads.push(st.dogInfo);
    }
    if (opts.onState) await opts.onState(st);

    try {
      switch (st.s) {
        case 'gameover':
          stats.final = 'gameover';
          return stats;
        case 'lobby':
          stats.final = 'lobby';
          return stats;
        case 'scoring': {
          if (opts.until === 'scoring') {
            stats.final = 'scoring';
            return stats;
          }
          if (Date.now() - lastScoringClick > 2_000) {
            stats.scoringButtons.push(st.button);
            stats.rounds++;
            stats.actions.push(`scoring:${st.button}`);
            await page.locator('.scoring-layout .phase-view > .btn-primary').click();
            lastScoringClick = Date.now();
          }
          break;
        }
        case 'grandTichu':
          await page.locator('.grand-tichu-actions .btn-secondary').click();
          stats.actions.push('gt:pass');
          await expect(page.locator('.grand-tichu-actions')).toHaveCount(0, { timeout: 5_000 });
          break;
        case 'passing':
          await doPassPhase(page);
          stats.actions.push('pass3');
          break;
        case 'wish': {
          const buttons = page.locator('.wish-selector .wish-btn');
          const n = await buttons.count();
          await buttons.nth(Math.floor(Math.random() * n)).click();
          stats.wishesMade++;
          stats.actions.push('wish');
          await expect(page.locator('.wish-selector')).toHaveCount(0, { timeout: 5_000 });
          break;
        }
        case 'skip':
          await page.locator('.btn-skip').click();
          stats.skips++;
          stats.actions.push('skip');
          await sleep(1_000);
          break;
        case 'dragonGive':
          await page.locator('.game-action-bar > button.btn-secondary').first().click();
          stats.dragonGives++;
          stats.actions.push('dragon-give');
          await sleep(500);
          break;
        case 'myTurn': {
          for (const id of st.hand) {
            if (/^(MAHJONG|DOG|PHOENIX|DRAGON)$/.test(id)) stats.specialsInHand.add(id);
          }
          const sig = `${st.hand.length}|${st.trickSig}`;
          if (sig !== triedSig) {
            tried = new Set();
            triedSig = sig;
          }

          if (!st.leading && st.canPass && strategy === 'passive') {
            await page.locator('.play-pass-group .btn-pass').click();
            stats.passes++;
            stats.actions.push('pass');
            await waitForTurnChange(page, st.hand.length);
            break;
          }

          if (st.wishForced && !tried.has('__forced')) {
            stats.forcedWishTurns++;
            tried.add('__forced');
          }

          // Following (or a forced wish): ask the Hint once per turn.
          if (!st.leading || st.wishForced) {
            if (st.hintEnabled && strategy === 'hint' && !tried.has('__hint')) {
              tried.add('__hint');
              await clearSelection(page);
              const res = await useHint(page, stats);
              if (res === 'play') {
                await page.locator('.play-pass-group .btn-play').click();
                stats.plays++;
                stats.actions.push('play:hint');
                if ((await waitForTurnChange(page, st.hand.length)) === 'same') {
                  stats.rejectedPlays++;
                  stats.actions.push('rejected:hint');
                }
                break;
              }
              if (res === 'pass' && st.canPass) {
                await page.locator('.play-pass-group .btn-pass').click();
                stats.passes++;
                stats.actions.push('pass:hint');
                await waitForTurnChange(page, st.hand.length);
                break;
              }
            }
            if (st.canPass) {
              await clearSelection(page);
              await page.locator('.play-pass-group .btn-pass').click();
              stats.passes++;
              stats.actions.push('pass');
              await waitForTurnChange(page, st.hand.length);
              break;
            }
          }

          // Leading, or forced to play: try singles from the lowest card up.
          const next = st.hand.find((id) => !tried.has(id));
          if (!next) {
            stats.actions.push('stuck');
            await sleep(1_000);
            tried = new Set();
            break;
          }
          tried.add(next);
          await clearSelection(page);
          await selectCard(page, next);
          await page.locator('.play-pass-group .btn-play').click();
          stats.plays++;
          stats.actions.push(`play:${next}`);
          if ((await waitForTurnChange(page, st.hand.length)) === 'same') {
            stats.rejectedPlays++;
            stats.actions.push(`rejected:${next}`);
          }
          break;
        }
        default:
          await sleep(250);
      }
      consecutiveErrors = 0;
    } catch (err) {
      // The table moves on its own (bots, timers); a stale click is expected now and then.
      stats.actions.push(`error:${st.s}:${String((err as Error).message).split('\n')[0].slice(0, 120)}`);
      if (++consecutiveErrors > 25) throw err;
      await sleep(300);
    }
  }
  throw new Error(
    `autoPlay timed out waiting for ${opts.until}. Last actions: ${stats.actions.slice(-25).join(', ')}`,
  );
}

/**
 * PR #2 item 10, opportunistic: every "Dog → lead passes to X" notice names the
 * partner of whoever played the Dog (or, if the partner is already out, the next
 * player still in), and the Dog stays on the table meanwhile.
 */
export function expectDogLeadsValid(stats: AutoplayStats, myName: string): void {
  for (const d of stats.dogLeads) {
    expect(d.label, 'dog-lead label format').toMatch(/^Dog → lead passes to \S/);
    expect(d.dogCardOnTable, `Dog card should stay on the table: ${JSON.stringify(d)}`).toBe(true);
    const partner: Record<string, string> = { [myName]: d.top, [d.top]: myName, [d.left]: d.right, [d.right]: d.left };
    const out = d.out.map((n) => (n === '__me__' ? myName : n));
    if (d.from in partner && !out.includes(partner[d.from])) {
      expect(d.label, `Dog played by ${d.from} should hand the lead to their partner`).toBe(
        `Dog → lead passes to ${partner[d.from]}`,
      );
    } else if (d.from in partner) {
      const to = d.label.replace(/^Dog → lead passes to /, '');
      expect(out, `Dog lead went to ${to}, who is already out: ${JSON.stringify(d)}`).not.toContain(to);
      expect(to, `Dog lead should not go back to ${d.from}`).not.toBe(d.from);
    }
  }
}
