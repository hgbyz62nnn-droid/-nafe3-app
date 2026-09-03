import { defineConfig, devices } from '@playwright/test';

/**
 * TRAINO E2E + visual regression config (Phase 12).
 *
 * Canonical viewport is 390x844 — the same reference size the 11 golden
 * screenshots in tests/visual/references/ were captured at (see
 * references/screens/*.png at the repo root, copied in byte-identical).
 * Additional viewports for the responsive smoke pass are set per-test via
 * test.use({ viewport }) in tests/visual/responsive.spec.ts, not here.
 *
 * The app is entirely client-side (React + localStorage, no backend), so
 * "production-like" here means a real Vite production build served by
 * `vite preview` — never a manually-started dev server a developer forgot
 * to close. Playwright starts and stops this server itself per run, so the
 * suite works from a clean environment / CI with a single command.
 */

const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}`;

// Pre-installed Chromium in this environment; @playwright/test's own
// bundled revision may not have a downloaded binary here (browser
// downloads are disabled), so pin to the one that's actually present.
const CHROMIUM_PATH = process.env.PLAYWRIGHT_CHROMIUM_PATH || '/opt/pw-browsers/chromium';

export default defineConfig({
  testDir: './tests',
  // Golden images live at tests/visual/references/<name>.png — the exact
  // files copied byte-identical from the repo's canonical reference
  // screenshots (see final report §18-19). toHaveScreenshot('home.png')
  // resolves directly to tests/visual/references/home.png; there is no
  // separate "actual browser output" snapshot directory to keep in sync.
  snapshotPathTemplate: '{testDir}/visual/references/{arg}{ext}',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['list'],
  ],
  timeout: 30_000,
  expect: {
    timeout: 6_000,
    // Visual diff tolerance (spec §23): a small, documented per-pixel color
    // tolerance absorbs anti-aliasing/subpixel font rendering noise between
    // runs on the same machine, without hiding a real layout/color
    // regression. Not loosened further than this.
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled' },
  },
  use: {
    baseURL: BASE_URL,
    viewport: { width: 390, height: 844 },
    locale: 'en-US',
    timezoneId: 'UTC',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    launchOptions: {
      executablePath: CHROMIUM_PATH,
      // Headless Chromium's own background telemetry (autofill/safe-browsing/
      // account-sync) tries outbound requests this sandboxed environment
      // blocks, which can otherwise stall a page's "load" event (e.g. on
      // page.reload()) waiting on those in-flight requests to settle.
      args: [
        '--disable-background-networking',
        '--disable-component-update',
        '--disable-sync',
        '--disable-features=AutofillServerCommunication,OptimizationHints',
      ],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
