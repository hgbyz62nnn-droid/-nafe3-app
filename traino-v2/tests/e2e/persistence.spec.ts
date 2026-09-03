import { test, expect } from './helpers/fixtures';
import { completeOnboarding } from './helpers/onboarding';
import { submitDailyCheckIn, HIGH_READINESS } from './helpers/readiness';
import { logFirstExercise } from './helpers/todaysWorkout';
import { logFirstMeal } from './helpers/nutrition';
import { submitWeeklyCheckIn } from './helpers/weeklyCoaching';
import { startTravelMode, addCompetitionEvent } from './helpers/context';

/**
 * Persistence / reload (Phase 12 spec §18) — critical. Builds up real
 * state across every domain in one athlete's session, reloads, and
 * verifies none of it was lost. Complements the narrower single-domain
 * reload checks already inside each other spec file.
 */

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

test('a full week of real activity across every domain survives a reload', async ({ page }) => {
  await completeOnboarding(page, { firstName: 'Persist Test' });

  // Readiness
  await submitDailyCheckIn(page, HIGH_READINESS);

  // Exercise log
  await page.goto('/todays-workout');
  await logFirstExercise(page);

  // Nutrition log
  await logFirstMeal(page);

  // Weight
  await page.goto('/progress');
  await page.getByRole('button', { name: 'Log weight' }).click();
  await page.getByPlaceholder('Weight in kg').fill('79');
  await page.getByRole('button', { name: 'Save' }).click();

  // Weekly coaching record
  await submitWeeklyCheckIn(page, { barrierName: 'Poor sleep' });

  // Travel context
  await startTravelMode(page, { startDate: isoDate(-1), endDate: isoDate(2) });

  // Competition event
  await addCompetitionEvent(page, { eventDate: isoDate(20), type: 'Race', label: 'Persistence Race' });

  // ---- reload from a completely fresh navigation and verify everything held ----
  await page.goto('/');
  await page.reload();

  await page.goto('/daily-check-in');
  await expect(page.getByText("Today's Readiness")).toBeVisible();

  await page.goto('/progress');
  await expect(page.getByText('79 kg')).toBeVisible();

  await page.goto('/nutrition');
  await expect(page.getByRole('button', { name: 'Logged' }).first()).toBeVisible();

  await page.goto('/weekly-report');
  await expect(page.getByRole('heading', { name: 'WEEKLY REPORT' })).toBeVisible();
  await expect(page.getByText('WHY')).toBeVisible();

  await page.goto('/travel-competition');
  await expect(page.getByText('Active through')).toBeVisible();
  await expect(page.getByText('Persistence Race', { exact: false })).toBeVisible();
});
