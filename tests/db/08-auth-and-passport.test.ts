import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { testClient, reset, seedProductAndBatch, TEST_PEPPER } from '../support/fixtures.ts';
import { generatePieces } from '../../src/lib/generator.ts';
import { claimPiece } from '../../src/lib/db/claim.ts';
import { getPassportByToken } from '../../src/lib/passport.ts';
import { hashPassword, verifyPassword } from '../../src/lib/auth/password.ts';
import {
  createSession,
  validateSessionToken,
  invalidateSession,
  invalidateAllSessions,
} from '../../src/lib/auth/session.ts';

// Credentials and ownership. Both are places where a quiet mistake is only
// ever discovered by someone exploiting it.

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

async function makeCollector(handle: string, password = 'a-real-password-99') {
  const user = await prisma.user.create({
    data: {
      email: handle + '@test.invalid',
      handle,
      passwordHash: await hashPassword(password),
    },
  });
  const collector = await prisma.collectorId.create({
    data: { userId: user.id, displayName: handle.toUpperCase() },
  });
  return { user, collector };
}

async function seedPieces(batchCode: string, quantity: number) {
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

describe('passwords', () => {
  it('stores argon2id, never the password', async () => {
    const hash = await hashPassword('correct-horse-battery');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(hash).not.toContain('correct-horse-battery');
    // OWASP parameters, pinned so a later edit cannot silently weaken them.
    expect(hash).toContain('m=19456,t=3,p=1');
  });

  it('produces a different hash for the same password every time', async () => {
    const a = await hashPassword('the-same-password-x');
    const b = await hashPassword('the-same-password-x');
    expect(a).not.toBe(b); // per-hash salt
    expect(await verifyPassword(a, 'the-same-password-x')).toBe(true);
    expect(await verifyPassword(b, 'the-same-password-x')).toBe(true);
  });

  it('rejects the wrong password and refuses a short one', async () => {
    const hash = await hashPassword('a-real-password-99');
    expect(await verifyPassword(hash, 'a-real-password-98')).toBe(false);
    expect(await verifyPassword(hash, '')).toBe(false);
    await expect(hashPassword('short')).rejects.toThrow();
  });

  it('returns false rather than throwing on a corrupt stored hash', async () => {
    // A corrupt row must be a failed login, not a 500 that confirms the
    // account exists.
    expect(await verifyPassword('not-a-hash', 'anything')).toBe(false);
  });
});

describe('sessions', () => {
  it('never stores the token the browser holds', async () => {
    const { user } = await makeCollector('tokenholder');
    const { token } = await createSession(prisma, user.id);

    const rows = await prisma.session.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).not.toBe(token);
    expect(JSON.stringify(rows)).not.toContain(token);
    // What is stored is the SHA-256 of the token, so a database dump yields
    // no usable sessions.
    expect(rows[0]!.id).toMatch(/^[0-9a-f]{64}$/);
  });

  it('validates a live token and resolves the collector', async () => {
    const { user, collector } = await makeCollector('valid');
    const { token } = await createSession(prisma, user.id);

    const result = await validateSessionToken(prisma, token);
    expect(result.user).not.toBeNull();
    expect(result.user!.handle).toBe('valid');
    expect(result.user!.collectorId).toBe(collector.id);
  });

  it('rejects an unknown, empty or tampered token', async () => {
    const { user } = await makeCollector('tamper');
    const { token } = await createSession(prisma, user.id);

    expect((await validateSessionToken(prisma, '')).user).toBeNull();
    expect((await validateSessionToken(prisma, 'nonsense')).user).toBeNull();
    expect((await validateSessionToken(prisma, token.slice(0, -1) + 'A')).user).toBeNull();
  });

  it('rejects an expired session and deletes it on sight', async () => {
    const { user } = await makeCollector('expired');
    const { token, session } = await createSession(prisma, user.id);
    await prisma.session.update({
      where: { id: session.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect((await validateSessionToken(prisma, token)).user).toBeNull();
    // Not merely rejected, removed, so the table cannot accumulate
    // credentials that still look valid.
    expect(await prisma.session.count()).toBe(0);
  });

  it('revokes immediately, which is the whole reason for not using JWTs', async () => {
    const { user } = await makeCollector('revoked');
    const { token, session } = await createSession(prisma, user.id);
    expect((await validateSessionToken(prisma, token)).user).not.toBeNull();

    await invalidateSession(prisma, session.id);
    expect((await validateSessionToken(prisma, token)).user).toBeNull();
  });

  it('logs out everywhere', async () => {
    const { user } = await makeCollector('everywhere');
    const tokens: string[] = [];
    for (let i = 0; i < 3; i++) {
      tokens.push((await createSession(prisma, user.id)).token);
    }
    await invalidateAllSessions(prisma, user.id);
    for (const token of tokens) {
      expect((await validateSessionToken(prisma, token)).user).toBeNull();
    }
  });

  it('deletes sessions when the user is deleted, leaving no orphans', async () => {
    const { user } = await makeCollector('cascade');
    await createSession(prisma, user.id);
    await prisma.collectorId.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
    expect(await prisma.session.count()).toBe(0);
  });
});

describe('the public passport never exposes a person or an internal id', () => {
  it('carries a handle and a display name, and nothing else about the owner', async () => {
    const pieces = await seedPieces('B-PRIV-01', 2);
    const { collector } = await makeCollector('privacy');

    const claimed = await claimPiece(prisma, {
      qrToken: pieces[0]!.qrToken,
      submittedCode: pieces[0]!.claimCode,
      collectorId: collector.id,
      pepper: TEST_PEPPER,
      ip: '198.51.100.4',
    });
    expect(claimed.ok).toBe(true);

    const passport = await getPassportByToken(pieces[0]!.qrToken, prisma);
    expect(passport).not.toBeNull();

    const serialised = JSON.stringify(passport);
    expect(serialised).not.toContain('privacy@test.invalid');
    expect(serialised).not.toContain(pieces[0]!.claimHash);
    expect(serialised).not.toContain(pieces[0]!.claimCode);
    // Non-negotiable 6: the internal id never leaves the database.
    expect(serialised).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/,
    );

    expect(passport!.owner).toEqual({ handle: 'privacy', displayName: 'PRIVACY' });
  });

  it('shows no owner at all for an unclaimed piece', async () => {
    const pieces = await seedPieces('B-PRIV-02', 1);
    const passport = await getPassportByToken(pieces[0]!.qrToken, prisma);
    expect(passport!.owner).toBeNull();
    expect(passport!.status).toBe('UNCLAIMED');
  });

  it('falls back to the handle when a collector hides their profile', async () => {
    const pieces = await seedPieces('B-PRIV-03', 1);
    const { collector } = await makeCollector('shy');

    await prisma.collectorId.update({
      where: { id: collector.id },
      data: { publicProfile: false, displayName: 'A Real Human Name' },
    });
    await claimPiece(prisma, {
      qrToken: pieces[0]!.qrToken,
      submittedCode: pieces[0]!.claimCode,
      collectorId: collector.id,
      pepper: TEST_PEPPER,
      ip: '198.51.100.5',
    });

    const passport = await getPassportByToken(pieces[0]!.qrToken, prisma);
    // Still owned, but the chosen display name is withheld.
    expect(passport!.owner!.displayName).toBe('shy');
    expect(JSON.stringify(passport)).not.toContain('A Real Human Name');
  });

  it('derives the owner from the ledger, not from a column on the piece', async () => {
    const pieces = await seedPieces('B-PRIV-04', 1);
    const { collector: first } = await makeCollector('firstowner');
    const { collector: second } = await makeCollector('secondowner');

    await claimPiece(prisma, {
      qrToken: pieces[0]!.qrToken,
      submittedCode: pieces[0]!.claimCode,
      collectorId: first.id,
      pepper: TEST_PEPPER,
      ip: '198.51.100.6',
    });

    const piece = await prisma.piece.findUniqueOrThrow({
      where: { qrToken: pieces[0]!.qrToken },
    });

    // Append a transfer. Nothing is overwritten; the passport must follow the
    // latest row rather than any stored owner field.
    await prisma.ownershipEvent.create({
      data: {
        pieceId: piece.id,
        seq: 2,
        fromCollectorId: first.id,
        toCollectorId: second.id,
        acquiredVia: 'TRANSFER',
      },
    });

    const passport = await getPassportByToken(pieces[0]!.qrToken, prisma);
    expect(passport!.owner!.handle).toBe('secondowner');
    // And the first owner is still in the ledger, permanently.
    expect(await prisma.ownershipEvent.count({ where: { pieceId: piece.id } })).toBe(2);
  });

  it('returns null for a malformed or unknown token rather than throwing', async () => {
    expect(await getPassportByToken("ZZZZZZZZZZZZ", prisma)).toBeNull();
    expect(await getPassportByToken("too-short", prisma)).toBeNull();
    expect(await getPassportByToken("AAAAAAAAAAA0", prisma)).toBeNull();
  });
});
