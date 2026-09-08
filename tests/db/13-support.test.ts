import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { testClient, reset, seedProductAndBatch, TEST_PEPPER } from '../support/fixtures.ts';
import { generatePieces } from '../../src/lib/generator.ts';
import { claimPiece } from '../../src/lib/db/claim.ts';
import { generateClaimCode } from '../../src/lib/codes/mint.ts';
import { hashPassword } from '../../src/lib/auth/password.ts';
import { diagnose, findPieceFor } from '../../src/lib/db/support.ts';

/**
 * The support diagnosis.
 *
 * The claim endpoint is deliberately not an oracle: wrong code, already
 * claimed and code-for-another-piece all return one identical failure, so the
 * public surface cannot be used to enumerate codes. That is right, and it is
 * also why support could not answer "my code does not work" without reading
 * three tables by hand.
 *
 * This is the one place the real reason is surfaced, behind the admin role.
 * These tests exist to prove it says the true thing in each case, because a
 * confident wrong diagnosis is worse than none.
 */

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
      email: `${handle}@test.invalid`,
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

describe('finding the piece from whatever support was handed', () => {
  it('finds it by serial', async () => {
    const [piece] = await seedPieces('B-SUP-01');
    expect((await findPieceFor(prisma, piece!.serial))?.serial).toBe(piece!.serial);
  });

  it('finds it by QR token', async () => {
    const [piece] = await seedPieces('B-SUP-02');
    expect((await findPieceFor(prisma, piece!.qrToken))?.serial).toBe(piece!.serial);
  });

  it('finds it from a pasted URL, which is what a customer actually sends', async () => {
    const [piece] = await seedPieces('B-SUP-03');
    const url = `https://id.binkis.com/p/${piece!.qrToken}`;
    expect((await findPieceFor(prisma, url))?.serial).toBe(piece!.serial);
  });

  it('tolerates lowercase and surrounding spaces', async () => {
    const [piece] = await seedPieces('B-SUP-04');
    const messy = `  ${piece!.serial.toLowerCase()}  `;
    expect((await findPieceFor(prisma, messy))?.serial).toBe(piece!.serial);
  });

  it('returns null for nonsense rather than guessing', async () => {
    expect(await findPieceFor(prisma, 'hello')).toBeNull();
    expect(await findPieceFor(prisma, '')).toBeNull();
  });
});

describe('the verdict', () => {
  it('says so when nothing matches', async () => {
    const report = await diagnose(prisma, 'SP-999999');
    expect(report.verdict).toBe('not_found');
    expect(report.piece).toBeNull();
  });

  it('an untouched piece reads as fine, with nobody having tried', async () => {
    const [piece] = await seedPieces('B-SUP-10');
    const report = await diagnose(prisma, piece!.serial);
    expect(report.verdict).toBe('unclaimed_no_attempts');
    expect(report.piece?.serial).toBe(piece!.serial);
    expect(report.failuresLastHour).toBe(0);
  });

  it('names the owner when it is already claimed', async () => {
    const [piece] = await seedPieces('B-SUP-11');
    const collector = await makeCollector('owner1');
    const result = await claimPiece(prisma, {
      qrToken: piece!.qrToken,
      submittedCode: piece!.claimCode,
      collectorId: collector.id,
      pepper: TEST_PEPPER,
      ip: '203.0.113.10',
    });
    expect(result.ok).toBe(true);

    const report = await diagnose(prisma, piece!.serial);
    expect(report.verdict).toBe('already_claimed');
    expect(report.owner?.handle).toBe('owner1');
    // The summary has to name the owner, because the support person's next
    // question is always "is that the customer I am talking to?"
    expect(report.summary).toContain('owner1');
  });

  it('distinguishes a typo from a code belonging to another piece', async () => {
    const pieces = await seedPieces('B-SUP-12', 2);
    const collector = await makeCollector('confused');

    // The real code for piece 2, entered against piece 1. This is a person
    // holding two figures and reading the wrong sticker.
    await claimPiece(prisma, {
      qrToken: pieces[0]!.qrToken,
      submittedCode: pieces[1]!.claimCode,
      collectorId: collector.id,
      pepper: TEST_PEPPER,
      ip: '203.0.113.11',
    });

    const report = await diagnose(prisma, pieces[0]!.serial);
    expect(report.verdict).toBe('unclaimed_wrong_code');
    expect(report.failuresLastHour).toBe(1);
    expect(report.summary).toMatch(/different piece/i);
  });

  it('reports a plain wrong code as a typo, not as cross-wiring', async () => {
    const [piece] = await seedPieces('B-SUP-13');
    const collector = await makeCollector('typist');

    await claimPiece(prisma, {
      qrToken: piece!.qrToken,
      submittedCode: generateClaimCode(),
      collectorId: collector.id,
      pepper: TEST_PEPPER,
      ip: '203.0.113.12',
    });

    const report = await diagnose(prisma, piece!.serial);
    expect(report.verdict).toBe('unclaimed_wrong_code');
    expect(report.summary).toMatch(/typo|scratch/i);
    expect(report.summary).not.toMatch(/different piece/i);
  });

  it('tells support the code is fine when the piece is locked out', async () => {
    const [piece] = await seedPieces('B-SUP-14');

    // Eight failures from eight addresses trips the per-piece lockout.
    await prisma.claimAttempt.createMany({
      data: Array.from({ length: 8 }, (_, i) => ({
        ip: `192.0.2.${i}`,
        qrToken: piece!.qrToken,
        succeeded: false,
      })),
    });

    const report = await diagnose(prisma, piece!.serial);
    expect(report.verdict).toBe('rate_limited');
    expect(report.pieceLockedForSeconds).toBeGreaterThan(0);
    // The important half of the sentence: do not send them chasing a new code.
    expect(report.summary).toMatch(/code itself is fine/i);
  });

  it('flags a voided piece as an escalation, not a retry', async () => {
    const [piece] = await seedPieces('B-SUP-15');
    await prisma.piece.update({
      where: { serial: piece!.serial },
      data: { status: 'VOID' },
    });

    const report = await diagnose(prisma, piece!.serial);
    expect(report.verdict).toBe('voided');
    expect(report.summary).toMatch(/escalate/i);
  });

  it('flags a reserved piece as not claimable yet', async () => {
    const [piece] = await seedPieces('B-SUP-16');
    await prisma.piece.update({
      where: { serial: piece!.serial },
      data: { status: 'RESERVED' },
    });

    const report = await diagnose(prisma, piece!.serial);
    expect(report.verdict).toBe('reserved');
  });
});

describe('what the report must not leak', () => {
  it('never returns the internal id or the claim hash', async () => {
    const [piece] = await seedPieces('B-SUP-20');
    const collector = await makeCollector('owner2');
    await claimPiece(prisma, {
      qrToken: piece!.qrToken,
      submittedCode: piece!.claimCode,
      collectorId: collector.id,
      pepper: TEST_PEPPER,
      ip: '203.0.113.20',
    });

    const report = await diagnose(prisma, piece!.serial);
    const serialised = JSON.stringify(report);

    // Non-negotiable 6, and non-negotiable 1. Support is an internal tool, but
    // it is still a place these could escape into a screenshot or a ticket.
    expect(serialised).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
    );
    expect(serialised).not.toContain(piece!.claimHash);
    expect(serialised).not.toContain(piece!.claimCode);
  });

  it('never returns an owner email', async () => {
    const [piece] = await seedPieces('B-SUP-21');
    const collector = await makeCollector('owner3');
    await claimPiece(prisma, {
      qrToken: piece!.qrToken,
      submittedCode: piece!.claimCode,
      collectorId: collector.id,
      pepper: TEST_PEPPER,
      ip: '203.0.113.21',
    });

    const report = await diagnose(prisma, piece!.serial);
    expect(JSON.stringify(report)).not.toContain('@test.invalid');
  });
});
