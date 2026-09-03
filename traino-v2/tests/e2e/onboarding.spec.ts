import { test, expect } from './helpers/fixtures';
import { completeOnboarding } from './helpers/onboarding';

/**
 * Onboarding / Assessment (Phase 12 spec §7). Drives the real 8-step flow
 * for both Football (primary fixture) and Swimming, verifying it actually
 * reaches Home with no fabricated shortcuts.
 */

test.describe('Onboarding / Assessment', () => {
  test('Football — completes all 8 steps and lands on Home', async ({ page }) => {
    await completeOnboarding(page, { sport: 'Football', firstName: 'Alex' });
    await expect(page).toHaveURL('/');
  });

  test('Swimming — completes all 8 steps with pool location + swim equipment and lands on Home', async ({ page }) => {
    await completeOnboarding(page, { sport: 'Swimming', firstName: 'Sam', trainingLocation: 'Pool', equipment: 'Kickboard' });
    await expect(page).toHaveURL('/');
  });

  test('an allergy restriction can be selected instead of "None"', async ({ page }) => {
    await completeOnboarding(page, { firstName: 'Riley', allergyLabel: 'Dairy' });
    await expect(page).toHaveURL('/');
  });
});
