#!/usr/bin/env node
/**
 * The end-to-end environment, start to finish.
 *
 * Boots a throwaway PostgreSQL 16, applies the real migrations, seeds pieces
 * with the real generator, builds the app, and serves it. Playwright launches
 * this as its `webServer` and kills it when the run ends; the cluster dies
 * with it and all data is discarded.
 *
 * This is one script rather than a Playwright globalSetup because Playwright
 * starts the webServer *before* globalSetup runs. Splitting them would mean
 * the app booting with no database, which fails in a way that looks like a
 * product bug rather than a harness bug.
 */
import { randomBytes } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { writeFileSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { startCluster, pushSchema } from '../../scripts/lib/pg-cluster.ts';
import { seedE2E, FIXTURE_PATH } from './fixtures/seed-e2e.ts';

const DB_PORT = Number(process.env.E2E_DB_PORT ?? 54_331);
const APP_PORT = Number(process.env.E2E_PORT ?? 3100);

// Outside the project tree: initdb on Windows fails on a path containing a
// space, and this project lives in "C:\my project\".
const CLUSTER_ROOT = join(tmpdir(), 'binkis-id-e2edb');

const ORIGIN = `http://127.0.0.1:${APP_PORT}`;

async function main() {
  log('starting PostgreSQL 16');
  const cluster = await startCluster({
    root: CLUSTER_ROOT,
    port: DB_PORT,
    databases: ['binkis_e2e', 'binkis_e2e_staging'],
  });

  const databaseUrl = cluster.urlFor('binkis_e2e');

  const shutdown = (code: number) => {
    try {
      cluster.stop();
    } catch {
      /* already gone */
    }
    rmSync(FIXTURE_PATH, { force: true });
    process.exit(code);
  };
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.on(signal, () => shutdown(0));
  }

  try {
    // migrate deploy, never db push: db push silently omits the hand-written
    // partial unique indexes, which would have the suite testing a schema that
    // could never actually deploy.
    log('applying migrations');
    pushSchema(databaseUrl);

    // A pepper generated per run. It never has to match anything outside this
    // process, so no real pepper is ever within reach of a test.
    const pepper = randomBytes(48).toString('base64');

    log('seeding');
    const fixture = await seedE2E(databaseUrl, pepper);
    log(`seeded ${fixture.pieces.length} pieces, 2 accounts`);

    const env = {
      ...process.env,
      DATABASE_URL: databaseUrl,
      STAGING_DATABASE_URL: cluster.urlFor('binkis_e2e_staging'),
      CLAIM_CODE_PEPPER: pepper,
      PUBLIC_ORIGIN: ORIGIN,
      NEXT_TELEMETRY_DISABLED: '1',
    };

    // A real production build, not `next dev`. Server components, caching and
    // revalidation all behave differently between the two, and the passport
    // page depends on every one of them.
    log('building');
    execFileSync('npm', ['run', 'build'], { env, stdio: 'inherit', shell: true });

    // next.config.ts sets output: 'standalone', and `next start` does not work
    // with it - Next says so itself in a warning that is easy to scroll past.
    // Production runs `node server.js` out of .next/standalone (see the
    // Dockerfile), so this does the same. Testing a different server than the
    // one that ships is how a suite goes green over a broken deployment.
    //
    // Standalone tracing copies the server but not the assets, so the two
    // directories the Dockerfile copies get copied here too.
    log('assembling standalone output');
    const standalone = resolve('.next/standalone');
    cpSync('public', join(standalone, 'public'), { recursive: true });
    cpSync('.next/static', join(standalone, '.next/static'), { recursive: true });

    log(`serving on ${ORIGIN}`);
    const app = spawn('node', [join(standalone, 'server.js')], {
      env: { ...env, PORT: String(APP_PORT), HOSTNAME: '127.0.0.1' },
      stdio: 'inherit',
    });

    app.on('exit', (code) => shutdown(code ?? 0));
  } catch (error) {
    console.error(`\n[e2e] setup failed: ${(error as Error).message}\n`);
    shutdown(1);
  }
}

function log(message: string) {
  console.log(`[e2e] ${message}`);
}

main();
