#!/usr/bin/env node
/**
 * Boot a local PostgreSQL 16 for development, and keep it running.
 *
 * Convenience only. On the client's VPS, PostgreSQL comes from Docker Compose
 * (build step 6); this exists so the batch generator can be run and
 * demonstrated on a machine that has neither Docker nor a Postgres install.
 *
 *   node scripts/dev-db.ts
 *
 * Prints the two connection URLs, creates both databases, pushes the Prisma
 * schema into each, and writes .pgdata/dev.json. Ctrl-C to stop.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { startCluster, pushSchema } from './lib/pg-cluster.ts';

const PORT = Number(process.env.DEV_DB_PORT ?? 54_330);
const STATE_DIR = resolve(process.cwd(), '.pgdata');

// Outside the project tree: initdb on Windows fails on a path with a space.
const CLUSTER_ROOT = join(tmpdir(), 'binkis-id-devdb');

async function main() {
  console.log('Starting PostgreSQL 16...');

  const cluster = await startCluster({
    root: CLUSTER_ROOT,
    port: PORT,
    databases: ['binkis_id', 'binkis_staging'],
  });

  const urls = {
    DATABASE_URL: cluster.urlFor('binkis_id'),
    STAGING_DATABASE_URL: cluster.urlFor('binkis_staging'),
  };

  for (const [name, url] of Object.entries(urls)) {
    console.log(`Pushing schema to ${name}...`);
    pushSchema(url);
  }

  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(join(STATE_DIR, 'dev.json'), `${JSON.stringify(urls, null, 2)}\n`);

  console.log(`
PostgreSQL 16 is up on port ${PORT}.

  DATABASE_URL="${urls.DATABASE_URL}"
  STAGING_DATABASE_URL="${urls.STAGING_DATABASE_URL}"

Also written to .pgdata/dev.json.
Ctrl-C to stop. All data is discarded on exit.
`);

  const shutdown = () => {
    console.log('\nStopping PostgreSQL...');
    clearInterval(keepAlive);
    cluster.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // An unresolved promise does NOT keep Node alive - nothing is referenced by
  // the event loop, so the process exits immediately and leaves the server
  // running with nothing to shut it down. A referenced timer does keep it
  // alive, which is what we actually want here.
  const keepAlive = setInterval(() => {}, 1 << 30);
}

main().catch((error: unknown) => {
  console.error(`\nFAILED: ${(error as Error).message}\n`);
  process.exit(1);
});
