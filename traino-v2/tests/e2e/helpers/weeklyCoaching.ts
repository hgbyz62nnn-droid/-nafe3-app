import type { Page } from '@playwright/test';

/** Submits a Weekly Check-In (spec §12), optionally selecting one barrier
 * by its exact BARRIER_OPTIONS name (e.g. "Poor sleep", "Fatigue"). */
export async function submitWeeklyCheckIn(page: Page, opts: { barrierName?: string; note?: string } = {}): Promise<void> {
  await page.goto('/weekly-check-in');
  if (opts.barrierName) {
    await page.getByRole('button', { name: opts.barrierName, exact: true }).click();
  }
  if (opts.note) {
    await page.getByPlaceholder("A short note for yourself — TRAINO won't analyze this text.").fill(opts.note);
  }
  await page.getByRole('button', { name: 'CONTINUE' }).click();
  await page.waitForURL('**/weekly-report');
}
