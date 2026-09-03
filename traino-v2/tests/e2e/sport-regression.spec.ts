import { test, expect } from './helpers/fixtures';
import { completeOnboarding } from './helpers/onboarding';
import { logFirstExercise } from './helpers/todaysWorkout';

/**
 * Football and Swimming regression (Phase 12 spec §16/§17). Both sports
 * are driven through the exact same generic helpers/screens as every
 * other test in this suite — there is deliberately no sport-specific test
 * code path here, which is itself part of the proof that the underlying
 * engine has no per-sport branching (see the architecture grep in the
 * final report §30).
 */

const SPORTS: Array<{ name: string; trainingLocation: string; equipment: string }> = [
  { name: 'Football', trainingLocation: 'Home', equipment: 'Dumbbells' },
  { name: 'Swimming', trainingLocation: 'Pool', equipment: 'Kickboard' },
];

for (const sport of SPORTS) {
  test.describe(`${sport.name} regression`, () => {
    test(`onboarding, workout, exercise logging, Progress, and AI Coach all work for ${sport.name}`, async ({ page }) => {
      await completeOnboarding(page, { sport: sport.name, trainingLocation: sport.trainingLocation, equipment: sport.equipment });
      await expect(page).toHaveURL('/');

      await page.goto('/todays-workout');
      await expect(page.getByRole('heading', { name: "TODAY'S WORKOUT" })).toBeVisible();
      const exerciseCount = await page.getByRole('button', { name: 'Log this exercise' }).count();
      expect(exerciseCount).toBeGreaterThan(0);
      await logFirstExercise(page);

      await page.goto('/progress');
      await expect(page.getByRole('heading', { name: 'PROGRESS' })).toBeVisible();

      await page.goto('/ai-coach');
      await page.getByRole('button', { name: 'How ready am I today?', exact: true }).click();
      await expect(page.getByText('How ready am I today?', { exact: true }).last()).toBeVisible();
    });

    test(`${sport.name} Weekly Report generates without error`, async ({ page }) => {
      await completeOnboarding(page, { sport: sport.name, trainingLocation: sport.trainingLocation, equipment: sport.equipment });
      await page.goto('/weekly-check-in');
      await page.getByRole('button', { name: 'CONTINUE' }).click();
      await expect(page).toHaveURL('/weekly-report');
      await expect(page.getByRole('heading', { name: 'WEEKLY REPORT' })).toBeVisible();
    });
  });
}
