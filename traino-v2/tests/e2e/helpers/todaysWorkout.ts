import type { Page } from '@playwright/test';

/** Opens the first loggable exercise's inline log panel and saves with its
 * pre-filled defaults (sets/reps already seeded from the plan's prescription). */
export async function logFirstExercise(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Log this exercise' }).first().click();
  await page.getByRole('button', { name: 'SAVE' }).click();
}

/** Opens the first replaceable exercise's detail panel and picks the first
 * suggested replacement from "Replace with". */
export async function replaceFirstExercise(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'View exercise details / replace' }).first().click();
  const replaceWithHeading = page.getByText('Replace with', { exact: true });
  const candidates = replaceWithHeading.locator('xpath=following-sibling::div[1]');
  await candidates.getByRole('button').first().click();
}

/** Toggles the bottom "START WORKOUT" / "WORKOUT COMPLETED" CTA. */
export async function toggleWorkoutCompletion(page: Page): Promise<void> {
  await page.getByRole('button', { name: /START WORKOUT|WORKOUT COMPLETED/ }).click();
}
