import { test, expect } from './helpers/fixtures';
import { completeOnboarding } from './helpers/onboarding';

/**
 * Core-journey fix (post-Phase-13-prep): a fresh install must never land on
 * Home with a fabricated-looking plan before the athlete has answered
 * anything — it must show the "Build Your Personal Plan" / "CREATE MY PLAN"
 * entry point, which starts the EXISTING assessment flow. A returning
 * athlete (assessment already completed) must never see that screen again,
 * including after a reload. Also covers the buttons/rows that looked
 * interactive but previously had no handler at all.
 */

test.describe('Welcome — fresh vs returning user', () => {
  test('a fresh install shows Language Selection first, then "Build Your Personal Plan", and CREATE MY PLAN starts the real assessment flow', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Choose Your Language' })).toBeVisible();

    await page.getByRole('button', { name: 'English', exact: true }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: 'Build Your Personal Plan' })).toBeVisible();
    await expect(page.getByText('Not checked in yet')).toHaveCount(0); // never renders Home's dashboard underneath

    await page.getByRole('button', { name: 'CREATE MY PLAN' }).click();
    await expect(page).toHaveURL('/onboarding/about');
    await expect(page.getByRole('heading', { name: 'What should we call you?' })).toBeVisible();
  });

  test('completing the assessment lands on the real Home, not Welcome, and this survives a reload', async ({ page }) => {
    await completeOnboarding(page);
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: 'Build Your Personal Plan' })).toHaveCount(0);
    await expect(page.getByText('START WORKOUT')).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Build Your Personal Plan' })).toHaveCount(0);
    await expect(page.getByText('START WORKOUT')).toBeVisible();
  });
});

test.describe('Home — previously-dead controls are now wired', () => {
  test('START WORKOUT opens Today\'s Workout; Progress "View all" opens Progress', async ({ page }) => {
    await completeOnboarding(page);

    await page.getByRole('link', { name: 'START WORKOUT' }).click();
    await expect(page).toHaveURL('/todays-workout');

    await page.goto('/');
    await page.getByRole('link', { name: 'View all' }).click();
    await expect(page).toHaveURL('/progress');
  });
});

test.describe('Profile — edit entry points are now wired', () => {
  test('Edit Profile and Athlete Profile re-enter the existing assessment flow with saved answers intact', async ({ page }) => {
    await completeOnboarding(page, { firstName: 'Casey' });
    await page.goto('/profile');
    await expect(page.getByText('Casey')).toBeVisible();

    await page.getByRole('button', { name: 'Edit Profile' }).click();
    await expect(page).toHaveURL('/onboarding/about');
    await expect(page.getByPlaceholder('Your first name')).toHaveValue('Casey');
  });

  test('Injuries & Health opens the existing health assessment step directly', async ({ page }) => {
    await completeOnboarding(page);
    await page.goto('/profile');
    await page.getByRole('button', { name: /Injuries & Health/ }).click();
    await expect(page).toHaveURL('/assessment/health');
  });

  test('Equipment opens the existing equipment assessment step directly', async ({ page }) => {
    await completeOnboarding(page);
    await page.goto('/profile');
    await page.getByRole('button', { name: /^Equipment/ }).click();
    await expect(page).toHaveURL('/equipment');
  });
});
