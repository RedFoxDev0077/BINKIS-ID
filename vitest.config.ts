import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globalSetup: ['./tests/support/global-setup.ts'],
    // The database tests share one PostgreSQL and truncate between cases, so
    // test files must not run against it concurrently.
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 300_000,
    teardownTimeout: 60_000,
  },
});
