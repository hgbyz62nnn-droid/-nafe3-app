import { test, expect } from './helpers/fixtures';
import { completeOnboarding } from './helpers/onboarding';
import { submitWeeklyCheckIn } from './helpers/weeklyCoaching';

/**
 * Weekly Coaching Loop (Phase 12 spec §12). Check-in -> report -> approve
 * or reject an adjustment -> persistence across reload.
 */

test.describe('Weekly Coaching', () => {
  test('Weekly Check-In opens, barrier selection and note work, and it generates a Weekly Report', async ({ page }) => {
    await completeOnboarding(page);
    await submitWeeklyCheckIn(page, { barrierName: 'Poor sleep', note: 'Trouble falling asleep this week.' });

    await expect(page).toHaveURL('/weekly-report');
    await expect(page.getByRole('heading', { name: 'WEEKLY REPORT' })).toBeVisible();
    await expect(page.getByText('WHY')).toBeVisible();
    await expect(page.getByText("TRAINO'S RECOMMENDATION")).toBeVisible();
  });

  test('approving the recommended adjustment persists across reload', async ({ page }) => {
    // poor_sleep's coaching rule always requires approval (see
    // coachingRulesEngine.ts's ruleFor), so this button is always present.
    await completeOnboarding(page);
    await submitWeeklyCheckIn(page, { barrierName: 'Poor sleep' });

    await page.getByRole('button', { name: 'APPLY TO NEXT WEEK' }).click();
    await expect(page.getByText('Applied to next week')).toBeVisible();
    await page.reload();
    await expect(page.getByText('Applied to next week')).toBeVisible();
  });

  test('rejecting the recommended adjustment keeps the current plan, and this persists across reload', async ({ page }) => {
    await completeOnboarding(page);
    await submitWeeklyCheckIn(page, { barrierName: 'Fatigue' });

    await page.getByRole('button', { name: 'KEEP CURRENT PLAN' }).click();
    await expect(page.getByText('Kept your current plan')).toBeVisible();
    await page.reload();
    await expect(page.getByText('Kept your current plan')).toBeVisible();
  });

  test('a clean week (no barrier selected) still generates a report with no forced recommendation', async ({ page }) => {
    await completeOnboarding(page);
    await submitWeeklyCheckIn(page);
    await expect(page).toHaveURL('/weekly-report');
    await expect(page.getByText('Nothing held you back this week.')).toBeVisible();
  });
});
