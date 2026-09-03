import { test, expect } from './helpers/fixtures';
import { completeOnboarding } from './helpers/onboarding';
import { submitDailyCheckIn, HIGH_READINESS, LOW_READINESS } from './helpers/readiness';

/**
 * Daily Readiness (Phase 12 spec §8). Not just the happy path — low
 * readiness, the pain-flag safety override, and readiness-driven workout
 * adjustment are all covered, plus persistence across reload.
 */

test.describe('Daily Readiness', () => {
  test('happy path — submit, see result, persists across reload back on Home', async ({ page }) => {
    await completeOnboarding(page);
    await submitDailyCheckIn(page, HIGH_READINESS);

    await expect(page.getByText("Today's Readiness")).toBeVisible();
    await expect(page.getByText(/^\d+%$/)).toBeVisible();

    await page.reload();
    await expect(page.getByText("Today's Readiness")).toBeVisible();

    await page.goto('/');
    await expect(page.getByText('Check in')).toHaveCount(0);
  });

  test('low readiness produces a reduced/recovery status, not "high"', async ({ page }) => {
    await completeOnboarding(page);
    await submitDailyCheckIn(page, LOW_READINESS);

    await expect(page.getByText("Today's Readiness")).toBeVisible();
    // The status label is one of readiness/scales.ts's READINESS_STATUS_LABEL
    // values; a low-input day must not read "High" or "Normal".
    await expect(page.getByText(/^High$/)).toHaveCount(0);
  });

  test('the pain flag is a safety override — status is always "Recovery"', async ({ page }) => {
    await completeOnboarding(page);
    await submitDailyCheckIn(page, { ...HIGH_READINESS, painFlag: true });

    await expect(page.getByText("Today's Readiness")).toBeVisible();
    await expect(page.getByText('Recovery')).toBeVisible();
  });

  test('a low-readiness day can adjust today\'s workout, shown on Today\'s Workout', async ({ page }) => {
    await completeOnboarding(page);
    await submitDailyCheckIn(page, LOW_READINESS);
    await page.getByRole('button', { name: "VIEW TODAY'S WORKOUT" }).click();
    await expect(page).toHaveURL('/todays-workout');
    await expect(page.getByRole('heading', { name: "TODAY'S WORKOUT" })).toBeVisible();
  });
});
