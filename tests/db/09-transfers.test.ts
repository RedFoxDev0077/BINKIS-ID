import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { testClient, reset, seedProductAndBatch, TEST_PEPPER } from '../support/fixtures.ts';
import { generatePieces } from '../../src/lib/generator.ts';
import { claimPiece } from '../../src/lib/db/claim.ts';
import { getPassportByToken } from '../../src/lib/passport.ts';
import { hashPassword } from '../../src/lib/auth/password.ts';
import {
  initiateTransfer,
  acceptTransfer,
  respondDecline,
  cancelTransfer,
  claimPendingTransfersForEmail,
  currentOwnerId,
  expireStaleTransfers,
} from '../../src/lib/db/transfer.ts';

// "The owner may change, but the physical BINKI keeps the same identity,
// Passport and history forever."
//
// Everything here exists to prove that sentence literally: that a transfer
// APPENDS and never overwrites, that a piece can only be in flight once, and
// that two people accepting at the same instant cannot both become the owner.

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
  const collector = await prisma.collectorId.create({
    data: { userId: user.id, displayName: handle.toUpperCase() },
  });
  return { user, collector };
}

/** A piece already claimed by `owner`. */
async function ownedPiece(batchCode: string, ownerCollectorId: string) {
  const { batch } = await seedProductAndBatch(prisma, { batchCode, quantity: 2 });
  const pieces = await generatePieces({
    prisma,
    batchCode: batch.code,
    quantity: 2,
    pepper: TEST_PEPPER,
    producedAt: new Date('2026-02-01'),
    country: 'MX',
  });
  const claimed = await claimPiece(prisma, {
    qrToken: pieces[0]!.qrToken,
    submittedCode: pieces[0]!.claimCode,
    collectorId: ownerCollectorId,
    pepper: TEST_PEPPER,
    ip: '203.0.113.1',
  });
  expect(claimed.ok).toBe(true);
  return pieces;
}

describe('initiating a transfer', () => {
  it('is refused to anyone who is not the current owner', async () => {
    const { collector: owner } = await makeCollector('owner');
    const { collector: stranger } = await makeCollector('stranger');
    const pieces = await ownedPiece('B-T-01', owner.id);

    const result = await initiateTransfer(prisma, {
      pieceSerial: pieces[0]!.serial,
      fromCollectorId: stranger.id,
      recipient: 'owner',
    });
    expect(result).toEqual({ ok: false, reason: 'not_owner' });
    expect(await prisma.transfer.count()).toBe(0);
  });

  it('is refused for an unclaimed piece', async () => {
    const { collector: owner } = await makeCollector('owner2');
    const pieces = await ownedPiece('B-T-02', owner.id);

    // pieces[1] was generated but never claimed.
    const result = await initiateTransfer(prisma, {
      pieceSerial: pieces[1]!.serial,
      fromCollectorId: owner.id,
      recipient: 'owner2',
    });
    expect(result).toEqual({ ok: false, reason: 'piece_not_transferable' });
  });

  it('is refused to yourself', async () => {
    const { collector: owner } = await makeCollector('selfsend');
    const pieces = await ownedPiece('B-T-03', owner.id);

    const result = await initiateTransfer(prisma, {
      pieceSerial: pieces[0]!.serial,
      fromCollectorId: owner.id,
      recipient: 'selfsend',
    });
    expect(result).toEqual({ ok: false, reason: 'to_self' });
  });

  it('rejects an unknown handle but accepts an unknown email', async () => {
    const { collector: owner } = await makeCollector('sender');
    const pieces = await ownedPiece('B-T-04', owner.id);

    const byHandle = await initiateTransfer(prisma, {
      pieceSerial: pieces[0]!.serial,
      fromCollectorId: owner.id,
      recipient: 'nobody-with-this-handle',
    });
    expect(byHandle).toEqual({ ok: false, reason: 'recipient_unknown' });

    // An email with no account is legitimate: CLAUDE.md requires the transfer
    // to wait for them to register.
    const byEmail = await initiateTransfer(prisma, {
      pieceSerial: pieces[0]!.serial,
      fromCollectorId: owner.id,
      recipient: 'future.collector@example.com',
    });
    expect(byEmail.ok).toBe(true);
  });

  it('allows only ONE transfer in flight per piece, enforced by the database', async () => {
    const { collector: owner } = await makeCollector('once');
    await makeCollector('recipient-a');
    await makeCollector('recipient-b');
    const pieces = await ownedPiece('B-T-05', owner.id);

    const first = await initiateTransfer(prisma, {
      pieceSerial: pieces[0]!.serial,
      fromCollectorId: owner.id,
      recipient: 'recipient-a',
    });
    expect(first.ok).toBe(true);

    const second = await initiateTransfer(prisma, {
      pieceSerial: pieces[0]!.serial,
      fromCollectorId: owner.id,
      recipient: 'recipient-b',
    });
    // Without the partial unique index, two people would each be told the
    // piece is coming to them.
    expect(second).toEqual({ ok: false, reason: 'already_pending' });
    expect(await prisma.transfer.count({ where: { status: 'PENDING' } })).toBe(1);
  });

  it('changes nothing about ownership until it is accepted', async () => {
    const { collector: owner } = await makeCollector('holder');
    const { collector: receiver } = await makeCollector('waiting');
    const pieces = await ownedPiece('B-T-06', owner.id);

    await initiateTransfer(prisma, {
      pieceSerial: pieces[0]!.serial,
      fromCollectorId: owner.id,
      recipient: 'waiting',
    });

    const piece = await prisma.piece.findUniqueOrThrow({ where: { serial: pieces[0]!.serial } });
    expect(await currentOwnerId(prisma, piece.id)).toBe(owner.id);
    expect(await prisma.ownershipEvent.count({ where: { pieceId: piece.id } })).toBe(1);
    expect(receiver.id).not.toBe(owner.id);
  });
});

describe('accepting a transfer', () => {
  it('appends a new ownership row and leaves the old one untouched', async () => {
    const { collector: owner } = await makeCollector('first-owner');
    const { collector: receiver } = await makeCollector('second-owner');
    const pieces = await ownedPiece('B-T-07', owner.id);
    const piece = await prisma.piece.findUniqueOrThrow({ where: { serial: pieces[0]!.serial } });

    const before = await prisma.ownershipEvent.findMany({ where: { pieceId: piece.id } });

    const initiated = await initiateTransfer(prisma, {
      pieceSerial: pieces[0]!.serial,
      fromCollectorId: owner.id,
      recipient: 'second-owner',
    });
    expect(initiated.ok).toBe(true);

    const accepted = await acceptTransfer(
      prisma,
      (initiated as { ok: true; value: { transferId: string } }).value.transferId,
      receiver.id,
    );
    expect(accepted.ok).toBe(true);

    const after = await prisma.ownershipEvent.findMany({
      where: { pieceId: piece.id },
      orderBy: { seq: 'asc' },
    });

    expect(after).toHaveLength(2);
    // The original row is byte-for-byte what it was. Append only.
    expect(after[0]).toEqual(before[0]);
    expect(after[1]!.seq).toBe(2);
    expect(after[1]!.fromCollectorId).toBe(owner.id);
    expect(after[1]!.toCollectorId).toBe(receiver.id);
    expect(after[1]!.acquiredVia).toBe('TRANSFER');

    expect(await currentOwnerId(prisma, piece.id)).toBe(receiver.id);
  });

  it('writes a TRANSFERRED passport event and keeps the whole history public', async () => {
    const { collector: owner } = await makeCollector('hist-a');
    const { collector: receiver } = await makeCollector('hist-b');
    const pieces = await ownedPiece('B-T-08', owner.id);

    const initiated = await initiateTransfer(prisma, {
      pieceSerial: pieces[0]!.serial,
      fromCollectorId: owner.id,
      recipient: 'hist-b',
    });
    await acceptTransfer(
      prisma,
      (initiated as { ok: true; value: { transferId: string } }).value.transferId,
      receiver.id,
    );

    const passport = await getPassportByToken(pieces[0]!.qrToken, prisma);
    expect(passport!.owner!.handle).toBe('hist-b');

    const types = passport!.events.map((e) => e.type);
    expect(types).toContain('CLAIMED');
    expect(types).toContain('TRANSFERRED');
    // Sequence numbers stay contiguous and ordered.
    expect(passport!.events.map((e) => e.seq)).toEqual(
      passport!.events.map((_, i) => i + 1),
    );
  });

  it('is refused to anyone it was not sent to', async () => {
    const { collector: owner } = await makeCollector('sender-x');
    await makeCollector('intended');
    const { collector: interloper } = await makeCollector('interloper');
    const pieces = await ownedPiece('B-T-09', owner.id);

    const initiated = await initiateTransfer(prisma, {
      pieceSerial: pieces[0]!.serial,
      fromCollectorId: owner.id,
      recipient: 'intended',
    });
    const result = await acceptTransfer(
      prisma,
      (initiated as { ok: true; value: { transferId: string } }).value.transferId,
      interloper.id,
    );
    expect(result).toEqual({ ok: false, reason: 'not_yours_to_accept' });
    expect(await prisma.ownershipEvent.count()).toBe(1);
  });

  it('produces exactly one winner when accepted twice at the same instant', async () => {
    const { collector: owner } = await makeCollector('race-owner');
    const { collector: receiver } = await makeCollector('race-receiver');
    const pieces = await ownedPiece('B-T-10', owner.id);

    const initiated = await initiateTransfer(prisma, {
      pieceSerial: pieces[0]!.serial,
      fromCollectorId: owner.id,
      recipient: 'race-receiver',
    });
    const transferId = (initiated as { ok: true; value: { transferId: string } }).value.transferId;

    const clientA = testClient('main', 4);
    const clientB = testClient('main', 4);
    try {
      await clientA.$connect();
      await clientB.$connect();

      let open = () => {};
      const gate = new Promise<void>((r) => {
        open = r;
      });
      const both = [clientA, clientB].map((client) =>
        gate.then(() => acceptTransfer(client, transferId, receiver.id)),
      );
      open();
      const results = await Promise.all(both);

      expect(results.filter((r) => r.ok)).toHaveLength(1);
    } finally {
      await clientA.$disconnect();
      await clientB.$disconnect();
    }

    // The thing that must never happen: two ownership rows for one transfer.
    expect(await prisma.ownershipEvent.count()).toBe(2); // the claim, plus one transfer
    expect(await prisma.passportEvent.count({ where: { type: 'TRANSFERRED' } })).toBe(1);
  }, 120_000);

  it('is refused once expired, and a sweep closes stale ones', async () => {
    const { collector: owner } = await makeCollector('slow-owner');
    const { collector: receiver } = await makeCollector('slow-receiver');
    const pieces = await ownedPiece('B-T-11', owner.id);

    const initiated = await initiateTransfer(prisma, {
      pieceSerial: pieces[0]!.serial,
      fromCollectorId: owner.id,
      recipient: 'slow-receiver',
    });
    const transferId = (initiated as { ok: true; value: { transferId: string } }).value.transferId;

    await prisma.transfer.update({
      where: { id: transferId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect(await acceptTransfer(prisma, transferId, receiver.id)).toEqual({
      ok: false,
      reason: 'expired',
    });

    expect(await expireStaleTransfers(prisma)).toBe(1);
    expect(await prisma.transfer.count({ where: { status: 'EXPIRED' } })).toBe(1);
    // And the piece is transferable again.
    expect(await prisma.transfer.count({ where: { status: 'PENDING' } })).toBe(0);
  });
});

describe('declining and cancelling', () => {
  it('lets the receiver decline, freeing the piece', async () => {
    const { collector: owner } = await makeCollector('dec-owner');
    const { collector: receiver } = await makeCollector('dec-receiver');
    const pieces = await ownedPiece('B-T-12', owner.id);

    const initiated = await initiateTransfer(prisma, {
      pieceSerial: pieces[0]!.serial,
      fromCollectorId: owner.id,
      recipient: 'dec-receiver',
    });
    const transferId = (initiated as { ok: true; value: { transferId: string } }).value.transferId;

    expect(await respondDecline(prisma, transferId, receiver.id)).toEqual({ ok: true, value: null });
    expect(await prisma.ownershipEvent.count()).toBe(1);

    // A declined transfer does not block a new one.
    const again = await initiateTransfer(prisma, {
      pieceSerial: pieces[0]!.serial,
      fromCollectorId: owner.id,
      recipient: 'dec-receiver',
    });
    expect(again.ok).toBe(true);
  });

  it('lets the sender cancel, and nobody else', async () => {
    const { collector: owner } = await makeCollector('can-owner');
    const { collector: receiver } = await makeCollector('can-receiver');
    const pieces = await ownedPiece('B-T-13', owner.id);

    const initiated = await initiateTransfer(prisma, {
      pieceSerial: pieces[0]!.serial,
      fromCollectorId: owner.id,
      recipient: 'can-receiver',
    });
    const transferId = (initiated as { ok: true; value: { transferId: string } }).value.transferId;

    expect(await cancelTransfer(prisma, transferId, receiver.id)).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(await cancelTransfer(prisma, transferId, owner.id)).toEqual({ ok: true, value: null });
  });
});

describe('transfer to someone with no account yet', () => {
  it('stays pending and attaches to the account on signup', async () => {
    const { collector: owner } = await makeCollector('inviter');
    const pieces = await ownedPiece('B-T-14', owner.id);
    const email = 'newcomer@example.com';

    const initiated = await initiateTransfer(prisma, {
      pieceSerial: pieces[0]!.serial,
      fromCollectorId: owner.id,
      recipient: email,
    });
    expect(initiated.ok).toBe(true);

    const pending = await prisma.transfer.findFirstOrThrow({ where: { status: 'PENDING' } });
    expect(pending.toCollectorId).toBeNull();
    expect(pending.toEmail).toBe(email);

    // They register. This mirrors what the signup action does inside its
    // own transaction.
    const user = await prisma.user.create({
      data: { email, handle: 'newcomer', passwordHash: await hashPassword('a-real-password-99') },
    });
    const collector = await prisma.collectorId.create({
      data: { userId: user.id, displayName: 'Newcomer' },
    });
    const attached = await claimPendingTransfersForEmail(prisma, email, collector.id);
    expect(attached).toBe(1);

    // And now they can accept it.
    const accepted = await acceptTransfer(prisma, pending.id, collector.id);
    expect(accepted.ok).toBe(true);

    const passport = await getPassportByToken(pieces[0]!.qrToken, prisma);
    expect(passport!.owner!.handle).toBe('newcomer');
  });

  it('matches the email case-insensitively', async () => {
    const { collector: owner } = await makeCollector('case-inviter');
    const pieces = await ownedPiece('B-T-15', owner.id);

    await initiateTransfer(prisma, {
      pieceSerial: pieces[0]!.serial,
      fromCollectorId: owner.id,
      recipient: 'MiXeD.Case@Example.COM',
    });

    const user = await prisma.user.create({
      data: {
        email: 'mixed.case@example.com',
        handle: 'mixedcase',
        passwordHash: await hashPassword('a-real-password-99'),
      },
    });
    const collector = await prisma.collectorId.create({
      data: { userId: user.id, displayName: 'Mixed' },
    });

    expect(await claimPendingTransfersForEmail(prisma, user.email, collector.id)).toBe(1);
  });
});

describe('the ledger survives a chain of owners', () => {
  it('keeps every previous owner after three transfers', async () => {
    const { collector: a } = await makeCollector('owner-a');
    const { collector: b } = await makeCollector('owner-b');
    const { collector: c } = await makeCollector('owner-c');
    const { collector: d } = await makeCollector('owner-d');
    const pieces = await ownedPiece('B-T-16', a.id);
    const piece = await prisma.piece.findUniqueOrThrow({ where: { serial: pieces[0]!.serial } });

    for (const [from, to, handle] of [
      [a, b, 'owner-b'],
      [b, c, 'owner-c'],
      [c, d, 'owner-d'],
    ] as const) {
      const initiated = await initiateTransfer(prisma, {
        pieceSerial: pieces[0]!.serial,
        fromCollectorId: from.id,
        recipient: handle,
      });
      expect(initiated.ok).toBe(true);
      const accepted = await acceptTransfer(
        prisma,
        (initiated as { ok: true; value: { transferId: string } }).value.transferId,
        to.id,
      );
      expect(accepted.ok).toBe(true);
    }

    const ledger = await prisma.ownershipEvent.findMany({
      where: { pieceId: piece.id },
      orderBy: { seq: 'asc' },
    });

    expect(ledger).toHaveLength(4);
    expect(ledger.map((row) => row.seq)).toEqual([1, 2, 3, 4]);
    expect(ledger.map((row) => row.toCollectorId)).toEqual([a.id, b.id, c.id, d.id]);
    expect(ledger[0]!.acquiredVia).toBe('CLAIM');
    expect(ledger.slice(1).every((row) => row.acquiredVia === 'TRANSFER')).toBe(true);

    // The identity never moved.
    const passport = await getPassportByToken(pieces[0]!.qrToken, prisma);
    expect(passport!.serial).toBe(pieces[0]!.serial);
    expect(passport!.owner!.handle).toBe('owner-d');
  }, 120_000);
});
