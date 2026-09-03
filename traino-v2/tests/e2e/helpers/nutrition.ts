import type { Page } from '@playwright/test';

/** Logs the first not-yet-eaten meal on the Nutrition screen (spec §11). */
export async function logFirstMeal(page: Page): Promise<void> {
  await page.goto('/nutrition');
  await page.getByRole('button', { name: 'Mark as eaten' }).first().click();
}
