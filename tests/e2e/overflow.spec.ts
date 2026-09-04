import { test, expect } from '@playwright/test';
import { STORAGE_STATE_PATH } from './global-setup';

/**
 * Cheap, viewport-matrix horizontal-overflow check. This is the ONLY spec run across all 8
 * requested breakpoints (320x568 through 1920x1080 — see playwright.config.ts's `overflow-*`
 * projects) — a single `page.goto` + `scrollWidth` comparison per page, no interaction. The
 * fuller interactive suite (drawer, modal, forms, chat structure — responsive.spec.ts) and the
 * screenshot suite intentionally run on only 3 representative viewports instead, per the
 * "sensible test matrix, not everything x everything" instruction — that keeps this matrix's
 * CI cost near-linear in page count rather than exploding to (pages x interactions x 8).
 *
 * Public pages only (no auth dependency), so this can run standalone without global-setup.
 */
const PUBLIC_PAGES = ['/', '/login', '/register'];

for (const path of PUBLIC_PAGES) {
  test(`${path} has no horizontal overflow`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow, `document is ${overflow}px wider than the viewport at ${path}`).toBeLessThanOrEqual(1);
  });
}

// Authenticated pages — scoped storageState so the public-page tests above stay unauthenticated
// (an already-logged-in session could otherwise redirect /login away before the overflow check
// even runs). Requires global-setup.ts to have produced tests/e2e/.auth/user.json.
test.describe('authenticated pages', () => {
  test.use({ storageState: STORAGE_STATE_PATH });

  for (const path of ['/dashboard', '/chat']) {
    test(`${path} has no horizontal overflow`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow, `document is ${overflow}px wider than the viewport at ${path}`).toBeLessThanOrEqual(1);
    });
  }
});
