import { test, expect, seedRepresentativeAthlete } from './helpers/visualFixtures';

/**
 * Visual regression (Phase 12 spec §19-25). Canonical viewport 390x844
 * (set globally in playwright.config.ts). Golden images are the repo's
 * own reference screenshots, copied byte-identical into
 * tests/visual/references/ (see final report §18) and wired in directly
 * via playwright.config.ts's snapshotPathTemplate — toHaveScreenshot
 * diffs against THOSE files, never a freshly generated baseline.
 *
 * Screen -> route/state mapping (spec §24):
 *   Home                -> seeded athlete, '/'
 *   Sport Selection     -> assessment sport step, '/sport-selection'
 *   Training Location   -> assessment location step, '/assessment'
 *   Equipment           -> assessment equipment step, '/equipment'
 *   AI Coach            -> seeded athlete, '/ai-coach'
 *   Today's Workout     -> seeded athlete, '/todays-workout'
 *   Nutrition           -> seeded athlete, '/nutrition'
 *   Progress            -> seeded athlete with controlled history, '/progress'
 *   Weekly Report       -> seeded athlete, completed weekly review, '/weekly-report'
 *   Human Coach         -> consultation screen, '/human-coach'
 *   Profile             -> seeded athlete, '/profile'
 *
 * IMPORTANT (see final report §19 for the full account): the reference
 * PNGs are hand-designed mockups from earlier in this project's history,
 * predating several now-shipped features (the Daily Readiness card and
 * notification bell on Home, for one) and depicting a specific fictional
 * athlete's data. A live render will not byte-match them — that's
 * expected content evolution, not a regression, and per spec §23 these
 * mismatches are documented rather than silently "fixed" by loosening
 * tolerance or auto-updating the goldens.
 */

test.describe('Visual regression — 390x844', () => {
  // The real (unblocked) Google Fonts request this sandboxed environment's
  // network makes to fonts.googleapis.com/gstatic.com can take well past
  // the suite's default 30s test timeout under load — generous here on
  // purpose, not to mask a hang (see tests/e2e/helpers/fixtures.ts, which
  // blocks the same request outright for the functional suite that
  // doesn't need it).
  test.slow();


  test('01 Home', async ({ page }) => {
    await seedRepresentativeAthlete(page);
    await page.goto('/');
    await expect(page.getByText('START WORKOUT')).toBeVisible();
    await expect(page).toHaveScreenshot('home.png');
  });

  test('02 Sport Selection', async ({ page }) => {
    await page.goto('/sport-selection');
    await expect(page.getByRole('heading', { name: 'Choose Your Sport' })).toBeVisible();
    await expect(page).toHaveScreenshot('sport-selection.png');
  });

  test('03 Assessment / Training Location', async ({ page }) => {
    await page.goto('/assessment');
    await expect(page.getByRole('heading', { name: 'Where do you train?' })).toBeVisible();
    await expect(page).toHaveScreenshot('assessment-location.png');
  });

  test('04 Equipment', async ({ page }) => {
    await page.goto('/equipment');
    await expect(page.getByText('What equipment')).toBeVisible();
    await expect(page).toHaveScreenshot('equipment.png');
  });

  test('05 AI Coach', async ({ page }) => {
    await seedRepresentativeAthlete(page);
    await page.goto('/ai-coach');
    await expect(page.getByRole('heading', { name: 'AI COACH' })).toBeVisible();
    await expect(page).toHaveScreenshot('ai-coach.png');
  });

  test("06 Today's Workout", async ({ page }) => {
    await seedRepresentativeAthlete(page);
    await page.goto('/todays-workout');
    await expect(page.getByRole('heading', { name: "TODAY'S WORKOUT" })).toBeVisible();
    await expect(page).toHaveScreenshot('todays-workout.png');
  });

  test('07 Nutrition', async ({ page }) => {
    await seedRepresentativeAthlete(page);
    await page.goto('/nutrition');
    await expect(page.getByRole('heading', { name: 'NUTRITION' })).toBeVisible();
    await expect(page).toHaveScreenshot('nutrition.png');
  });

  test('08 Progress', async ({ page }) => {
    await seedRepresentativeAthlete(page);
    await page.goto('/progress');
    await expect(page.getByRole('heading', { name: 'PROGRESS' })).toBeVisible();
    await expect(page).toHaveScreenshot('progress.png');
  });

  test('09 Weekly Report', async ({ page }) => {
    await seedRepresentativeAthlete(page);
    await page.goto('/weekly-report');
    await expect(page.getByRole('heading', { name: 'WEEKLY REPORT' })).toBeVisible();
    await expect(page).toHaveScreenshot('weekly-report.png');
  });

  test('10 Human Coach', async ({ page }) => {
    await seedRepresentativeAthlete(page);
    await page.goto('/human-coach');
    await expect(page.getByRole('heading', { name: 'HUMAN COACH' })).toBeVisible();
    await expect(page).toHaveScreenshot('human-coach.png');
  });

  test('11 Profile', async ({ page }) => {
    await seedRepresentativeAthlete(page);
    await page.goto('/profile');
    await expect(page).toHaveScreenshot('profile.png');
  });
});
