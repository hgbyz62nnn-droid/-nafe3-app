import type { Page } from '@playwright/test';

export interface ReadinessInput {
  sleepQuality?: 1 | 2 | 3 | 4 | 5;
  sleepDurationBucket?: 1 | 2 | 3 | 4 | 5;
  energy?: 1 | 2 | 3 | 4 | 5;
  stress?: 1 | 2 | 3 | 4 | 5;
  soreness?: 1 | 2 | 3 | 4 | 5;
  motivation?: 1 | 2 | 3 | 4 | 5;
  painFlag?: boolean;
}

/** A well-recovered day (matches domain/readiness — higher is better for
 * sleep/energy/motivation, lower is better for stress/soreness). */
export const HIGH_READINESS: Required<Omit<ReadinessInput, 'painFlag'>> = {
  sleepQuality: 5,
  sleepDurationBucket: 5,
  energy: 5,
  stress: 1,
  soreness: 1,
  motivation: 5,
};

/** A poorly-recovered day. */
export const LOW_READINESS: Required<Omit<ReadinessInput, 'painFlag'>> = {
  sleepQuality: 1,
  sleepDurationBucket: 1,
  energy: 1,
  stress: 5,
  soreness: 5,
  motivation: 2,
};

const FACTOR_TITLES: Record<keyof typeof HIGH_READINESS, string> = {
  sleepQuality: 'How was your sleep quality?',
  sleepDurationBucket: 'How long did you sleep?',
  energy: 'How is your energy today?',
  stress: 'How stressed do you feel?',
  soreness: 'How sore are your muscles?',
  motivation: 'How motivated do you feel?',
};

/** Fills and submits the Daily Check-In (spec §8). Navigates to
 * /daily-check-in first; caller handles what happens after submit. */
export async function submitDailyCheckIn(page: Page, input: ReadinessInput = {}): Promise<void> {
  await page.goto('/daily-check-in');

  for (const key of Object.keys(FACTOR_TITLES) as (keyof typeof FACTOR_TITLES)[]) {
    const value = input[key] ?? HIGH_READINESS[key];
    const title = FACTOR_TITLES[key];
    const card = page.locator('div.rounded-card-sm.border-border-soft').filter({ hasText: title });
    // Not `getByRole('button', { name })`: each option button's accessible
    // name is its scale label (aria-label, e.g. "Excellent"), which takes
    // precedence over its visible "1".."5" text for role-based matching.
    // getByText matches the rendered digit directly instead.
    await card.getByText(String(value), { exact: true }).click();
  }

  if (input.painFlag) {
    await page.getByText('New pain or discomfort today?').click();
  }

  await page.getByRole('button', { name: 'CHECK IN' }).click();
}
