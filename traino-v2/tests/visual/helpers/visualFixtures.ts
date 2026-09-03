import { test as base, expect, type Page } from '@playwright/test';
import { completeOnboarding } from '../../e2e/helpers/onboarding';
import { submitDailyCheckIn, HIGH_READINESS } from '../../e2e/helpers/readiness';
import { logFirstExercise } from '../../e2e/helpers/todaysWorkout';
import { logFirstMeal } from '../../e2e/helpers/nutrition';
import { submitWeeklyCheckIn } from '../../e2e/helpers/weeklyCoaching';

/**
 * Visual regression fixture (Phase 12 spec §19-23). Deliberately does NOT
 * block the app's real Google Fonts request the way tests/e2e/helpers/
 * fixtures.ts does — a visual comparison against the reference screenshots
 * needs the SAME typeface those references were captured with, or every
 * screen would show a spurious full-page diff from a fallback font
 * substitution. Functional assertions never need this; pixel comparisons
 * do.
 */
const IGNORED_CONSOLE_PATTERNS = [/ERR_CONNECTION_RESET/, /accounts\.google\.com/, /content-autofill\.googleapis\.com/, /clients\d?\.google\.com/];

export const test = base.extend<{ trainoErrors: string[] }>({
  page: async ({ page }, use) => {
    // Same "don't wait on the real font request to finish before treating
    // navigation as done" rationale as tests/e2e/helpers/fixtures.ts — the
    // difference here is the font request itself is NOT blocked (visual
    // comparisons need it to actually load), only the navigation wait no
    // longer blocks on it. toHaveScreenshot's own stabilization (it waits
    // for consecutive identical frames) covers the font swap finishing.
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
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.stack ?? err.message}`));
    await use(errors);
    expect(errors, `Unexpected TRAINO application error(s):\n${errors.join('\n')}`).toEqual([]);
  },
});

export { expect };

/**
 * Builds one representative, moderately "lived-in" Football athlete —
 * onboarded, a readiness check-in, a logged exercise, a logged meal, and a
 * completed weekly review — so Progress/Weekly Report/Home read as an
 * active athlete's real state rather than a stark first-run empty state,
 * the same way the reference screens depict an athlete with history.
 * Real per-value numbers will still differ from the hand-designed
 * reference images (see final report §19) — this only shapes which
 * SECTIONS have data versus show an empty state.
 */
export async function seedRepresentativeAthlete(page: Page): Promise<void> {
  await completeOnboarding(page, { firstName: 'Alex', sport: 'Football' });
  await submitDailyCheckIn(page, HIGH_READINESS);
  await page.goto('/todays-workout');
  await logFirstExercise(page);
  await logFirstMeal(page);
  await submitWeeklyCheckIn(page, { barrierName: 'Poor sleep' });
}
