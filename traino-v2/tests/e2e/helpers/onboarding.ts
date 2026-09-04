import type { Page } from '@playwright/test';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Matches an accessible name that starts with `label`, not followed by
 * another word character or hyphen — avoids both a substring collision
 * (e.g. "Competitive" inside "Semi-Pro Regular competitive play") and a
 * numeral-prefix collision (e.g. "1" inside "1-2 / week"). */
function startAnchor(label: string): RegExp {
  return new RegExp('^' + escapeRegExp(label) + '(?![\\w-])');
}

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
  /** Exact position/discipline name (e.g. 'Winger', 'Butterfly') — only clicked if
   * provided; the screen only shows this section when the sport has positions. */
  position?: string;
  /** Exact COMPETITIVE_LEVEL_OPTIONS name (e.g. 'Professional'). Optional. */
  competitiveLevel?: string;
  /** Exact MATCHES_PER_WEEK_OPTIONS label (e.g. '2') — only clicked if provided;
   * only shown for a sport whose module sets `supportsMatchesPerWeek`. */
  matchesPerWeek?: string;
  /** Exact PRIORITY_OPTIONS name (e.g. 'Speed & Power'). Optional. */
  priority?: string;
}

export async function completeOnboarding(page: Page, opts: OnboardingOptions = {}): Promise<void> {
  const {
    firstName = 'Test Athlete',
    sport = 'Football',
    trainingLocation = sport === 'Swimming' ? 'Pool' : 'Home',
    equipment = sport === 'Swimming' ? 'Kickboard' : 'Dumbbells',
    frequencyLabel = '3-4 / week',
    allergyLabel = 'None',
    position,
    competitiveLevel,
    matchesPerWeek,
    priority,
  } = opts;

  // Real fresh-user flow: LANGUAGE -> WELCOME -> CREATE MY PLAN -> assessment
  // (spec: Deep Adaptive Assessment §1/§2). Only ONE real `page.goto` for the
  // whole helper (this first one — every step after is a client-side route
  // change via `waitForURL`/button clicks, not a fresh page load) — a visual-
  // suite page fixture that doesn't block the real Google Fonts request can
  // hang on an unrelated extra full navigation, so every avoidable `goto` here
  // is deliberately avoided in favor of driving the actual UI.
  await page.goto('/');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByRole('button', { name: 'CREATE MY PLAN' }).click();
  await page.waitForURL('**/onboarding/about');

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
  if (position) {
    await page.getByRole('button', { name: position, exact: true }).click();
  }
  const frequencyButtons = page.getByRole('button', { name: frequencyLabel });
  await frequencyButtons.nth(0).click(); // "currently train"
  await frequencyButtons.nth(1).click(); // "commit going forward"
  if (priority) {
    await page.getByRole('button', { name: priority }).click();
  }
  // Anchored (not `exact`, not a bare substring): each button's accessible
  // name concatenates its description line too (e.g. "Competitive Club or
  // league competition"), and plain substring matching would also hit other
  // options whose own description contains the word (e.g. "Semi-Pro Regular
  // competitive play"). Anchoring to the start of the name, with a
  // not-followed-by-word/hyphen guard, disambiguates from a numeral prefix
  // collision too (e.g. matchesPerWeek "1" vs. the frequency grid's "1-2 / week").
  if (competitiveLevel) {
    await page.getByRole('button', { name: startAnchor(competitiveLevel) }).click();
  }
  if (matchesPerWeek) {
    await page.getByRole('button', { name: startAnchor(matchesPerWeek) }).click();
  }
  await page.getByRole('button', { name: 'NEXT' }).click();
  await page.waitForURL('**/assessment/health');

  // injuryIds defaults to ['none'] — NEXT is already enabled, nothing to select.
  await page.getByRole('button', { name: 'NEXT' }).click();
  await page.waitForURL('**/assessment/body');

  // age/heightCm/weightKg already default to valid non-zero values.
  await page.getByRole('button', { name: 'NEXT' }).click();
  await page.waitForURL('**/assessment/nutrition-preferences');

  await page.getByRole('button', { name: allergyLabel, exact: true }).click();
  await page.getByRole('button', { name: 'NEXT' }).click();
  await page.waitForURL('**/assessment/review');

  // The real final CTA (Review screen) — this is what actually calls
  // completeAssessment() and persists the profile.
  await page.getByRole('button', { name: 'BUILD MY PLAN' }).click();
  await page.waitForURL('**/plan-ready');
  await page.getByRole('button', { name: 'VIEW MY PLAN' }).click();
  await page.waitForURL('**/plan');

  // Every existing test built on this helper expects to land on Home — return
  // there via the real bottom-nav Home link (client-side route change, not a
  // fresh page load) rather than changing that long-standing contract everywhere.
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await page.waitForURL((url) => url.pathname === '/');
}
