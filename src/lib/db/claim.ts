import type { PrismaClient } from '@prisma/client';
import { parseClaimCode } from '../codes/claim-code.ts';
import { parseQrToken } from '../codes/qr-token.ts';
import { hashClaimCode } from '../hash.ts';
import { checkClaimRateLimit } from './rate-limit.ts';

/**
 * Claiming.
 *
 * Non-negotiable 3: a single atomic transaction with a conditional write. Two
 * simultaneous claims with the same valid code produce exactly one winner and
 * one deterministic rejection, never a duplicate ownership row.
 *
 * Non-negotiable 2: the ledger is append only. Claiming inserts an
 * OwnershipEvent. Nothing is ever updated in place, and there is no
 * current_owner column to race on.
 *
 * The endpoint is also not an oracle. A wrong code, an already-claimed piece,
 * a live code aimed at the wrong piece and an unknown token all return one
 * byte-identical failure. Distinguishing them would let anyone with a phone
 * enumerate which claim codes exist across the whole production run.
 */

export const GENERIC_CLAIM_FAILURE = 'That code is not valid for this BINKI.';

/**
 * Rate limiting speaks with its own voice.
 *
 * Telling the caller they are locked out reveals nothing about any code - they
 * already know how many times they just tried - and leaving them with the
 * generic failure would send an honest collector back to the hologram looking
 * for a typo that is not there.
 *
 * The per-PIECE lockout is different: it reflects other people's attempts, so
 * it returns the generic failure instead. Otherwise the endpoint would tell an
 * attacker which pieces are already being worked on.
 */
export const RATE_LIMITED_FAILURE = 'Too many attempts. Try again in {wait}.';

/** Internal only. Recorded in the audit trail, never returned to a caller. */
type FailureReason =
  | 'malformed_code'
  | 'malformed_token'
  | 'no_matching_code'
  | 'code_for_other_piece'
  | 'already_claimed';

export type ClaimOutcome =
  | {
      ok: true;
      serial: string;
      qrToken: string;
      editionNumber: number | null;
      occurredAt: Date;
    }
  | { ok: false; message: string; retryAfterSeconds?: number };

export interface ClaimInput {
  qrToken: string;
  submittedCode: string;
  collectorId: string;
  pepper: string;
  ip: string;
  /**
   * Skip the rate limit.
   *
   * Only the batch generator's staging rehearsal sets this. It claims every
   * code in a batch from one address on purpose, against a throwaway database,
   * so rate limiting it would only be rate limiting ourselves. Nothing that
   * touches the live registry may set it.
   */
  skipRateLimit?: boolean;
  /**
   * Transaction budget.
   *
   * `maxWait` is how long to wait for a connection before giving up, and
   * Prisma's default of 2s is wrong at both ends of our range. A collector
   * tapping CLAIM wants a fast answer, so the default here stays short. The
   * batch generator's staging rehearsal drives hundreds of claims through a
   * shared pool and needs a much longer one, so it passes its own.
   */
  transaction?: { maxWait?: number; timeout?: number };
}

const FAILURE: ClaimOutcome = { ok: false, message: GENERIC_CLAIM_FAILURE };

export async function claimPiece(
  prisma: PrismaClient,
  input: ClaimInput,
): Promise<ClaimOutcome> {
  const { qrToken, submittedCode, collectorId, pepper, ip } = input;
  const transactionOptions = {
    maxWait: input.transaction?.maxWait ?? 5_000,
    timeout: input.transaction?.timeout ?? 15_000,
  };

  // Shape checks first, and deliberately with no database write.
  //
  // The check character is validated client-side precisely so a typo never
  // reaches here. If one does - an old client, a script, a paste gone wrong -
  // it must still not consume one of the caller's small number of
  // rate-limited attempts. A typo is not an attack.
  const token = parseQrToken(qrToken);
  if (!token) return FAILURE;

  const code = parseClaimCode(submittedCode);
  if (!code) return FAILURE;

  // Rate limit BEFORE hashing and before touching the piece table, so a flood
  // costs one indexed count rather than an HMAC and a lookup per request.
  //
  // Deliberately after the shape checks: a malformed code never reached the
  // recorded-attempts table in the first place, so it must not be able to
  // consume someone's allowance either.
  if (!input.skipRateLimit) {
    const limit = await checkClaimRateLimit(prisma, ip, token);
    if (!limit.allowed) {
      // A blocked attempt is NOT recorded. Recording it would let an attacker
      // extend their own lockout indefinitely by continuing to knock, and
      // would let one attacker lock a piece out for its real owner forever.
      return limit.scope === 'ip'
        ? {
            ok: false,
            message: RATE_LIMITED_FAILURE,
            retryAfterSeconds: limit.retryAfterSeconds,
          }
        : FAILURE;
    }
  }

  const claimHash = hashClaimCode(code, pepper);

  // Indexed equality on the hash. The plaintext is never stored, so this is
  // the only way to find the piece a code belongs to.
  const piece = await prisma.piece.findUnique({
    where: { claimHash },
    select: { id: true, serial: true, qrToken: true, editionNumber: true, status: true },
  });

  if (!piece) {
    await recordFailure(prisma, { ip, qrToken: token, reason: 'no_matching_code' });
    return FAILURE;
  }

  // A real, live code - but presented against a different piece. This is the
  // dangerous case to leak: confirming the code exists turns every public
  // page into a lookup oracle.
  if (piece.qrToken !== token) {
    await recordFailure(prisma, { ip, qrToken: token, reason: 'code_for_other_piece' });
    return FAILURE;
  }

  try {
    return await prisma.$transaction(async (tx) => {
      // The conditional write. Postgres takes a row lock here; a competing
      // transaction blocks, then re-evaluates the WHERE against the committed
      // row and matches nothing. Exactly one caller sees count === 1.
      // `verified: true` reads CLAUDE.md's "the Passport visibly flipping to
      // VERIFIED" on the claim reveal as meaning a successful claim IS the
      // verification - entering the code proves physical possession. Admin
      // manual verification then stays a separate control for the cases a
      // claim cannot cover. Worth confirming with David in build step 3,
      // where the passport page makes the distinction visible.
      const { count } = await tx.piece.updateMany({
        where: { id: piece.id, status: 'UNCLAIMED' },
        data: { status: 'CLAIMED', verified: true },
      });

      if (count !== 1) throw new ClaimRejected('already_claimed');

      // Append to the ledger. @@unique([pieceId, seq]) is the second line of
      // defence: even if the conditional write above were somehow bypassed, a
      // duplicate ownership row is physically impossible.
      const occurredAt = new Date();
      await tx.ownershipEvent.create({
        data: {
          pieceId: piece.id,
          seq: 1,
          fromCollectorId: null,
          toCollectorId: collectorId,
          acquiredVia: 'CLAIM',
          occurredAt,
        },
      });

      const lastPassport = await tx.passportEvent.findFirst({
        where: { pieceId: piece.id },
        orderBy: { seq: 'desc' },
        select: { seq: true },
      });

      await tx.passportEvent.create({
        data: {
          pieceId: piece.id,
          seq: (lastPassport?.seq ?? 0) + 1,
          type: 'CLAIMED',
          title: 'Claimed by its first owner',
          actor: collectorId,
          occurredAt,
        },
      });

      await tx.claimAttempt.create({
        data: { ip, qrToken: token, succeeded: true },
      });

      await tx.auditLog.create({
        data: {
          actor: collectorId,
          action: 'CLAIM',
          entity: `piece:${piece.serial}`,
          before: { status: 'UNCLAIMED' },
          after: { status: 'CLAIMED', toCollectorId: collectorId },
          ip,
        },
      });

      return {
        ok: true as const,
        serial: piece.serial,
        qrToken: piece.qrToken,
        editionNumber: piece.editionNumber,
        occurredAt,
      };
    }, transactionOptions);
  } catch (error) {
    // Two things legitimately land here, and both mean "someone else won":
    // our own ClaimRejected from the conditional write, and a unique violation
    // on ownership_events (P2002) if a competitor committed between our
    // conditional write and our insert.
    //
    // Anything else - a dropped connection, a schema mismatch - is a real
    // fault and is rethrown. Swallowing it into the generic failure message
    // would turn an outage into "your code is wrong", which is both a lie to
    // the collector and invisible in monitoring.
    const isLostRace =
      error instanceof ClaimRejected ||
      (isPrismaKnownError(error) && error.code === 'P2002');

    if (!isLostRace) throw error;

    const reason: FailureReason =
      error instanceof ClaimRejected ? error.reason : 'already_claimed';

    await recordFailure(prisma, { ip, qrToken: token, reason });
    return FAILURE;
  }
}

function isPrismaKnownError(error: unknown): error is { code: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string'
  );
}

class ClaimRejected extends Error {
  readonly reason: FailureReason;
  constructor(reason: FailureReason) {
    super(reason);
    this.name = 'ClaimRejected';
    this.reason = reason;
  }
}

/**
 * Record what really happened, for rate limiting and for the audit trail.
 *
 * The submitted code is never written here, in any form. If it were, the
 * audit table would become a plaintext claim-code store for every near miss.
 */
async function recordFailure(
  prisma: PrismaClient,
  args: { ip: string; qrToken: string; reason: FailureReason },
): Promise<void> {
  await prisma.claimAttempt.create({
    data: { ip: args.ip, qrToken: args.qrToken, succeeded: false },
  });
  await prisma.auditLog.create({
    data: {
      actor: 'anonymous',
      action: 'CLAIM_FAILED',
      entity: `qr_token:${args.qrToken}`,
      after: { reason: args.reason },
      ip: args.ip,
    },
  });
}
