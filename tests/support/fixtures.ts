import { PrismaClient } from '@prisma/client';
import { readTestPostgres } from './postgres.ts';

export const TEST_PEPPER = 'test-pepper-not-a-real-secret-0123456789abcdef';

/**
 * A Prisma client for the test database, pinned to a single connection.
 *
 * The concurrency tests spawn one client per contender to get genuinely
 * separate PostgreSQL connections racing. Prisma's default pool is
 * (cores * 2 + 1) per client, so fifty clients would try to open several
 * hundred connections and exhaust the server before the race even starts.
 * One connection per client is both what the test means and what fits.
 */
export function testClient(
  which: 'main' | 'staging' = 'main',
  connectionLimit = 1,
): PrismaClient {
  const state = readTestPostgres();
  const base = which === 'main' ? state.url : state.stagingUrl;
  const url = new URL(base);
  url.searchParams.set('connection_limit', String(connectionLimit));
  url.searchParams.set('pool_timeout', '60');

  return new PrismaClient({ datasources: { db: { url: url.toString() } } });
}

/** Wipe every table. Order matters: children before parents. */
export async function reset(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      passport_events, ownership_events, claim_attempts, audit_logs,
      pieces, batches, products, collector_ids, users
    RESTART IDENTITY CASCADE
  `);
}

export async function seedProductAndBatch(
  prisma: PrismaClient,
  options: {
    characterCode?: string;
    character?: string;
    editionType?: 'CLASSIC' | 'LIMITED' | 'LEGENDARY' | 'SPARE' | 'ARTIST_PROOF';
    batchCode?: string;
    quantity?: number;
  } = {},
) {
  const {
    characterCode = 'SP',
    character = 'Superman',
    editionType = 'CLASSIC',
    batchCode = 'B-TEST-01',
    quantity = 10,
  } = options;

  const product = await prisma.product.create({
    data: {
      character,
      characterCode,
      editionType,
      series: 'Series 1',
      rarity: 'Common',
      runSize: quantity,
    },
  });

  const batch = await prisma.batch.create({
    data: { code: batchCode, productId: product.id, quantity, status: 'GENERATED' },
  });

  return { product, batch };
}

export async function seedCollector(prisma: PrismaClient, handle: string) {
  const user = await prisma.user.create({
    data: {
      email: `${handle}@example.test`,
      handle,
      passwordHash: 'argon2id$placeholder',
    },
  });
  return prisma.collectorId.create({
    data: { userId: user.id, displayName: handle },
  });
}
