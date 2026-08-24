import { appendFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

/**
 * A throwaway local PostgreSQL 16 cluster.
 *
 * Used by the test harness and by `scripts/dev-db.ts`. It drives the binaries
 * that the `embedded-postgres` package downloads, but starts them through
 * pg_ctl rather than through that package's own start().
 *
 * Two Windows-specific reasons for that, both learned the hard way:
 *
 *   1. postgres.exe refuses to run under an account with administrative
 *      privileges. pg_ctl is the supported entry point precisely because it
 *      relaunches the server under a restricted token.
 *   2. pg_ctl hands its stdio handles to the server it starts, and the server
 *      holds them open for its whole life. A piped execFileSync would block on
 *      EOF forever, even after -w has already reported the server ready.
 *
 * On Linux and macOS - which is what the client's VPS runs - this path behaves
 * identically to any other pg_ctl invocation, so none of it costs anything
 * there. In production PostgreSQL comes from Docker Compose; this is only for
 * developing and demonstrating on a machine without one.
 */

export interface ClusterOptions {
  /** Must not contain a space: initdb on Windows fails on such a path. */
  root: string;
  port: number;
  user?: string;
  password?: string;
  databases: readonly string[];
}

export interface Cluster {
  baseUrl: string;
  urlFor: (database: string) => string;
  stop: () => void;
}

export async function startCluster(options: ClusterOptions): Promise<Cluster> {
  const { root, port, user = 'binkis', password = 'binkis', databases } = options;

  if (/\s/.test(root)) {
    throw new Error(
      `Cluster path "${root}" contains a space. initdb on Windows fails on those; ` +
        'choose a path without one.',
    );
  }

  const dataDir = join(root, 'cluster');
  const logFile = join(root, 'server.log');
  const bin = postgresBinDir();

  // A cluster left behind by a killed run will not initialise. Start clean.
  stopAt(bin, dataDir);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });

  const passwordFile = join(root, 'pwfile');
  writeFileSync(passwordFile, password, 'utf8');
  try {
    execFileSync(join(bin, 'initdb'), [
      '-D', dataDir,
      '-U', user,
      '--auth=trust',
      '--encoding=UTF8',
      '--locale=C',
      `--pwfile=${passwordFile}`,
    ], { stdio: 'pipe' });
  } finally {
    rmSync(passwordFile, { force: true });
  }

  appendFileSync(
    join(dataDir, 'postgresql.conf'),
    [
      '',
      '# BINKIS ID local cluster. Loopback only, durability traded for speed.',
      `port = ${port}`,
      "listen_addresses = '127.0.0.1'",
      'fsync = off',
      'synchronous_commit = off',
      'full_page_writes = off',
      'max_connections = 200',
      '',
    ].join('\n'),
    'utf8',
  );

  execFileSync(join(bin, 'pg_ctl'), ['-D', dataDir, '-l', logFile, '-w', '-t', '60', 'start'], {
    stdio: 'ignore',
  });

  const baseUrl = `postgresql://${user}:${password}@127.0.0.1:${port}`;
  const urlFor = (database: string) => `${baseUrl}/${database}?schema=public`;

  // No psql or createdb ships with these binaries, so create the databases
  // over the wire from the bootstrap database.
  const admin = new PrismaClient({ datasources: { db: { url: `${baseUrl}/postgres` } } });
  try {
    for (const database of databases) {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${database}"`);
    }
  } finally {
    await admin.$disconnect();
  }

  return {
    baseUrl,
    urlFor,
    stop: () => stopAt(bin, dataDir),
  };
}

function stopAt(bin: string, dataDir: string): void {
  if (!existsSync(join(dataDir, 'postmaster.pid'))) return;
  try {
    execFileSync(join(bin, 'pg_ctl'), ['-D', dataDir, '-m', 'immediate', '-w', '-t', '30', 'stop'], {
      stdio: 'ignore',
    });
  } catch {
    // Already gone, or never came up. Nothing useful to do.
  }
}

/**
 * Build a database's schema by APPLYING THE MIGRATIONS.
 *
 * Deliberately `migrate deploy`, not `db push`.
 *
 * `db push` only materialises what schema.prisma can express. Anything written
 * by hand in a migration is invisible to it, and this project has exactly such
 * a thing: the partial unique index that permits only one PENDING transfer per
 * piece, which Prisma cannot describe.
 *
 * With `db push` the test database silently lacked that constraint while
 * production had it, so the suite was testing a schema that would never be
 * deployed. Running the real migrations means the tests exercise precisely the
 * database production runs.
 *
 * Runs Prisma's JS entry point under the current Node rather than through
 * `npx`: Node 22.13+ refuses to spawn a .cmd shim without shell: true, and
 * enabling a shell would mean interpolating a connection string into a
 * command line.
 */
export function pushSchema(databaseUrl: string): void {
  const cli = findPrismaCli();

  execFileSync(process.execPath, [cli, 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
    cwd: process.cwd(),
  });
}

/**
 * Locate the Prisma CLI entry point.
 *
 * Walked up from the working directory rather than resolved through require:
 * the `prisma` package's exports map points at a build artefact that is not
 * present in the published tarball, so require.resolve('prisma') throws.
 */
function findPrismaCli(): string {
  let dir = process.cwd();
  for (let depth = 0; depth < 8; depth++) {
    const candidate = join(dir, 'node_modules', 'prisma', 'build', 'index.js');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('Could not find the Prisma CLI. Run `npm install`.');
}

/** Locate the platform's binary package that `embedded-postgres` pulled in. */
function postgresBinDir(): string {
  const packages: Record<string, string> = {
    'win32-x64': '@embedded-postgres/windows-x64',
    'linux-x64': '@embedded-postgres/linux-x64',
    'linux-arm64': '@embedded-postgres/linux-arm64',
    'darwin-x64': '@embedded-postgres/darwin-x64',
    'darwin-arm64': '@embedded-postgres/darwin-arm64',
  };

  const key = `${process.platform}-${process.arch}`;
  const name = packages[key];
  if (!name) {
    throw new Error(
      `No embedded PostgreSQL binaries for ${key}. Point DATABASE_URL at your own ` +
        'PostgreSQL 16 instead.',
    );
  }

  // These packages block "./package.json" in their exports map, so resolve the
  // main entry and walk up to the package root.
  const require = createRequire(import.meta.url);
  let dir = dirname(require.resolve(name));
  for (let depth = 0; depth < 6; depth++) {
    const candidate = join(dir, 'native', 'bin');
    if (existsSync(candidate)) return candidate;
    dir = dirname(dir);
  }

  throw new Error(
    `Found ${name} but not its native/bin directory. The binary download may have ` +
      'been interrupted; remove node_modules/@embedded-postgres and reinstall.',
  );
}
