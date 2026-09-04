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

test.describe('E2E A — English Football Winger: full flow with the new adaptive questions', () => {
  test('language -> Create My Plan -> assessment (position/competitive level/matches/priority) -> Review -> Build My Plan -> Full Week -> Home -> Today -> reload', async ({ page }) => {
    await completeOnboarding(page, {
      sport: 'Football',
      position: 'Winger',
      competitiveLevel: 'Competitive',
      matchesPerWeek: '2',
      priority: 'Speed & Power',
      frequencyLabel: '5-6 / week',
    });
    await expect(page).toHaveURL('/');
    await expect(page.getByText('START WORKOUT')).toBeVisible();

    await page.getByRole('link', { name: 'Plan' }).click();
    await expect(page).toHaveURL('/plan');
    await expect(page.getByText('TODAY')).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL('/plan');
    await expect(page.getByText('TODAY')).toBeVisible();
  });
});

test.describe('E2E B — Arabic Football Defender: RTL, Arabic option labels, Arabic Review/Plan', () => {
  test('Arabic language -> assessment with Arabic sport/position/priority labels -> Arabic Review -> Build My Plan -> Arabic Full Week -> reload', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'العربية', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    await page.getByRole('button', { name: 'أنشئ خطتي' }).click();
    await page.waitForURL('**/onboarding/about');
    await page.getByPlaceholder('Your first name').fill('Sara');
    await page.getByRole('button', { name: 'NEXT' }).click();
    await page.waitForURL('**/sport-selection');

    await page.getByRole('button', { name: 'كرة القدم', exact: true }).click();
    await page.getByRole('button', { name: 'NEXT' }).click();
    await page.waitForURL('**/assessment');

    await page.getByRole('button', { name: 'المنزل' }).click();
    await page.getByRole('button', { name: 'NEXT' }).click();
    await page.waitForURL('**/equipment');
    await page.getByRole('button', { name: 'دمبل', exact: true }).click();
    await page.getByRole('button', { name: 'NEXT' }).click();
    await page.waitForURL('**/assessment/experience');

    await page.getByRole('button', { name: 'مبتدئ' }).first().click();
    await page.getByRole('button', { name: 'مدافع', exact: true }).click();
    const arFrequency = page.getByRole('button', { name: '3-4 / أسبوع' });
    await arFrequency.nth(0).click();
    await arFrequency.nth(1).click();
    // Anchored: "القوة" (Strength) is also a substring of "السرعة والقوة
    // الانفجارية" (Speed & Power)'s Arabic label, so a plain substring match
    // would hit both buttons.
    await page.getByRole('button', { name: /^القوة(?![\w-])/ }).click();
    await page.getByRole('button', { name: 'NEXT' }).click();
    await page.waitForURL('**/assessment/health');

    await page.getByRole('button', { name: 'NEXT' }).click();
    await page.waitForURL('**/assessment/body');
    await page.getByRole('button', { name: 'NEXT' }).click();
    await page.waitForURL('**/assessment/nutrition-preferences');

    await page.getByRole('button', { name: 'لا يوجد', exact: true }).click();
    await page.getByRole('button', { name: 'NEXT' }).click();
    await page.waitForURL('**/assessment/review');

    // Arabic Review screen shows Arabic option labels, not raw internal ids.
    await expect(page.getByText('كرة القدم')).toBeVisible();
    await expect(page.getByText('مدافع')).toBeVisible();

    await page.getByRole('button', { name: 'ابنِ خطتي' }).click(); // "BUILD MY PLAN" in Arabic
    await page.waitForURL('**/plan-ready');
    await page.getByRole('button', { name: 'عرض خطتي' }).click();
    await page.waitForURL('**/plan');
    await expect(page.getByText('اليوم')).toBeVisible(); // "TODAY" in Arabic

    await page.reload();
    await expect(page).toHaveURL('/plan');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByText('اليوم')).toBeVisible();
  });
});

test.describe('E2E C — Swimming: discipline reaches the assessment, full flow works', () => {
  test('English -> Swimming -> discipline -> Build My Plan -> Full Week -> Today\'s Workout -> reload', async ({ page }) => {
    await completeOnboarding(page, { sport: 'Swimming', position: 'Butterfly' });
    await expect(page).toHaveURL('/');

    await page.getByRole('link', { name: 'START WORKOUT' }).click();
    await expect(page).toHaveURL('/todays-workout');

    await page.reload();
    await expect(page).toHaveURL('/todays-workout');
    await expect(page.getByRole('heading', { name: "TODAY'S WORKOUT" })).toBeVisible();
  });
});

test.describe('E2E D — a rest-day athlete sees Rest on Home, not a fake workout', () => {
  test('advancing the plan cycle to a rest day shows Rest Day on Home, no Start Workout, Plan stays accessible', async ({ page }) => {
    // trainingDaySlots(2) = [0, 4] — cycle day 1 is a rest day for a 2-day/week athlete.
    await completeOnboarding(page, { frequencyLabel: '1-2 / week' });

    await page.evaluate(() => {
      const raw = localStorage.getItem('traino.profile');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const y = yesterday.getFullYear();
      const m = String(yesterday.getMonth() + 1).padStart(2, '0');
      const d = String(yesterday.getDate()).padStart(2, '0');
      parsed.data.planStartDate = `${y}-${m}-${d}`;
      localStorage.setItem('traino.profile', JSON.stringify(parsed));
    });
    await page.reload();

    await expect(page.getByText('Rest Day')).toBeVisible();
    await expect(page.getByText('START WORKOUT')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'VIEW WEEK' })).toBeVisible();

    await page.getByRole('link', { name: 'VIEW WEEK' }).click();
    await expect(page).toHaveURL('/plan');
    await expect(page.getByText('Rest', { exact: true }).first()).toBeVisible();
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
