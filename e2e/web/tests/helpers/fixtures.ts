import { test as base, expect, type Page } from '@playwright/test';

export type CapturedError = {
  page: string;
  kind: 'console' | 'pageerror';
  text: string;
  url?: string;
};

/**
 * Console noise we expect and do not treat as a failure.
 * Chromium logs every non-2xx fetch as "Failed to load resource". The app
 * probes a few endpoints that legitimately answer 401/404 for guests or for
 * users without stats yet.
 */
const EXPECTED_NOISE: Array<(e: CapturedError) => boolean> = [
  (e) =>
    e.kind === 'console' &&
    /Failed to load resource: the server responded with a status of 401/.test(e.text) &&
    /\/auth\/me|\/api\/leaderboard\/(me|history)|\/api\/friends/.test(e.url ?? ''),
  (e) =>
    e.kind === 'console' &&
    /Failed to load resource: the server responded with a status of 404/.test(e.text) &&
    /\/api\/leaderboard\/me/.test(e.url ?? ''),
  // Google Fonts can't load on an offline machine; a CSP block still fails.
  (e) =>
    /fonts\.(googleapis|gstatic)\.com/.test(`${e.text} ${e.url ?? ''}`) &&
    /net::ERR_/.test(e.text),
];

export function isExpectedNoise(e: CapturedError): boolean {
  return EXPECTED_NOISE.some((rule) => rule(e));
}

export function trackPageErrors(page: Page, log: CapturedError[], label = 'page'): void {
  page.on('console', (msg) => {
    const type = msg.type();
    const text = msg.text();
    // React development warnings come through console.error / console.warn
    // and start with "Warning:". The prod bundle should never emit them.
    if (type === 'error' || (type === 'warning' && /^Warning:|React/.test(text))) {
      log.push({ page: label, kind: 'console', text, url: msg.location()?.url });
    }
  });
  page.on('pageerror', (err) => {
    log.push({ page: label, kind: 'pageerror', text: String(err?.stack ?? err) });
  });
}

type Fixtures = {
  /** Every console error / uncaught exception seen by tracked pages in this test. */
  errorLog: CapturedError[];
  /** Register an extra page (second context, etc.) for error tracking. */
  trackErrors: (page: Page, label?: string) => void;
  /** Auto fixture: fails the test at teardown on unexpected console/page errors. */
  failOnUnexpectedErrors: void;
};

export const test = base.extend<Fixtures>({
  errorLog: async ({}, use) => {
    await use([]);
  },
  trackErrors: async ({ errorLog }, use) => {
    await use((page, label) => trackPageErrors(page, errorLog, label));
  },
  page: async ({ page, errorLog }, use) => {
    trackPageErrors(page, errorLog, 'main');
    await use(page);
  },
  failOnUnexpectedErrors: [
    async ({ errorLog }, use, testInfo) => {
      await use();
      if (errorLog.length > 0) {
        await testInfo.attach('console-errors.json', {
          body: JSON.stringify(errorLog, null, 2),
          contentType: 'application/json',
        });
      }
      const unexpected = errorLog.filter((e) => !isExpectedNoise(e));
      // Only report when the test body itself passed; otherwise the real
      // failure message would be hidden behind this one.
      if (unexpected.length > 0 && testInfo.status === testInfo.expectedStatus) {
        throw new Error(
          `Unexpected console/page errors (${unexpected.length}):\n` +
            unexpected.map((e) => `  [${e.page}] ${e.kind}: ${e.text}${e.url ? ` (${e.url})` : ''}`).join('\n'),
        );
      }
    },
    { auto: true },
  ],
});

export { expect };
