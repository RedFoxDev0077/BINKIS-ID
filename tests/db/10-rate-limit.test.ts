import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { testClient, reset, seedProductAndBatch, TEST_PEPPER } from '../support/fixtures.ts';
import { generatePieces } from '../../src/lib/generator.ts';
import { claimPiece, GENERIC_CLAIM_FAILURE, RATE_LIMITED_FAILURE } from '../../src/lib/db/claim.ts';
import { checkClaimRateLimit } from '../../src/lib/db/rate-limit.ts';
import { generateClaimCode } from '../../src/lib/codes/mint.ts';
import { hashPassword } from '../../src/lib/auth/password.ts';

// CLAUDE.md: "Rate limit per IP with progressive lockout."
//
// This was recorded but never enforced. It matters more than it looks: the
// case for shortening the claim code to nine characters rested on guessing
// being impossible under a rate limit, so until this existed that argument
// was not actually true.

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

async function makeCollector(handle: string) {
  const user = await prisma.user.create({
    data: {
      email: handle + '@test.invalid',
      handle,
      passwordHash: await hashPassword('a-real-password-99'),
    },
  });
  return prisma.collectorId.create({
    data: { userId: user.id, displayName: handle.toUpperCase() },
  });
}

async function seedPieces(batchCode: string, quantity = 3) {
  const { batch } = await seedProductAndBatch(prisma, { batchCode, quantity });
  return generatePieces({
    prisma,
    batchCode: batch.code,
    quantity,
    pepper: TEST_PEPPER,
    producedAt: new Date('2026-02-01'),
    country: 'MX',
  });
}

/** Write n failed attempts directly, so tests do not take a minute each. */
async function seedFailures(
  ip: string,
  qrToken: string,
  count: number,
  ageMs = 0,
): Promise<void> {
  const at = new Date(Date.now() - ageMs);
  await prisma.claimAttempt.createMany({
    data: Array.from({ length: count }, () => ({ ip, qrToken, succeeded: false, at })),
  });
}

describe('the limiter itself', () => {
  it('allows a caller with no history', async () => {
    expect(await checkClaimRateLimit(prisma, '203.0.113.1', 'AAAAAAAAAAAA')).toEqual({
      allowed: true,
    });
  });

  it('allows a few failures, because honest mistakes happen', async () => {
    await seedFailures('203.0.113.2', 'AAAAAAAAAAAA', 4);
    expect((await checkClaimRateLimit(prisma, '203.0.113.2', 'AAAAAAAAAAAA')).allowed).toBe(true);
  });

  it('locks out after five failures from one address', async () => {
    await seedFailures('203.0.113.3', 'AAAAAAAAAAAA', 5);
    const decision = await checkClaimRateLimit(prisma, '203.0.113.3', 'AAAAAAAAAAAA');
    expect(decision.allowed).toBe(false);
    expect(decision.scope).toBe('ip');
    expect(decision.retryAfterSeconds).toBeGreaterThan(0);
    expect(decision.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it('lengthens the lockout as failures accumulate', async () => {
    const wait = async (ip: string, n: number) => {
      await seedFailures(ip, 'AAAAAAAAAAAA', n);
      const d = await checkClaimRateLimit(prisma, ip, 'BBBBBBBBBBBB');
      return d.retryAfterSeconds ?? 0;
    };

    // Separate addresses so each ladder step is measured independently.
    const five = await wait('198.51.100.1', 5);
    const ten = await wait('198.51.100.2', 10);
    const twenty = await wait('198.51.100.3', 20);
    const forty = await wait('198.51.100.4', 40);

    expect(five).toBeLessThan(ten);
    expect(ten).toBeLessThan(twenty);
    expect(twenty).toBeLessThan(forty);
    expect(forty).toBeGreaterThan(60 * 60); // over an hour at the top of the ladder
  });

  it('releases the caller once the lockout has elapsed', async () => {
    // Five failures earns a one-minute pause. Age them past it.
    await seedFailures('203.0.113.4', 'AAAAAAAAAAAA', 5, 90_000);
    expect((await checkClaimRateLimit(prisma, '203.0.113.4', 'AAAAAAAAAAAA')).allowed).toBe(true);
  });

  it('ignores failures older than the counting window', async () => {
    await seedFailures('203.0.113.5', 'AAAAAAAAAAAA', 50, 2 * 60 * 60 * 1000);
    expect((await checkClaimRateLimit(prisma, '203.0.113.5', 'AAAAAAAAAAAA')).allowed).toBe(true);
  });

  it('never counts successful claims against anyone', async () => {
    await prisma.claimAttempt.createMany({
      data: Array.from({ length: 50 }, () => ({
        ip: '203.0.113.6',
        qrToken: 'AAAAAAAAAAAA',
        succeeded: true,
      })),
    });
    expect((await checkClaimRateLimit(prisma, '203.0.113.6', 'AAAAAAAAAAAA')).allowed).toBe(true);
  });

  it('keeps addresses independent', async () => {
    await seedFailures('203.0.113.7', 'AAAAAAAAAAAA', 40);
    expect((await checkClaimRateLimit(prisma, '203.0.113.7', 'BBBBBBBBBBBB')).allowed).toBe(false);
    expect((await checkClaimRateLimit(prisma, '203.0.113.8', 'BBBBBBBBBBBB')).allowed).toBe(true);
  });

  it('protects a single piece from a DISTRIBUTED attack', async () => {
    // Eight different addresses, one failure each. No IP limit is anywhere
    // near tripping, and an IP-only limiter would wave this straight through.
    for (let i = 0; i < 8; i++) {
      await seedFailures(`192.0.2.${i}`, 'TARGETTOKEN1', 1);
    }

    const fresh = await checkClaimRateLimit(prisma, '192.0.2.200', 'TARGETTOKEN1');
    expect(fresh.allowed).toBe(false);
    expect(fresh.scope).toBe('piece');

    // A different piece from the same new address is unaffected.
    expect((await checkClaimRateLimit(prisma, '192.0.2.200', 'OTHERTOKEN12')).allowed).toBe(true);
  });
});

describe('the claim path enforces it', () => {
  it('blocks a real claim once the caller is locked out, even with the RIGHT code', async () => {
    const pieces = await seedPieces('B-RL-01');
    const collector = await makeCollector('locked');
    const ip = '203.0.113.20';

    await seedFailures(ip, 'SOMEOTHERTOK', 12);

    // The correct code for the correct piece. It must still be refused, or the
    // lockout is decorative.
    const result = await claimPiece(prisma, {
      qrToken: pieces[0]!.qrToken,
      submittedCode: pieces[0]!.claimCode,
      collectorId: collector.id,
      pepper: TEST_PEPPER,
      ip,
    });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ message: RATE_LIMITED_FAILURE });
    expect(await prisma.piece.count({ where: { status: 'CLAIMED' } })).toBe(0);
    expect(await prisma.ownershipEvent.count()).toBe(0);
  });

  it('does not record a blocked attempt, so knocking cannot extend the lockout', async () => {
    const pieces = await seedPieces('B-RL-02');
    const collector = await makeCollector('knocker');
    const ip = '203.0.113.21';

    await seedFailures(ip, 'SOMEOTHERTOK', 12);
    const before = await prisma.claimAttempt.count();

    for (let i = 0; i < 5; i++) {
      await claimPiece(prisma, {
        qrToken: pieces[0]!.qrToken,
        submittedCode: generateClaimCode(),
        collectorId: collector.id,
        pepper: TEST_PEPPER,
        ip,
      });
    }

    // Otherwise an attacker extends their own sentence forever, and worse, a
    // third party could lock a piece out from its real owner indefinitely.
    expect(await prisma.claimAttempt.count()).toBe(before);
  });

  it('reports the per-IP wait but stays silent about a per-PIECE lockout', async () => {
    const pieces = await seedPieces('B-RL-03');
    const collector = await makeCollector('quiet');

    // Piece under distributed attack from other people.
    for (let i = 0; i < 8; i++) {
      await seedFailures(`192.0.2.${100 + i}`, pieces[0]!.qrToken, 1);
    }

    const result = await claimPiece(prisma, {
      qrToken: pieces[0]!.qrToken,
      submittedCode: generateClaimCode(),
      collectorId: collector.id,
      pepper: TEST_PEPPER,
      ip: '203.0.113.30',
    });

    // Generic, because saying "too many attempts" here would tell an attacker
    // which pieces are already being worked on.
    expect(result).toEqual({ ok: false, message: GENERIC_CLAIM_FAILURE });
  });

  it('lets an honest collector through on a clean address', async () => {
    const pieces = await seedPieces('B-RL-04');
    const collector = await makeCollector('honest');

    // Four honest misses, still under the threshold.
    for (let i = 0; i < 4; i++) {
      await claimPiece(prisma, {
        qrToken: pieces[0]!.qrToken,
        submittedCode: generateClaimCode(),
        collectorId: collector.id,
        pepper: TEST_PEPPER,
        ip: '203.0.113.40',
      });
    }

    const result = await claimPiece(prisma, {
      qrToken: pieces[0]!.qrToken,
      submittedCode: pieces[0]!.claimCode,
      collectorId: collector.id,
      pepper: TEST_PEPPER,
      ip: '203.0.113.40',
    });

    expect(result.ok).toBe(true);
  });

  it('a malformed code still costs nothing, before or after the limit', async () => {
    const pieces = await seedPieces('B-RL-05');
    const collector = await makeCollector('typist');
    const before = await prisma.claimAttempt.count();

    // Fails the check character, so it never reaches the limiter or the table.
    for (let i = 0; i < 30; i++) {
      await claimPiece(prisma, {
        qrToken: pieces[0]!.qrToken,
        submittedCode: 'AAA-AAA-AAA',
        collectorId: collector.id,
        pepper: TEST_PEPPER,
        ip: '203.0.113.50',
      });
    }

    expect(await prisma.claimAttempt.count()).toBe(before);
    // And the collector can still claim afterwards.
    const result = await claimPiece(prisma, {
      qrToken: pieces[0]!.qrToken,
      submittedCode: pieces[0]!.claimCode,
      collectorId: collector.id,
      pepper: TEST_PEPPER,
      ip: '203.0.113.50',
    });
    expect(result.ok).toBe(true);
  });

  it('the staging rehearsal is exempt, and only it', async () => {
    const pieces = await seedPieces('B-RL-06', 3);
    const collector = await makeCollector('rehearsal');

    await seedFailures('127.0.0.1', 'SOMEOTHERTOK', 60);

    // Without the exemption the generator would rate limit its own
    // verification pass and refuse to ship a perfectly good batch.
    for (const piece of pieces) {
      const result = await claimPiece(prisma, {
        qrToken: piece.qrToken,
        submittedCode: piece.claimCode,
        collectorId: collector.id,
        pepper: TEST_PEPPER,
        ip: '127.0.0.1',
        skipRateLimit: true,
      });
      expect(result.ok).toBe(true);
    }
    expect(await prisma.ownershipEvent.count()).toBe(3);
  });
});
