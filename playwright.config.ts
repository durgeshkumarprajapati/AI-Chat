import { defineConfig, devices } from '@playwright/test';

/**
 * Minimal responsive-regression suite. Not run in this sandbox (no reachable Postgres/Redis,
 * .env blocked, and Playwright's browser CDN is blocked by this sandbox's network allowlist —
 * see the accompanying report). Requires a real dev environment: `npm run dev:web` reachable,
 * a seeded database (`npx prisma db seed`), and normal outbound network access for the
 * one-time `npx playwright install chromium`.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [
    { name: 'mobile-375', use: { ...devices['iPhone SE'] } },
    { name: 'tablet-768', use: { viewport: { width: 768, height: 1024 } } },
    { name: 'desktop-1440', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev:web',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000
      }
});
