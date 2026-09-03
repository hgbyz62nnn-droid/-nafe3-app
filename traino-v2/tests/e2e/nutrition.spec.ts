import { test, expect } from './helpers/fixtures';
import { completeOnboarding } from './helpers/onboarding';
import { logFirstMeal } from './helpers/nutrition';

/**
 * Nutrition (Phase 12 spec §11). Screen load, target display, meal
 * logging/persistence, and an allergy-restriction path — restricted foods
 * are filtered upstream (domain/nutrition/mealBuilder.ts, given
 * `answers.allergyIds`), so this verifies the ALLERGEN never appears on a
 * real generated day, rather than asserting DOM state that doesn't exist
 * on this screen for that concern (see final report §12).
 */

test.describe('Nutrition', () => {
  test('loads with a daily target and renders meal cards', async ({ page }) => {
    await completeOnboarding(page);
    await page.goto('/nutrition');
    await expect(page.getByRole('heading', { name: 'NUTRITION' })).toBeVisible();
    await expect(page.getByText('Estimated daily target')).toBeVisible();
    await expect(page.getByText('kcal').first()).toBeVisible();
  });

  test('logging a meal marks it eaten and persists across reload', async ({ page }) => {
    await completeOnboarding(page);
    await page.goto('/nutrition');
    await logFirstMeal(page);
    await expect(page.getByRole('button', { name: 'Logged' }).first()).toBeVisible();

    await page.reload();
    await expect(page.getByRole('button', { name: 'Logged' }).first()).toBeVisible();
  });

  test('a dairy allergy never lets a dairy food appear in the generated day', async ({ page }) => {
    await completeOnboarding(page, { allergyLabel: 'Dairy' });
    await page.goto('/nutrition');
    await expect(page.getByRole('heading', { name: 'NUTRITION' })).toBeVisible();
    // Real allergen names from domain/nutrition food registry — a
    // filtered-out food never renders as a meal-card item name.
    for (const allergen of ['Milk', 'Greek Yogurt', 'Feta Cheese', 'Whey Protein']) {
      await expect(page.getByText(allergen, { exact: true })).toHaveCount(0);
    }
  });

  test('ASK AI COACH link is reachable from Nutrition', async ({ page }) => {
    await completeOnboarding(page);
    await page.goto('/nutrition');
    await page.getByRole('link', { name: 'ASK AI COACH' }).click();
    await expect(page).toHaveURL('/ai-coach');
  });
});
