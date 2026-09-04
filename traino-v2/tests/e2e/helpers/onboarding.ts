import type { Page } from '@playwright/test';

/**
 * Reusable onboarding/assessment helper (Phase 12 spec §7/§26). Drives the
 * real 8-step assessment UI exactly as an athlete would — no localStorage
 * seeding, no skipped steps — so every E2E test that needs a profile starts
 * from the same real flow the app actually ships. `AssessmentAnswers`
 * defaults (see `domain/state/ProfileContext.tsx`'s `DEFAULT_ANSWERS`) mean
 * every step except firstName/sport/trainingLocation/allergy already has a
 * valid pre-selected value, so only the fields relevant to a given test
 * scenario need to be touched explicitly.
 */

export interface OnboardingOptions {
  firstName?: string;
  /** Exact sport card label, e.g. 'Football' | 'Swimming'. */
  sport?: string;
  /** Exact training-location button label. */
  trainingLocation?: string;
  /** Exact equipment button label to additionally select, or null for none. */
  equipment?: string | null;
  /** Exact FREQUENCY_OPTIONS label used for both "currently train" and "commit going forward". */
  frequencyLabel?: string;
  /** Exact ALLERGY_OPTIONS label to select on the final step. Defaults to 'None'. */
  allergyLabel?: string;
}

export async function completeOnboarding(page: Page, opts: OnboardingOptions = {}): Promise<void> {
  const {
    firstName = 'Test Athlete',
    sport = 'Football',
    trainingLocation = sport === 'Swimming' ? 'Pool' : 'Home',
    equipment = sport === 'Swimming' ? 'Kickboard' : 'Dumbbells',
    frequencyLabel = '3-4 / week',
    allergyLabel = 'None',
  } = opts;

  await page.goto('/onboarding/about');
  await page.getByPlaceholder('Your first name').fill(firstName);
  await page.getByRole('button', { name: 'NEXT' }).click();
  await page.waitForURL('**/sport-selection');

  // Not `exact` here: the sport card's accessible name also includes its
  // AssetSlot placeholder image's alt text ("Football · placeholder
  // Football"), so an exact match against the plain label never resolves.
  await page.getByRole('button', { name: sport }).click();
  await page.getByRole('button', { name: 'NEXT' }).click();
  await page.waitForURL('**/assessment');

  // Not `exact`: each location card's accessible name also includes its
  // description line (e.g. "Home Train at home"), so match by prefix.
  await page.getByRole('button', { name: trainingLocation }).click();
  await page.getByRole('button', { name: 'NEXT' }).click();
  await page.waitForURL('**/equipment');

  if (equipment) {
    await page.getByRole('button', { name: equipment, exact: true }).click();
  }
  await page.getByRole('button', { name: 'NEXT' }).click();
  await page.waitForURL('**/assessment/experience');

  // Not `exact`: BucketGrid options also concatenate a description line
  // into the accessible name (e.g. "New to it Less than a year").
  await page.getByRole('button', { name: 'New to it' }).click();
  const frequencyButtons = page.getByRole('button', { name: frequencyLabel });
  await frequencyButtons.nth(0).click(); // "currently train"
  await frequencyButtons.nth(1).click(); // "commit going forward"
  await page.getByRole('button', { name: 'NEXT' }).click();
  await page.waitForURL('**/assessment/health');

  // injuryIds defaults to ['none'] — NEXT is already enabled, nothing to select.
  await page.getByRole('button', { name: 'NEXT' }).click();
  await page.waitForURL('**/assessment/body');

  // age/heightCm/weightKg already default to valid non-zero values.
  await page.getByRole('button', { name: 'NEXT' }).click();
  await page.waitForURL('**/assessment/nutrition-preferences');

  await page.getByRole('button', { name: allergyLabel, exact: true }).click();
  await page.getByRole('button', { name: 'BUILD MY PLAN' }).click();
  await page.waitForURL((url) => url.pathname === '/');
}
