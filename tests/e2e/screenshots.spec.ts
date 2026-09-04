import { test, expect } from '@playwright/test';
import { STORAGE_STATE_PATH } from './global-setup';

/**
 * Small, high-value screenshot-regression suite (Phase 5/8) — 5 pages, not hundreds of
 * snapshots. Deliberately excludes anything with timestamps, streaming output, random/seeded
 * data, or external network-dependent content (no chat message is ever sent — the chat
 * screenshot captures the empty-conversation shell only, which is static and stable).
 *
 * Animations are disabled globally for these tests only (Playwright's `--disable-animations`
 * equivalent: forcing `prefers-reduced-motion` plus a CSS override) to remove timing-based
 * flakiness from transitions/fade-ins that exist purely for visual polish.
 *
 * Updating a screenshot intentionally: run `npx playwright test screenshots.spec.ts
 * --update-snapshots` locally after confirming the new rendering is correct, then commit the
 * updated files under tests/e2e/screenshots.spec.ts-snapshots/. Never update a snapshot to
 * paper over a failure you haven't actually looked at.
 */

test.use({
  colorScheme: 'light'
});

async function stabilize(page: import('@playwright/test').Page) {
  // Force-kills every CSS transition/animation (functionally equivalent to
  // `prefers-reduced-motion: reduce`, applied directly rather than through the context-option
  // fixture) so fade-ins/transitions can't introduce timing-based screenshot flakiness.
  await page.addStyleTag({
    content: `*, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition-duration: 0s !important; }`
  });
  await page.waitForLoadState('networkidle');
}

test.describe('Public pages', () => {
  test('landing page', async ({ page }) => {
    await page.goto('/');
    await stabilize(page);
    await expect(page).toHaveScreenshot('landing.png', { fullPage: true });
  });

  test('login page', async ({ page }) => {
    await page.goto('/login');
    await stabilize(page);
    await expect(page).toHaveScreenshot('login.png', { fullPage: true });
  });

  test('register page', async ({ page }) => {
    await page.goto('/register');
    await stabilize(page);
    await expect(page).toHaveScreenshot('register.png', { fullPage: true });
  });
});

test.describe('Authenticated pages', () => {
  test.use({ storageState: STORAGE_STATE_PATH });

  test('dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await stabilize(page);
    await expect(page).toHaveScreenshot('dashboard.png', {
      fullPage: true,
      // Weather/health-status widgets pull live external/DB-dependent data — mask rather than
      // fail the snapshot on values that legitimately change between runs.
      mask: [page.locator('text=Services Healthy'), page.locator('text=Degraded Status')]
    });
  });

  test('chat (empty conversation shell only — no message sent)', async ({ page }) => {
    await page.goto('/chat');
    await stabilize(page);
    await expect(page).toHaveScreenshot('chat-empty.png', { fullPage: true });
  });
});
