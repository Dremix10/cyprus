import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.QA_PORT ?? 3311);
export const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * Cyprus web E2E suite (PR #2 QA).
 *
 * The suite boots its own throwaway server on 127.0.0.1:3311 from the existing
 * build (see scripts/start-qa-server.sh). Each `playwright test` run wipes the
 * QA data dir, so the SQLite DB starts empty. Set QA_REUSE=1 to attach to a
 * QA server you already started by hand.
 */
export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  // Full games against bots are slow; individual tests raise this further.
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: Number(process.env.QA_WORKERS ?? 3),
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: 'bash scripts/start-qa-server.sh',
    url: `${BASE_URL}/health`,
    reuseExistingServer: process.env.QA_REUSE === '1',
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: { QA_PORT: String(PORT) },
  },
});
