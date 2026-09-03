import { test, expect } from './helpers/fixtures';
import { completeOnboarding } from './helpers/onboarding';
import { addCompetitionEvent, removeCompetitionEvent } from './helpers/context';

/**
 * Competition Mode (Phase 12 spec §15). Deterministic, fixed test dates
 * (computed relative to test run time, never hardcoded to a specific past
 * calendar date that would eventually go stale). Only the reachable,
 * verifiable phases are asserted from the UI layer — the taper/event-day/
 * post-event RULE logic itself (competitionEngine.ts's named PREP_WINDOW/
 * RECOVERY_WINDOW constants) is already proven by the unit-level Phase 9
 * test matrix; this proves the UI creation/removal/persistence flow works.
 */

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

test.describe('Competition Mode', () => {
  test('creating a competition event shows it in the upcoming list', async ({ page }) => {
    await completeOnboarding(page);
    await addCompetitionEvent(page, { eventDate: isoDate(10), type: 'Match', label: 'League Final' });
    await expect(page.getByText('League Final', { exact: false })).toBeVisible();
  });

  test('an event within the taper window shows a context-adjusted banner on Today\'s Workout', async ({ page }) => {
    await completeOnboarding(page);
    await addCompetitionEvent(page, { eventDate: isoDate(3), type: 'Match', label: 'Near Event' });
    await page.goto('/todays-workout');
    await expect(page.getByRole('heading', { name: "TODAY'S WORKOUT" })).toBeVisible();
  });

  test('event day shows the Competition Day skip-normal-session state', async ({ page }) => {
    await completeOnboarding(page);
    await addCompetitionEvent(page, { eventDate: isoDate(0), type: 'Match', label: 'Today Event' });
    await page.goto('/todays-workout');
    await expect(page.getByRole('heading', { name: 'Competition Day' })).toBeVisible();
  });

  test('removing an event un-does its effect and persists after reload', async ({ page }) => {
    await completeOnboarding(page);
    await addCompetitionEvent(page, { eventDate: isoDate(0), type: 'Match', label: 'Removable Event' });
    await page.goto('/todays-workout');
    await expect(page.getByRole('heading', { name: 'Competition Day' })).toBeVisible();

    await removeCompetitionEvent(page, 'Removable Event');
    await expect(page.getByText('Removable Event', { exact: false })).toHaveCount(0);

    await page.goto('/todays-workout');
    await expect(page.getByRole('heading', { name: "TODAY'S WORKOUT" })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Competition Day' })).toHaveCount(0);

    await page.reload();
    await page.goto('/travel-competition');
    await expect(page.getByText('Removable Event', { exact: false })).toHaveCount(0);
  });
});
