import { test, expect } from './helpers/fixtures';
import { completeOnboarding } from './helpers/onboarding';

/**
 * Deep Adaptive Assessment + Personalized Plan core-journey coverage (minimum
 * necessary per spec §42, not a new test framework): language/RTL, the real
 * Plan (full week) screen, and two athletes with different training
 * frequencies actually getting a different number of training days.
 */

test.describe('Language — Arabic selection sets RTL and translates the entry screen', () => {
  test('picking العربية sets dir=rtl and shows the Arabic Welcome headline', async ({ page }) => {
    await page.goto('/language');
    await page.getByRole('button', { name: 'العربية', exact: true }).click();
    await expect(page).toHaveURL('/');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { name: 'ابنِ خطتك الشخصية' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'أنشئ خطتي' })).toBeVisible();
  });
});

test.describe('Plan — the full generated week is the primary plan experience', () => {
  test('the Plan tab shows 7 days with a TODAY marker, not a redirect to Today\'s Workout', async ({ page }) => {
    await completeOnboarding(page, { frequencyLabel: '3-4 / week' });

    await page.goto('/plan');
    await expect(page).toHaveURL('/plan');
    await expect(page.getByText('TODAY')).toBeVisible();
    // 7 day rows always render (training + rest combined) — Mon..Sun labels.
    for (const label of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
  });

  test('the bottom-nav "Plan" item opens the full week, not Today\'s Workout', async ({ page }) => {
    await completeOnboarding(page);
    await page.getByRole('link', { name: 'Plan' }).click();
    await expect(page).toHaveURL('/plan');
  });
});

test.describe('Personalization — different training frequency produces a different plan', () => {
  test('a 7/week athlete gets more training days on their Plan than a 1-2/week athlete', async ({ page }) => {
    await completeOnboarding(page, { frequencyLabel: '7 / week' });
    await page.goto('/plan');
    const highFreqRestCount = await page.getByText('Rest', { exact: true }).count();

    // Same page, fresh profile — clear storage between the two athletes rather
    // than a second browser context/page (which would share this one's storage
    // partition and carry the first athlete's completed profile over).
    await page.evaluate(() => localStorage.clear());
    await completeOnboarding(page, { frequencyLabel: '1-2 / week' });
    await page.goto('/plan');
    const lowFreqRestCount = await page.getByText('Rest', { exact: true }).count();

    expect(lowFreqRestCount).toBeGreaterThan(highFreqRestCount);
  });
});
