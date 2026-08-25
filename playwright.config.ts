import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests for the claim and transfer flows, per CLAUDE.md.
 *
 * These exist because the Vitest suite proves the *logic* is right and cannot
 * prove the product is. The claim moment in particular is the emotional core
 * of this system: scan, scratch, claim. That path runs through a scratchable
 * canvas overlay, a client-side check character, a server action and a
 * revalidated server component, and no unit test touches the seams between
 * them.
 *
 * They run against a real build on a throwaway PostgreSQL, never a dev server
 * and never a real database. See tests/e2e/global-setup.ts.
 */

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e/specs',

  // Claiming is a one-way door: a piece can be claimed exactly once, which is
  // the whole point. Retrying a failed claim spec would re-run it against a
  // piece that is now claimed and report a confusing second failure, so the
  // fixture gives each spec its own piece and retries stay off locally.
  retries: process.env.CI ? 1 : 0,

  // Serial by default. The specs share one database and one seeded fixture,
  // and a transfer spec racing a claim spec over the same piece would be
  // testing the test harness rather than the product.
  workers: 1,
  fullyParallel: false,

  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  timeout: 45_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // CLAUDE.md: "Mobile first, genuinely." Nearly every scan is a phone in
      // a shop, one-handed, in bad light. The claim flow is verified at 360px
      // because that is where it actually has to work.
      name: 'mobile',
      use: { ...devices['Pixel 5'], viewport: { width: 360, height: 780 } },
      testMatch: /claim\.spec\.ts/,
    },
  ],

  webServer: {
    // Boots PostgreSQL, migrates, seeds, builds and serves. One script owns
    // the whole lifecycle because Playwright starts the webServer before
    // globalSetup, so a split would boot the app with no database.
    command: 'node tests/e2e/serve.ts',
    url: BASE_URL,
    reuseExistingServer: false,
    // Generous, because this covers the whole lifecycle: initdb, migrations,
    // minting 40 pieces through the real generator, a production Next build,
    // and boot. On Windows the cluster and seed alone take several minutes -
    // a trivial Prisma transaction costs roughly 800ms here against
    // single-digit milliseconds on the Linux VPS.
    timeout: 900_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
