import { startTestPostgres } from './postgres.ts';

/**
 * Boots the PostgreSQL the database tests run against.
 *
 * Set VITEST_SKIP_DB=1 to skip it while iterating on the pure unit tests -
 * the database suites will then fail fast rather than silently pass.
 */
export default async function setup() {
  if (process.env.VITEST_SKIP_DB === '1') return;

  const handle = await startTestPostgres();
  return async () => {
    await handle.stop();
  };
}
