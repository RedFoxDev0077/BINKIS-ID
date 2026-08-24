import { Prisma, type PrismaClient } from '@prisma/client';

/**
 * Ownership transfer.
 *
 * "The owner may change, but the physical BINKI keeps the same identity,
 * Passport and history forever." That sentence is the whole design:
 *
 *   - A transfer is a REQUEST. Nothing about ownership moves until the
 *     receiver accepts.
 *   - Accepting APPENDS an OwnershipEvent. The previous owner's row is never
 *     touched, so a piece that changes hands five times carries all five.
 *   - A piece may have at most one transfer in flight, enforced by a partial
 *     unique index rather than by checking first.
 *
 * The receiver may not have an account. CLAUDE.md requires the transfer to
 * stay pending and complete on signup, so a transfer can be addressed to a
 * bare email and claimed later by whoever registers it.
 */

export const TRANSFER_EXPIRY_DAYS = 30;

export type TransferFailure =
  | 'not_owner'
  | 'piece_not_transferable'
  | 'already_pending'
  | 'to_self'
  | 'recipient_unknown'
  | 'not_found'
  | 'not_yours_to_accept'
  | 'expired';

export type TransferResult<T> = { ok: true; value: T } | { ok: false; reason: TransferFailure };

/** Who currently owns a piece, according to the ledger. */
export async function currentOwnerId(
  prisma: Prisma.TransactionClient | PrismaClient,
  pieceId: string,
): Promise<string | null> {
  const latest = await prisma.ownershipEvent.findFirst({
    where: { pieceId },
    orderBy: { seq: 'desc' },
    select: { toCollectorId: true },
  });
  return latest?.toCollectorId ?? null;
}

export interface InitiateInput {
  pieceSerial: string;
  fromCollectorId: string;
  /** Either a handle or an email address. Whichever the sender typed. */
  recipient: string;
  message?: string;
}

export async function initiateTransfer(
  prisma: PrismaClient,
  input: InitiateInput,
): Promise<TransferResult<{ transferId: string; pendingForEmail: string | null }>> {
  const piece = await prisma.piece.findUnique({
    where: { serial: input.pieceSerial },
    select: { id: true, status: true },
  });
  if (!piece) return { ok: false, reason: 'not_found' };

  // A voided or unclaimed piece has nothing to transfer.
  if (piece.status !== 'CLAIMED') return { ok: false, reason: 'piece_not_transferable' };

  const owner = await currentOwnerId(prisma, piece.id);
  if (owner !== input.fromCollectorId) return { ok: false, reason: 'not_owner' };

  // Resolve the recipient. An address with no account is legitimate: the
  // transfer waits for them to register.
  const raw = input.recipient.trim().toLowerCase();
  const isEmail = raw.includes('@');

  const recipient = await prisma.user.findFirst({
    where: isEmail ? { email: raw } : { handle: raw },
    select: { collectorId: { select: { id: true } } },
  });

  if (!isEmail && !recipient) return { ok: false, reason: 'recipient_unknown' };
  if (recipient?.collectorId?.id === input.fromCollectorId) {
    return { ok: false, reason: 'to_self' };
  }

  try {
    const transfer = await prisma.transfer.create({
      data: {
        pieceId: piece.id,
        fromCollectorId: input.fromCollectorId,
        toCollectorId: recipient?.collectorId?.id ?? null,
        toEmail: isEmail ? raw : null,
        toHandle: isEmail ? null : raw,
        message: input.message?.slice(0, 500) ?? null,
        expiresAt: new Date(Date.now() + TRANSFER_EXPIRY_DAYS * 86_400_000),
      },
      select: { id: true },
    });

    return {
      ok: true,
      value: {
        transferId: transfer.id,
        pendingForEmail: recipient ? null : (isEmail ? raw : null),
      },
    };
  } catch (error) {
    // The partial unique index caught a second transfer for this piece.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { ok: false, reason: 'already_pending' };
    }
    throw error;
  }
}

/**
 * Accept a transfer.
 *
 * One transaction, one conditional write, exactly like claiming. The UPDATE
 * asserts the transfer is still PENDING; two simultaneous accepts mean one
 * sees count 0 and is rejected. @@unique([pieceId, seq]) is the second line
 * of defence against a duplicate ownership row.
 */
export async function acceptTransfer(
  prisma: PrismaClient,
  transferId: string,
  accepterCollectorId: string,
): Promise<TransferResult<{ serial: string }>> {
  const transfer = await prisma.transfer.findUnique({
    where: { id: transferId },
    select: {
      id: true,
      pieceId: true,
      status: true,
      expiresAt: true,
      toCollectorId: true,
      toEmail: true,
      fromCollectorId: true,
      piece: { select: { serial: true, status: true } },
    },
  });

  if (!transfer || transfer.status !== 'PENDING') return { ok: false, reason: 'not_found' };
  if (transfer.toCollectorId !== accepterCollectorId) {
    return { ok: false, reason: 'not_yours_to_accept' };
  }
  if (transfer.expiresAt.getTime() < Date.now()) return { ok: false, reason: 'expired' };
  if (transfer.piece.status !== 'CLAIMED') {
    return { ok: false, reason: 'piece_not_transferable' };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.transfer.updateMany({
        where: { id: transfer.id, status: 'PENDING' },
        data: { status: 'ACCEPTED', respondedAt: new Date() },
      });
      if (count !== 1) throw new TransferRejected('not_found');

      // The sender must STILL own it at the moment of acceptance. A pending
      // transfer that sat for a week could otherwise move a piece its sender
      // no longer holds.
      const owner = await currentOwnerId(tx, transfer.pieceId);
      if (owner !== transfer.fromCollectorId) throw new TransferRejected('not_owner');

      const lastOwnership = await tx.ownershipEvent.findFirst({
        where: { pieceId: transfer.pieceId },
        orderBy: { seq: 'desc' },
        select: { seq: true },
      });
      const lastPassport = await tx.passportEvent.findFirst({
        where: { pieceId: transfer.pieceId },
        orderBy: { seq: 'desc' },
        select: { seq: true },
      });

      const occurredAt = new Date();

      // APPEND. The previous owner's row is left exactly as it was.
      await tx.ownershipEvent.create({
        data: {
          pieceId: transfer.pieceId,
          seq: (lastOwnership?.seq ?? 0) + 1,
          fromCollectorId: transfer.fromCollectorId,
          toCollectorId: accepterCollectorId,
          acquiredVia: 'TRANSFER',
          occurredAt,
        },
      });

      await tx.passportEvent.create({
        data: {
          pieceId: transfer.pieceId,
          seq: (lastPassport?.seq ?? 0) + 1,
          type: 'TRANSFERRED',
          title: 'Passed to a new collector',
          actor: accepterCollectorId,
          occurredAt,
        },
      });

      await tx.auditLog.create({
        data: {
          actor: accepterCollectorId,
          action: 'TRANSFER_ACCEPTED',
          entity: `piece:${transfer.piece.serial}`,
          before: { owner: transfer.fromCollectorId },
          after: { owner: accepterCollectorId, transferId: transfer.id },
        },
      });
    });
  } catch (error) {
    if (error instanceof TransferRejected) return { ok: false, reason: error.reason };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { ok: false, reason: 'not_found' };
    }
    throw error;
  }

  return { ok: true, value: { serial: transfer.piece.serial } };
}

export async function respondDecline(
  prisma: PrismaClient,
  transferId: string,
  collectorId: string,
): Promise<TransferResult<null>> {
  const { count } = await prisma.transfer.updateMany({
    where: { id: transferId, status: 'PENDING', toCollectorId: collectorId },
    data: { status: 'DECLINED', respondedAt: new Date() },
  });
  return count === 1 ? { ok: true, value: null } : { ok: false, reason: 'not_found' };
}

export async function cancelTransfer(
  prisma: PrismaClient,
  transferId: string,
  fromCollectorId: string,
): Promise<TransferResult<null>> {
  const { count } = await prisma.transfer.updateMany({
    where: { id: transferId, status: 'PENDING', fromCollectorId },
    data: { status: 'CANCELLED', respondedAt: new Date() },
  });
  return count === 1 ? { ok: true, value: null } : { ok: false, reason: 'not_found' };
}

/**
 * Attach transfers addressed to a bare email to the account that just
 * registered it. Called on signup, so an invitation sent before the recipient
 * had an account resolves the moment they create one.
 */
export async function claimPendingTransfersForEmail(
  prisma: Prisma.TransactionClient,
  email: string,
  collectorId: string,
): Promise<number> {
  const { count } = await prisma.transfer.updateMany({
    where: { toEmail: email.toLowerCase(), toCollectorId: null, status: 'PENDING' },
    data: { toCollectorId: collectorId },
  });
  return count;
}

/** Sweep expired transfers. Safe to run repeatedly. */
export async function expireStaleTransfers(prisma: PrismaClient): Promise<number> {
  const { count } = await prisma.transfer.updateMany({
    where: { status: 'PENDING', expiresAt: { lt: new Date() } },
    data: { status: 'EXPIRED', respondedAt: new Date() },
  });
  return count;
}

class TransferRejected extends Error {
  readonly reason: TransferFailure;
  constructor(reason: TransferFailure) {
    super(reason);
    this.name = 'TransferRejected';
    this.reason = reason;
  }
}
