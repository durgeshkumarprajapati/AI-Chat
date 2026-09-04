import { chromium, type FullConfig } from '@playwright/test';
import path from 'path';

/**
 * Deterministic authentication strategy (Phase 6): log in ONCE for the whole run through the
 * real UI, against the dedicated E2E test user (prisma/seed.e2e.ts — exists only in the
 * isolated E2E database), and persist the resulting session cookie as Playwright storage
 * state. Every authenticated test then reuses that storage state (see playwright.config.ts's
 * `authenticated` project) instead of re-logging-in per test — this is the standard
 * Playwright-recommended pattern for reliable, non-flaky authenticated E2E suites, and avoids
 * hitting the login endpoint dozens of times per run.
 *
 * This performs a REAL login (fills the real form, submits it, waits for the real redirect) —
 * it does not fabricate a cookie or bypass application code. If login fails, this throws and
 * the entire run fails loudly; authenticated tests are never silently skipped because of it
 * (see Phase 6's explicit rule against silent skipping — the try/catch fallbacks used earlier
 * in this project's throwaway single-file suite are gone; this setup either produces a valid
 * session or the whole suite reports a hard failure).
 */
export const STORAGE_STATE_PATH = path.join(__dirname, '.auth', 'user.json');

export default async function globalSetup(_config: FullConfig) {
  const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000';
  const email = process.env.E2E_TEST_EMAIL || 'e2e-test@documentai.local';
  const password = process.env.E2E_TEST_PASSWORD || 'E2eTestOnly!2026';

  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL });

  await page.goto('/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();

  // Real navigation wait, not a fixed sleep — fails loudly (not silently) if login doesn't
  // actually succeed within a reasonable window.
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });

  await page.context().storageState({ path: STORAGE_STATE_PATH });
  await browser.close();
}
