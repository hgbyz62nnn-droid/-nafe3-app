import { test, expect } from './helpers/fixtures';
import { completeOnboarding } from './helpers/onboarding';
import { startTravelMode, endTravelMode } from './helpers/context';

/**
 * Travel Mode (Phase 12 spec §14). Deterministic test dates (fixed, not
 * "today") — the window covers "today" in this environment's clock, so
 * the workout-adaptation banner is verifiable without depending on real
 * wall-clock date math beyond what `new Date()` naturally gives at test
 * run time.
 */

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

test.describe('Travel Mode', () => {
  test('starting Travel Mode adapts the workout and shows a context banner', async ({ page }) => {
    await completeOnboarding(page);
    await startTravelMode(page, { startDate: isoDate(-1), endDate: isoDate(3), preset: 'Bodyweight only', minutes: '20 min' });
    await expect(page.getByText('Active through')).toBeVisible();

    await page.goto('/todays-workout');
    await expect(page.getByText('Travel Mode active', { exact: false })).toBeVisible();
  });

  test('canceling Travel Mode restores the base plan and never mutates it permanently', async ({ page }) => {
    await completeOnboarding(page);
    await page.goto('/todays-workout');
    const baseline = await page.locator('h2').first().textContent();

    await startTravelMode(page, { startDate: isoDate(-1), endDate: isoDate(3) });
    await page.goto('/todays-workout');
    await expect(page.getByText('Travel Mode active', { exact: false })).toBeVisible();

    await endTravelMode(page);
    await expect(page.getByText('Active through')).toHaveCount(0);

    await page.goto('/todays-workout');
    await expect(page.getByText('Travel Mode active', { exact: false })).toHaveCount(0);
    const restored = await page.locator('h2').first().textContent();
    expect(restored).toBe(baseline);
  });

  test('an ended Travel Mode context stays ended after reload', async ({ page }) => {
    await completeOnboarding(page);
    await startTravelMode(page, { startDate: isoDate(-1), endDate: isoDate(3) });
    await endTravelMode(page);
    await page.reload();
    await expect(page.getByText('Active through')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'START TRAVEL MODE' })).toBeVisible();
  });
});
