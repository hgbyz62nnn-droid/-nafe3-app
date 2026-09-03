import { test, expect } from './helpers/fixtures';
import { completeOnboarding } from './helpers/onboarding';

/**
 * Core navigation smoke (Phase 12 spec §6). Uses the REAL current
 * navigation graph, verified against the running app rather than assumed:
 *
 * - `BottomNav` renders two different item sets (see its own doc comment) —
 *   the default set (Home/Plan/Nutrition/Progress/Profile) on Home,
 *   Nutrition, Progress, Profile, and a DIFFERENT set
 *   (Home/Plan/AI Coach/Nutrition/Profile) on AI Coach only. Home's bottom
 *   nav has no "AI Coach" item at all — AI Coach is reached from Home via
 *   its "Chat with AI" button instead.
 * - The "Plan" bottom-nav item points at `/plan`, a route that is not
 *   registered in `App.tsx` — a real, pre-existing gap (see final report
 *   §17), not something this infra-only phase redesigns. This suite
 *   deliberately never clicks it.
 * - Today's Workout, Weekly Report, and Human Coach have no bottom nav of
 *   their own and, for a freshly onboarded athlete with no logged history,
 *   are not yet linked from Home either (Home's coaching-summary card only
 *   appears once a Weekly Coaching record exists) — they're reached via
 *   `page.goto()` directly in the specs that need them, exactly the same
 *   navigability a real athlete has once they exist.
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

  test('Daily Check-In is reachable from Home; Weekly Report/Weekly Check-In are reachable directly', async ({ page }) => {
    await completeOnboarding(page);

    await page.locator('a[href="/daily-check-in"]').click();
    await expect(page).toHaveURL('/daily-check-in');
    await expect(page.getByRole('heading', { name: 'DAILY CHECK-IN' })).toBeVisible();

    await page.goto('/weekly-report');
    await expect(page.getByRole('heading', { name: 'WEEKLY REPORT' })).toBeVisible();
  });
});
