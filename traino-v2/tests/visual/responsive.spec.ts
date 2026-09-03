import { test, expect } from '../e2e/helpers/fixtures';
import { completeOnboarding } from '../e2e/helpers/onboarding';

/**
 * Responsive smoke (Phase 12 spec §31). Not full golden-screenshot
 * coverage at every size — the canonical visual baseline stays 390x844
 * (tests/visual/visual.spec.ts). This only proves the layout doesn't
 * break (no horizontal scroll, key content still visible, no console
 * errors) at three other common device sizes. Reuses the E2E fixture
 * (which blocks the Google Fonts request) since this is a functional
 * smoke check, not a pixel comparison — the real font isn't needed.
 */

const VIEWPORTS: Array<{ name: string; width: number; height: number }> = [
  { name: '375x812', width: 375, height: 812 },
  { name: '393x852', width: 393, height: 852 },
  { name: '430x932', width: 430, height: 932 },
];

for (const vp of VIEWPORTS) {
  test.describe(`Responsive smoke — ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test(`Home renders with no horizontal overflow at ${vp.name}`, async ({ page }) => {
      await completeOnboarding(page);
      await page.goto('/');
      await expect(page.getByText('START WORKOUT')).toBeVisible();

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflow).toBe(false);
    });

    test(`Today's Workout renders with no horizontal overflow at ${vp.name}`, async ({ page }) => {
      await completeOnboarding(page);
      await page.goto('/todays-workout');
      await expect(page.getByRole('heading', { name: "TODAY'S WORKOUT" })).toBeVisible();

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflow).toBe(false);
    });
  });
}
