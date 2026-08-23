import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { testClient, reset, seedProductAndBatch, TEST_PEPPER } from '../support/fixtures.ts';
import { generatePieces } from '../../src/lib/generator.ts';
import { hashClaimCode } from '../../src/lib/hash.ts';
import { generateQrToken, generateClaimCode } from '../../src/lib/codes/mint.ts';
import type { RandomSource } from '../../src/lib/codes/random.ts';

// Requirement: uniqueness is enforced with database constraints, not
// application checks. So these tests attack the database directly. If the
// only thing standing between two pieces and the same claim code is an
// `if` statement in TypeScript, every test here should fail.

let prisma: PrismaClient;

beforeAll(() => {
  prisma = testClient('main');
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await reset(prisma);
});

describe('the database refuses duplicates even when the application does not', () => {
  it('rejects a duplicate serial via raw SQL, bypassing Prisma entirely', async () => {
    const { product, batch } = await seedProductAndBatch(prisma);
    const base = {
      productId: product.id,
      batchId: batch.id,
      productionYear: 2026,
      producedAt: new Date('2026-01-15'),
      country: 'CN',
    };

    await prisma.piece.create({
      data: { ...base, serial: 'SP-000001', qrToken: 'AAAAAAAAAAAA', claimHash: 'hash-a' },
    });

    // Raw INSERT. No Prisma validation, no application logic in the path.
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO pieces (id, serial, qr_token, claim_hash, product_id, batch_id,
           production_year, produced_at, country, status, verified)
         VALUES (gen_random_uuid(), 'SP-000001', 'BBBBBBBBBBBB', 'hash-b',
           $1::uuid, $2::uuid, 2026, now(), 'CN', 'UNCLAIMED', false)`,
        product.id,
        batch.id,
      ),
    ).rejects.toThrow(/23505|unique constraint|already exists/i);
  });

  it('rejects a duplicate qr_token via raw SQL', async () => {
    const { product, batch } = await seedProductAndBatch(prisma);
    await prisma.piece.create({
      data: {
        serial: 'SP-000001',
        qrToken: 'AAAAAAAAAAAA',
        claimHash: 'hash-a',
        productId: product.id,
        batchId: batch.id,
        productionYear: 2026,
        producedAt: new Date('2026-01-15'),
        country: 'CN',
      },
    });

    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO pieces (id, serial, qr_token, claim_hash, product_id, batch_id,
           production_year, produced_at, country, status, verified)
         VALUES (gen_random_uuid(), 'SP-000002', 'AAAAAAAAAAAA', 'hash-b',
           $1::uuid, $2::uuid, 2026, now(), 'CN', 'UNCLAIMED', false)`,
        product.id,
        batch.id,
      ),
    ).rejects.toThrow(/23505|unique constraint|already exists/i);
  });

  it('rejects a duplicate claim_hash via raw SQL', async () => {
    const { product, batch } = await seedProductAndBatch(prisma);
    const sharedHash = hashClaimCode('7K9P2M4XQ3F', TEST_PEPPER);

    await prisma.piece.create({
      data: {
        serial: 'SP-000001',
        qrToken: 'AAAAAAAAAAAA',
        claimHash: sharedHash,
        productId: product.id,
        batchId: batch.id,
        productionYear: 2026,
        producedAt: new Date('2026-01-15'),
        country: 'CN',
      },
    });

    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO pieces (id, serial, qr_token, claim_hash, product_id, batch_id,
           production_year, produced_at, country, status, verified)
         VALUES (gen_random_uuid(), 'SP-000002', 'BBBBBBBBBBBB', $3,
           $1::uuid, $2::uuid, 2026, now(), 'CN', 'UNCLAIMED', false)`,
        product.id,
        batch.id,
        sharedHash,
      ),
    ).rejects.toThrow(/23505|unique constraint|already exists/i);
  });

  it('has the unique indexes physically present on the pieces table', async () => {
    const indexes = await prisma.$queryRawUnsafe<Array<{ indexdef: string }>>(
      `SELECT indexdef FROM pg_indexes WHERE tablename = 'pieces'`,
    );
    const defs = indexes.map((i) => i.indexdef).join('\n');
    expect(defs).toMatch(/CREATE UNIQUE INDEX.*\(serial\)/);
    expect(defs).toMatch(/CREATE UNIQUE INDEX.*\(qr_token\)/);
    expect(defs).toMatch(/CREATE UNIQUE INDEX.*\(claim_hash\)/);
  });
});

describe('uniqueness at production scale', () => {
  it('generates 50,000 pieces with no collision in serial, token or hash', async () => {
    const QUANTITY = 50_000;
    const { batch } = await seedProductAndBatch(prisma, {
      batchCode: 'B-SCALE-01',
      quantity: QUANTITY,
    });

    const pieces = await generatePieces({
      prisma,
      batchCode: batch.code,
      quantity: QUANTITY,
      pepper: TEST_PEPPER,
      producedAt: new Date('2026-01-15'),
      country: 'CN',
    });

    expect(pieces).toHaveLength(QUANTITY);

    // In memory.
    expect(new Set(pieces.map((p) => p.serial)).size).toBe(QUANTITY);
    expect(new Set(pieces.map((p) => p.qrToken)).size).toBe(QUANTITY);
    expect(new Set(pieces.map((p) => p.claimCode)).size).toBe(QUANTITY);
    expect(new Set(pieces.map((p) => p.claimHash)).size).toBe(QUANTITY);

    // And in the database, which is the copy that matters.
    const [row] = await prisma.$queryRawUnsafe<
      Array<{ total: bigint; serials: bigint; tokens: bigint; hashes: bigint }>
    >(`SELECT count(*) AS total,
              count(DISTINCT serial) AS serials,
              count(DISTINCT qr_token) AS tokens,
              count(DISTINCT claim_hash) AS hashes
         FROM pieces`);

    expect(Number(row!.total)).toBe(QUANTITY);
    expect(Number(row!.serials)).toBe(QUANTITY);
    expect(Number(row!.tokens)).toBe(QUANTITY);
    expect(Number(row!.hashes)).toBe(QUANTITY);
  }, 600_000);

  it('generates 140,000 tokens and claim codes in memory with no collision', () => {
    // The full production run is 134,399 pieces plus 3,000 spares. Birthday
    // bound over 31^12 tokens is negligible, but this is the number that
    // actually ships, so it gets checked rather than assumed.
    const N = 140_000;
    const tokens = new Set<string>();
    const codes = new Set<string>();
    for (let i = 0; i < N; i++) {
      tokens.add(generateQrToken());
      codes.add(generateClaimCode());
    }
    expect(tokens.size).toBe(N);
    expect(codes.size).toBe(N);
  }, 120_000);
});

describe('collision handling goes through the constraint, not around it', () => {
  it('recovers when the random source hands out a token it has already used', async () => {
    const QUANTITY = 40;
    const { batch } = await seedProductAndBatch(prisma, {
      batchCode: 'B-COLLIDE-01',
      quantity: QUANTITY,
    });

    // A deliberately terrible random source: it repeats its first output for
    // the first several draws. A generator that pre-checks in application
    // memory might paper over this; a generator that relies on the database
    // constraint must hit P2002 and regenerate.
    let draw = 0;
    const repeats = 6;
    const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
    const rigged: RandomSource = (length) => {
      draw++;
      if (draw <= repeats) return 'A'.repeat(length);
      // Base-31 encoding of the draw counter: deterministic, injective, and
      // entirely inside the alphabet.
      let out = '';
      let n = draw;
      for (let i = 0; i < length; i++) {
        out += alphabet[n % alphabet.length];
        n = Math.floor(n / alphabet.length);
      }
      return out;
    };

    const pieces = await generatePieces({
      prisma,
      batchCode: batch.code,
      quantity: QUANTITY,
      pepper: TEST_PEPPER,
      producedAt: new Date('2026-01-15'),
      country: 'CN',
      rng: rigged,
    });

    expect(pieces).toHaveLength(QUANTITY);
    expect(new Set(pieces.map((p) => p.qrToken)).size).toBe(QUANTITY);
    expect(new Set(pieces.map((p) => p.claimHash)).size).toBe(QUANTITY);
    expect(await prisma.piece.count()).toBe(QUANTITY);
  }, 120_000);

  it('gives up loudly rather than silently emitting a duplicate when the RNG is broken', async () => {
    const { batch } = await seedProductAndBatch(prisma, {
      batchCode: 'B-BROKEN-RNG',
      quantity: 5,
    });

    // Constant output forever. There is no correct batch to emit here.
    const constant: RandomSource = (length) => 'K'.repeat(length);

    await expect(
      generatePieces({
        prisma,
        batchCode: batch.code,
        quantity: 5,
        pepper: TEST_PEPPER,
        producedAt: new Date('2026-01-15'),
        country: 'CN',
        rng: constant,
      }),
    ).rejects.toThrow(/collision|exhausted|random/i);
  }, 120_000);
});

describe('what is stored is only the hash', () => {
  it('no column anywhere in the database contains a plaintext claim code', async () => {
    const { batch } = await seedProductAndBatch(prisma, { batchCode: 'B-NOPLAIN', quantity: 25 });
    const pieces = await generatePieces({
      prisma,
      batchCode: batch.code,
      quantity: 25,
      pepper: TEST_PEPPER,
      producedAt: new Date('2026-01-15'),
      country: 'CN',
    });

    const stored = await prisma.piece.findMany();
    const haystack = JSON.stringify(stored);

    for (const piece of pieces) {
      expect(haystack).not.toContain(piece.claimCode);
      expect(haystack).not.toContain(piece.claimCode.slice(0, 6));
    }

    // And the hash is a real HMAC of the code under the pepper.
    for (const piece of pieces) {
      expect(piece.claimHash).toBe(hashClaimCode(piece.claimCode, TEST_PEPPER));
      expect(piece.claimHash).toMatch(/^[0-9a-f]{64}$/);
    }
  }, 120_000);

  it('changing the pepper changes every hash', () => {
    const code = generateClaimCode();
    const one = 'pepper-one-0123456789abcdefghijklmnop';
    const two = 'pepper-two-0123456789abcdefghijklmnop';
    expect(one.length).toBeGreaterThanOrEqual(32);
    expect(hashClaimCode(code, one)).not.toBe(hashClaimCode(code, two));
  });

  it('refuses to hash without a pepper', () => {
    expect(() => hashClaimCode('7K9P2M4XQ3F', '')).toThrow();
    expect(() => hashClaimCode('7K9P2M4XQ3F', 'short')).toThrow();
  });
});
