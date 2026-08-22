import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { startCluster, pushSchema, type Cluster } from '../../scripts/lib/pg-cluster.ts';

/**
 * Test PostgreSQL lifecycle.
 *
 * The batch generator's two hardest guarantees - uniqueness enforced by the
 * database, and exactly-one-winner under a concurrent claim - cannot be proved
 * against a fake. Both need a real PostgreSQL with real unique indexes and
 * real MVCC across separate connections.
 *
 * If TEST_DATABASE_URL is set we use it. Otherwise a throwaway PostgreSQL 16
 * is stood up for the run and torn down afterwards.
 */

const STATE_DIR = resolve(process.cwd(), '.pgdata');
const STATE_FILE = resolve(STATE_DIR, 'connection.json');

// Outside the project tree: initdb on Windows fails on a data directory whose
// path contains a space, and this project lives in "C:\my project\".
const CLUSTER_ROOT = join(tmpdir(), 'binkis-id-pg');

const PORT = Number(process.env.TEST_DB_PORT ?? 54_329);

export interface TestPostgres {
  url: string;
  /** Second database, used by the generator's staging claim rehearsal. */
  stagingUrl: string;
  external: boolean;
}

export function readTestPostgres(): TestPostgres {
  if (!existsSync(STATE_FILE)) {
    throw new Error(
      'No test database. Vitest globalSetup should have created one. Run the suite via `npm test`.',
    );
  }
  return JSON.parse(readFileSync(STATE_FILE, 'utf8')) as TestPostgres;
}

export interface Handle {
  stop: () => Promise<void>;
}

export async function startTestPostgres(): Promise<Handle> {
  mkdirSync(STATE_DIR, { recursive: true });

  const external = process.env.TEST_DATABASE_URL;
  if (external) {
    const state: TestPostgres = {
      url: external,
      stagingUrl:
        process.env.TEST_STAGING_DATABASE_URL ?? withDatabase(external, 'binkis_staging'),
      external: true,
    };
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    pushSchema(state.url);
    pushSchema(state.stagingUrl);
    return { stop: async () => {} };
  }

  let cluster: Cluster;
  try {
    cluster = await startCluster({
      root: CLUSTER_ROOT,
      port: PORT,
      databases: ['binkis_test', 'binkis_staging'],
    });
  } catch (error) {
    throw new Error(
      `Could not start a local PostgreSQL for the database tests: ${(error as Error).message}\n` +
        'Set TEST_DATABASE_URL to point the suite at your own PostgreSQL 16 instead.',
    );
  }

  const state: TestPostgres = {
    url: cluster.urlFor('binkis_test'),
    stagingUrl: cluster.urlFor('binkis_staging'),
    external: false,
  };
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

  pushSchema(state.url);
  pushSchema(state.stagingUrl);

  return {
    stop: async () => {
      cluster.stop();
      rmSync(STATE_FILE, { force: true });
    },
  };
}

function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}
