import type { Page } from '@playwright/test';

/** Creates an active Travel Mode context (spec §14) covering `startDate`..`endDate`. */
export async function startTravelMode(
  page: Page,
  opts: { startDate: string; endDate: string; preset?: string; minutes?: string } = { startDate: '', endDate: '' }
): Promise<void> {
  const { startDate, endDate, preset = 'Bodyweight only', minutes = '30 min' } = opts;
  await page.goto('/travel-competition');
  await page.getByRole('button', { name: preset, exact: true }).click();
  await page.getByRole('button', { name: minutes, exact: true }).click();
  const dateInputs = page.locator('input[type="date"]');
  await dateInputs.nth(0).fill(startDate);
  await dateInputs.nth(1).fill(endDate);
  await page.getByRole('button', { name: 'START TRAVEL MODE' }).click();
}

export async function endTravelMode(page: Page): Promise<void> {
  await page.goto('/travel-competition');
  await page.getByRole('button', { name: 'End Travel Mode' }).click();
}

/** Creates a Competition event (spec §15). Only the event date input is
 * present once a Travel context is active (Travel's own date inputs hide),
 * so this always targets the LAST date input on the page. */
export async function addCompetitionEvent(
  page: Page,
  opts: { eventDate: string; type?: string; label?: string }
): Promise<void> {
  await page.goto('/travel-competition');
  await page.locator('input[type="date"]').last().fill(opts.eventDate);
  if (opts.type) {
    await page.getByRole('button', { name: opts.type, exact: true }).click();
  }
  if (opts.label) {
    await page.getByPlaceholder('e.g. League Final').fill(opts.label);
  }
  await page.getByRole('button', { name: 'ADD COMPETITION' }).click();
}

export async function removeCompetitionEvent(page: Page, eventLabelOrDate: string): Promise<void> {
  await page.goto('/travel-competition');
  const row = page.locator('div', { hasText: eventLabelOrDate }).filter({ has: page.getByRole('button', { name: 'Remove' }) }).first();
  await row.getByRole('button', { name: 'Remove' }).click();
}
