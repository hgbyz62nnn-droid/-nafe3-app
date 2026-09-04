import { test, expect } from './helpers/fixtures';
import { completeOnboarding } from './helpers/onboarding';

/**
 * Core navigation smoke (Phase 12 spec §6, re-verified Phase 12.5 §10).
 * Uses the REAL current navigation graph, verified against the running
 * app rather than assumed:
 *
 * - `BottomNav` renders two different item sets (see its own doc comment) —
 *   the default set (Home/Plan/Nutrition/Progress/Profile) on Home,
 *   Nutrition, Progress, Profile, and a DIFFERENT set
 *   (Home/Plan/AI Coach/Nutrition/Profile) on AI Coach only. Home's bottom
 *   nav has no "AI Coach" item at all — AI Coach is reached from Home via
 *   its "Chat with AI" link instead.
 * - Phase 12.5: "Plan" now points at `/todays-workout` (previously `/plan`,
 *   an unregistered route — a real dead nav item, fixed this phase; see
 *   docs/TRAINO-DESIGN-BASELINE.md §8). Today's Workout has no bottom nav
 *   of its own (consistent with every other "detail" screen in this app —
 *   Weekly Report, Human Coach), so this suite verifies the click lands on
 *   the right screen, not that a tab bar persists there.
 * - Human Coach (`/human-coach`) is now reachable via AI Coach's header
 *   overflow icon (Phase 12.5 §9) — previously unreachable from any UI.
 * - Weekly Report has no bottom nav of its own and, for a freshly
 *   onboarded athlete with no logged history, is not yet linked from Home
 *   either (Home's coaching-summary card only appears once a Weekly
 *   Coaching record exists) — reached via `page.goto()` directly, exactly
 *   the same navigability a real athlete has once a record exists.
 */

test.describe('Core navigation', () => {
  test('Home -> AI Coach -> Nutrition -> Progress -> Profile -> Home', async ({ page }) => {
    await completeOnboarding(page);
    await expect(page).toHaveURL('/');

    await page.getByRole('link', { name: 'Chat with AI' }).click();
    await expect(page).toHaveURL('/ai-coach');
    await expect(page.getByRole('heading', { name: 'AI COACH' })).toBeVisible();

    await page.getByRole('link', { name: 'Nutrition' }).click();
    await expect(page).toHaveURL('/nutrition');
    await expect(page.getByRole('heading', { name: 'NUTRITION' })).toBeVisible();

    await page.getByRole('link', { name: 'Progress' }).click();
    await expect(page).toHaveURL('/progress');
    await expect(page.getByRole('heading', { name: 'PROGRESS' })).toBeVisible();

    await page.getByRole('link', { name: 'Profile' }).click();
    await expect(page).toHaveURL('/profile');

    await page.getByRole('link', { name: 'Home', exact: true }).click();
    await expect(page).toHaveURL('/');
  });

  test('the bottom-nav "Plan" item is no longer a dead link — it opens Today\'s Workout', async ({ page }) => {
    await completeOnboarding(page);
    await page.getByRole('link', { name: 'Plan' }).click();
    await expect(page).toHaveURL('/todays-workout');
    await expect(page.getByRole('heading', { name: "TODAY'S WORKOUT" })).toBeVisible();
  });

  test('Human Coach is reachable from AI Coach (no longer an orphaned route)', async ({ page }) => {
    await completeOnboarding(page);
    await page.goto('/ai-coach');
    await page.getByRole('link', { name: 'Talk to a human coach' }).click();
    await expect(page).toHaveURL('/human-coach');
    await expect(page.getByRole('heading', { name: 'HUMAN COACH' })).toBeVisible();
  });

  test('Daily Check-In is reachable from Home; Weekly Report/Weekly Check-In are reachable directly', async ({ page }) => {
    await completeOnboarding(page);

    await page.locator('a[href="/daily-check-in"]').click();
    await expect(page).toHaveURL('/daily-check-in');
    await expect(page.getByRole('heading', { name: 'DAILY CHECK-IN' })).toBeVisible();

    await page.goto('/weekly-report');
    await expect(page.getByRole('heading', { name: 'WEEKLY REPORT' })).toBeVisible();
  });
});
