import { test, expect } from './helpers/fixtures';
import { completeOnboarding } from './helpers/onboarding';

/**
 * Progress (Phase 12 spec §10). A freshly onboarded athlete has real,
 * computable Goal Progress / Training Consistency numbers from day one
 * (their weekly plan is known even with zero logs yet — 0/4 completed is
 * honest data, not an empty state), but per-exercise, per-category
 * performance, and weight-trend sections genuinely have nothing to show
 * yet and must render their honest empty state — never a fabricated
 * number. Exact strings verified against screens/Progress.tsx.
 */

test.describe('Progress', () => {
  test('sections with real day-one data show numbers; sections with no history show empty states', async ({ page }) => {
    await completeOnboarding(page);
    await page.goto('/progress');
    await expect(page.getByRole('heading', { name: 'PROGRESS' })).toBeVisible();

    await expect(page.getByText('Goal Progress')).toBeVisible();
    await expect(page.getByText('No sessions yet').first()).toBeVisible();
    await expect(page.getByText('Log your weight to start a trend')).toBeVisible();
  });

  test('Training tab shows real day-one consistency data and an honest exercise-progression empty state', async ({ page }) => {
    await completeOnboarding(page);
    await page.goto('/progress');
    await page.getByRole('button', { name: 'Training', exact: true }).click();
    await expect(page.getByText('TRAINING CONSISTENCY', { exact: true })).toBeVisible();
    await expect(page.getByText('0 / 4')).toBeVisible();
    await expect(page.getByText("Log an exercise on Today's Workout to start tracking your progression here.")).toBeVisible();
  });

  test('Nutrition tab shows its own empty state (distinct from the bottom-nav Nutrition link)', async ({ page }) => {
    await completeOnboarding(page);
    await page.goto('/progress');
    await page.getByRole('button', { name: 'Nutrition', exact: true }).click();
    await expect(page.getByText('Log your meals to see detailed nutrition progress.')).toBeVisible();
  });

  test('Body tab shows readiness and weight-trend empty states', async ({ page }) => {
    await completeOnboarding(page);
    await page.goto('/progress');
    await page.getByRole('button', { name: 'Body', exact: true }).click();
    await expect(page.getByText('Complete a Daily Check-in to see your readiness trend.')).toBeVisible();
    await expect(page.getByText('Add more weigh-ins to see a weight trend.')).toBeVisible();
  });

  test('logging weight updates the Weight card', async ({ page }) => {
    await completeOnboarding(page);
    await page.goto('/progress');
    await page.getByRole('button', { name: 'Log weight' }).click();
    await page.getByPlaceholder('Weight in kg').fill('82');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('82 kg')).toBeVisible();
  });
});
