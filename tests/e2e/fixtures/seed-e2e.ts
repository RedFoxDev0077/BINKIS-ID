#!/usr/bin/env node
/**
 * End-to-end seed.
 *
 * Playwright needs something the rest of the system deliberately makes
 * impossible: plaintext claim codes. They exist nowhere in the database, so
 * the only way to drive a real claim through a real browser is to mint pieces
 * here and hand the plaintext straight to the test run in memory.
 *
 * That is exactly why this refuses to run anywhere near production. It wipes
 * the database it is pointed at, and it checks three separate things first.
 */
import { PrismaClient } from '@prisma/client';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { generatePieces } from '../../../src/lib/generator.ts';
import { hashPassword } from '../../../src/lib/auth/password.ts';
import { formatClaimCode } from '../../../src/lib/codes/claim-code.ts';

export interface E2EPiece {
  serial: string;
  qrToken: string;
  /** Plaintext, formatted XXX-XXX-XXX. Exists only for the duration of the run. */
  claimCode: string;
  editionNumber: number | null;
}

export interface E2EAccount {
  email: string;
  password: string;
  handle: string;
}

export interface E2EFixture {
  pieces: E2EPiece[];
  alice: E2EAccount;
  bob: E2EAccount;
}

export const FIXTURE_PATH = resolve(process.cwd(), 'tests/e2e/.fixture.json');

const PASSWORD = 'e2e-password-4417';

/**
 * Generous on purpose. Every test that claims needs a piece nobody has
 * touched, index 0 is reserved as a permanently-unclaimed one for the display
 * assertions, and the claim spec runs twice (desktop and mobile). Minting
 * spares costs milliseconds; running out mid-suite costs a confusing failure.
 */
const SEED_QUANTITY = 40;

/**
 * Three independent guards. Any one of them firing means stop.
 *
 * A test suite that wipes tables is the single most dangerous thing in this
 * repository, and "it only ever runs locally" is not a guarantee, it is a
 * habit. These are the guarantee.
 */
function assertSafeTarget(url: string): void {
  const parsed = new URL(url);

  // 1. Never a remote host. The production database lives inside Docker on the
  //    VPS and is reachable as `db`, so that name is refused too.
  const host = parsed.hostname;
  const localish = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  if (!localish) {
    throw new Error(
      `Refusing to seed a non-local database (host: ${host}). ` +
        'The e2e seed wipes every table it touches.',
    );
  }

  // 2. The database name must say what it is.
  const name = parsed.pathname.replace(/^\//, '');
  if (!/e2e|test/i.test(name)) {
    throw new Error(
      `Refusing to seed database "${name}": the name must contain "e2e" or "test". ` +
        'This is the guard that stops a stray DATABASE_URL from wiping real data.',
    );
  }

  // 3. Never against NODE_ENV=production, whatever the URL says.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run the e2e seed with NODE_ENV=production.');
  }
}

export async function seedE2E(databaseUrl: string, pepper: string): Promise<E2EFixture> {
  assertSafeTarget(databaseUrl);

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  try {
    // A fourth guard, and the only one that inspects the data rather than the
    // name: if this database holds an exported batch, it is real.
    const exported = await prisma.batch.count({ where: { status: 'EXPORTED' } });
    if (exported > 0) {
      throw new Error(
        `This database holds ${exported} exported batch(es) and is not a test database.`,
      );
    }

    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE
        passport_events, ownership_events, claim_attempts, audit_logs, transfers,
        sessions, pieces, batches, products, collector_ids, users
      RESTART IDENTITY CASCADE
    `);

    const product = await prisma.product.create({
      data: {
        character: 'Superman',
        characterCode: 'SP',
        editionType: 'CLASSIC',
        series: 'Series 1',
        rarity: 'Common',
        runSize: 130_000,
      },
    });

    const batch = await prisma.batch.create({
      data: {
        code: 'B-E2E-01',
        productId: product.id,
        quantity: SEED_QUANTITY,
        status: 'GENERATED',
      },
    });

    // The real generator, so these pieces are indistinguishable from
    // production ones apart from living in a database that is about to be
    // thrown away. A test against a hand-built fake proves nothing.
    const minted = await generatePieces({
      prisma,
      batchCode: batch.code,
      quantity: SEED_QUANTITY,
      pepper,
      producedAt: new Date('2026-02-01'),
      country: 'MX',
    });

    for (const piece of minted) {
      const row = await prisma.piece.findUniqueOrThrow({ where: { serial: piece.serial } });
      await prisma.passportEvent.create({
        data: {
          pieceId: row.id,
          seq: 1,
          type: 'BORN',
          title: 'Manufactured in Mexico',
          occurredAt: new Date('2026-02-01'),
        },
      });
    }

    const accounts: E2EAccount[] = [
      { email: 'alice@binkis.test', password: PASSWORD, handle: 'alice' },
      { email: 'bob@binkis.test', password: PASSWORD, handle: 'bob' },
    ];

    for (const account of accounts) {
      const user = await prisma.user.create({
        data: {
          email: account.email,
          handle: account.handle,
          passwordHash: await hashPassword(account.password),
        },
      });
      await prisma.collectorId.create({
        data: { userId: user.id, displayName: account.handle.toUpperCase() },
      });
    }

    const fixture: E2EFixture = {
      pieces: minted.map((piece) => ({
        serial: piece.serial,
        qrToken: piece.qrToken,
        claimCode: formatClaimCode(piece.claimCode),
        editionNumber: piece.editionNumber,
      })),
      alice: accounts[0]!,
      bob: accounts[1]!,
    };

    mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
    writeFileSync(FIXTURE_PATH, JSON.stringify(fixture, null, 2));

    return fixture;
  } finally {
    await prisma.$disconnect();
  }
}
