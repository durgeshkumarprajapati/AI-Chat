import { defineConfig, devices } from '@playwright/test';

/**
 * Production-grade responsive/E2E configuration.
 *
 * Test matrix design (deliberately NOT "every spec x every viewport" — see the instruction
 * this was built against): overflow.spec.ts is cheap (one page load + one scrollWidth read per
 * test, no interaction) so it runs across the FULL 8-breakpoint matrix requested. The
 * interactive suites (responsive.spec.ts's drawer/modal/form/chat checks, screenshots.spec.ts)
 * are materially more expensive and flake-prone per run, so they run on 3 representative
 * viewports only — `mobile` (a real device profile), `tablet`, `desktop` — chosen to be the
 * sizes real users actually cluster around, not an arbitrary 3 of the 8.
 *
 * NOT executed against a real browser in the sandbox this suite was authored in: no reachable
 * Postgres/Redis/RabbitMQ, `.env` blocked, and that sandbox's network allowlist blocks
 * Playwright's browser-binary CDN outright (confirmed via its own `<sandbox_violations>` log) —
 * see the accompanying report for the exact errors. `npx playwright test --list` does parse and
 * enumerate this config successfully in that environment; execution requires a normal
 * network-enabled machine or CI runner.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // Retries mask flakiness if used to hide real failures — kept low, and only in CI, where a
  // single slow-network hiccup shouldn't fail an otherwise-good pipeline run. Never retries
  // locally, so a real bug surfaces immediately during development instead of being retried away.
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  globalSetup: require.resolve('./tests/e2e/global-setup.ts'),
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list'], ['junit', { outputFile: 'test-results/junit.xml' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    navigationTimeout: 15_000
  },
  projects: [
    // --- Full 8-breakpoint overflow-only matrix ---
    { name: 'overflow-mobile-320', testMatch: /overflow\.spec\.ts/, use: { viewport: { width: 320, height: 568 } } },
    { name: 'overflow-mobile-375', testMatch: /overflow\.spec\.ts/, use: { viewport: { width: 375, height: 667 } } },
    { name: 'overflow-mobile-390', testMatch: /overflow\.spec\.ts/, use: { viewport: { width: 390, height: 844 } } },
    { name: 'overflow-tablet-768', testMatch: /overflow\.spec\.ts/, use: { viewport: { width: 768, height: 1024 } } },
    { name: 'overflow-tablet-1024x768', testMatch: /overflow\.spec\.ts/, use: { viewport: { width: 1024, height: 768 } } },
    { name: 'overflow-desktop-1366', testMatch: /overflow\.spec\.ts/, use: { viewport: { width: 1366, height: 768 } } },
    { name: 'overflow-desktop-1440', testMatch: /overflow\.spec\.ts/, use: { viewport: { width: 1440, height: 900 } } },
    { name: 'overflow-desktop-1920', testMatch: /overflow\.spec\.ts/, use: { viewport: { width: 1920, height: 1080 } } },

    // --- Representative interactive + screenshot suites ---
    {
      name: 'mobile',
      testMatch: /(responsive|screenshots)\.spec\.ts/,
      use: { ...devices['iPhone 12'] }
    },
    {
      name: 'tablet',
      testMatch: /(responsive|screenshots)\.spec\.ts/,
      use: { ...devices['iPad Mini'], viewport: { width: 768, height: 1024 } }
    },
    {
      name: 'desktop',
      testMatch: /(responsive|screenshots)\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }
    }
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        // Runs against a real production build (`next start`), not `next dev` — this is what
        // Phase 1 asked to be decided explicitly: dev mode's HMR overhead, different error
        // overlays, and unminified output make it a worse proxy for what's actually deployed.
        // CI runs `npm run build` as its own prior pipeline step and passes E2E_BASE_URL isn't
        // set, so this command still needs to build first there too; bundling `build` into this
        // command keeps `npm run test:e2e` fully self-sufficient for local use per Phase 2.
        command: 'npm run build && npm run start',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 180_000
      }
});
