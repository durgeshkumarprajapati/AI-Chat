import { test, expect, type Page } from '@playwright/test';
import { STORAGE_STATE_PATH } from './global-setup';

/**
 * Full interactive responsive suite. Runs on 3 representative viewport projects only
 * (`mobile`, `tablet`, `desktop` — see playwright.config.ts), not the full 8-size matrix that
 * overflow.spec.ts covers — these tests do real interaction (clicks, form fills, waiting for
 * animations/navigation), which is materially more expensive and flake-prone per run than a
 * single scrollWidth check, so duplicating them across all 8 sizes would blow up CI runtime for
 * little additional signal beyond what the 3 representative sizes already catch.
 *
 * Authenticated tests use the shared storage state produced by global-setup.ts (real UI login
 * against the seeded E2E test user, done once) rather than logging in per test.
 */

async function hasHorizontalOverflow(page: Page): Promise<boolean> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  return overflow > 1;
}

test.describe('Landing page', () => {
  test('renders with visible branding and no horizontal overflow', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: /document ai/i }).first()).toBeVisible();
    expect(await hasHorizontalOverflow(page)).toBe(false);
  });
});

test.describe('Landing mobile navigation drawer', () => {
  test('opens, exposes Support link, closes, no overflow introduced', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'Drawer only rendered below the md breakpoint');
    await page.goto('/');

    const openButton = page.getByRole('button', { name: 'Open Navigation Menu' });
    await expect(openButton).toBeVisible();
    await openButton.click();

    const drawer = page.getByRole('dialog', { name: 'Mobile Navigation Menu' });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('link', { name: 'Support' })).toBeVisible();
    expect(await hasHorizontalOverflow(page)).toBe(false);

    await page.getByRole('button', { name: 'Close Navigation Menu' }).click();
    await expect(drawer).toBeHidden();
  });
});

test.describe('Authentication forms stack correctly on mobile', () => {
  for (const path of ['/login', '/register']) {
    test(`${path} fields are stacked and full-width, submit button visible`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile', 'Mobile-only layout assertion');
      await page.goto(path);

      const emailBox = await page.locator('input[type="email"]').first().boundingBox();
      const passwordBox = await page.locator('input[type="password"]').first().boundingBox();
      expect(emailBox, `email input not visible on ${path}`).toBeTruthy();
      expect(passwordBox, `password input not visible on ${path}`).toBeTruthy();

      if (emailBox && passwordBox) {
        // Stacked vertically: password field starts at/after where the email field ends.
        expect(passwordBox.y).toBeGreaterThanOrEqual(emailBox.y + emailBox.height - 5);
        // Full-width, not squeezed into a side-by-side column.
        const viewportWidth = testInfo.project.use.viewport!.width;
        expect(emailBox.width).toBeGreaterThan(viewportWidth * 0.6);
      }

      const submitButton = page.getByRole('button', { name: /sign in|create account|register/i }).first();
      await expect(submitButton).toBeVisible();
      expect(await hasHorizontalOverflow(page)).toBe(false);
    });
  }
});

test.describe('Authenticated app shell', () => {
  test.use({ storageState: STORAGE_STATE_PATH });

  test('desktop: sidebar visible, content does not overlap it', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Desktop-only sidebar assertion');
    await page.goto('/dashboard');

    const sidebarLink = page.getByRole('link', { name: /document ai/i }).first();
    await expect(sidebarLink).toBeVisible();
    expect(await hasHorizontalOverflow(page)).toBe(false);
  });

  test('mobile: hamburger opens the app drawer, no overflow, closes again', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'Drawer only rendered below the lg breakpoint');
    await page.goto('/dashboard');

    // The drawer's own "Navigation" heading is the most stable thing to assert open/closed
    // against — the drawer has no role="dialog"/aria-label (unlike the landing navbar's drawer),
    // so this is the best available semantic anchor without adding a data-testid.
    const drawerHeading = page.getByText('Navigation', { exact: true });

    const toggle = page.getByRole('button', { name: 'Toggle Navigation Menu' });
    await expect(toggle).toBeVisible();
    await expect(drawerHeading).toBeHidden();

    await toggle.click();
    await expect(drawerHeading).toBeVisible();
    expect(await hasHorizontalOverflow(page)).toBe(false);

    // Toggle again to close — same button, label doesn't change (☰/✕ glyph swap is visual only).
    // Previously this test clicked-to-close but never verified the close actually happened —
    // fixed here to actually assert it, not just exercise the code path.
    await toggle.click();
    await expect(drawerHeading).toBeHidden();
  });

  test('notification bell opens a dropdown that stays within the viewport', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'Bell is reachable on tablet/desktop without opening the drawer first');
    await page.goto('/dashboard');

    const bell = page.getByRole('button', { name: /notification/i }).first();
    if (!(await bell.isVisible().catch(() => false))) {
      test.skip(true, 'Notification bell not present in this app shell state');
    }
    await bell.click();

    const heading = page.getByText('Notifications', { exact: true });
    await expect(heading).toBeVisible();

    // The heading sitting fully inside the viewport is a reasonable proxy for the whole
    // dropdown panel doing so too, without climbing the DOM via a fragile ancestor selector.
    const box = await heading.boundingBox();
    const viewportSize = page.viewportSize();
    if (box && viewportSize) {
      expect(box.x + box.width).toBeLessThanOrEqual(viewportSize.width + 1);
      expect(box.x).toBeGreaterThanOrEqual(-1);
    }
  });
});

test.describe('Chat page structure', () => {
  test.use({ storageState: STORAGE_STATE_PATH });

  test('renders header, input area and controls without horizontal overflow', async ({ page }, testInfo) => {
    await page.goto('/chat');

    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible();

    const sendButton = page.getByRole('button', { name: /send/i }).first();
    await expect(sendButton).toBeVisible();

    expect(await hasHorizontalOverflow(page)).toBe(false);

    if (testInfo.project.name === 'mobile') {
      // The input textarea must retain a usable width even alongside the attach/voice/send
      // controls at mobile widths — this is the exact regression the Phase-91-era chat-input
      // flex-wrap fix (src/app/chat/page.tsx) protects against.
      const box = await textarea.boundingBox();
      expect(box && box.width).toBeGreaterThan(80);
    }
  });
});
