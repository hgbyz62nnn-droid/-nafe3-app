import { test as base, expect } from '@playwright/test';

/**
 * Global error detection (Phase 12 spec §5/§32). Every test built on this
 * fixture automatically fails if the page produced a console.error or an
 * uncaught page error that looks like it came from TRAINO itself. Only a
 * short, documented list of unrelated browser/platform noise is ignored —
 * never a broad "ignore everything" suppression.
 */
const IGNORED_CONSOLE_PATTERNS = [
  // Headless Chromium's own background telemetry (autofill/safe-browsing/
  // account-sync) attempts outbound requests this sandboxed environment
  // blocks; these are Chrome-internal, not application code.
  /ERR_CONNECTION_RESET/,
  /ERR_INTERNET_DISCONNECTED/,
  /accounts\.google\.com/,
  /content-autofill\.googleapis\.com/,
  /clients\d?\.google\.com/,
  // The app's real Google Fonts stylesheet (src/index.css) — an
  // unreachable/slow font CDN in this sandbox is a network-environment
  // fact, not a TRAINO defect; the app renders correctly with a fallback
  // font either way.
  /fonts\.googleapis\.com/,
  /fonts\.gstatic\.com/,
];

export const test = base.extend<{ trainoErrors: string[] }>({
  page: async ({ page }, use) => {
    // The app's own stylesheet loads Google Fonts at runtime
    // (src/index.css) — real, intentional product behavior this phase
    // never touches or asserts on. This sandboxed test environment's
    // outbound network to fonts.googleapis.com/fonts.gstatic.com is slow
    // and unreliable (observed 10s+ stalls, sometimes longer than
    // page.reload()'s timeout), which has nothing to do with whether the
    // SPA itself rendered correctly. Functional E2E assertions never
    // depend on which typeface is showing, so these requests are blocked
    // outright here — a real fix for test flakiness, not a hidden UI
    // difference (visual regression specs use a separate, unblocked
    // fixture — see tests/visual/helpers/visualFixtures.ts — because THOSE
    // do need the real font to match the reference screenshots).
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());

    const originalGoto = page.goto.bind(page);
    page.goto = (url, options) => originalGoto(url, { waitUntil: 'domcontentloaded', ...options });
    const originalReload = page.reload.bind(page);
    page.reload = (options) => originalReload({ waitUntil: 'domcontentloaded', ...options });

    await use(page);
  },

  trainoErrors: async ({ page }, use) => {
    const errors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      if (IGNORED_CONSOLE_PATTERNS.some((p) => p.test(text))) return;
      errors.push(`console.error: ${text}`);
    });
    page.on('pageerror', (err) => {
      errors.push(`pageerror: ${err.stack ?? err.message}`);
    });

    await use(errors);

    expect(errors, `Unexpected TRAINO application error(s):\n${errors.join('\n')}`).toEqual([]);
  },
});

export { expect };
