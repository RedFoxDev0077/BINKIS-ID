import type { PrismaClient } from '@prisma/client';
import { parseSerial } from '../serial.ts';
import { parseQrToken } from '../codes/qr-token.ts';
import { checkClaimRateLimit } from './rate-limit.ts';

/**
 * "My code does not work."
 *
 * With 155,506 pieces in the market this arrives daily from the first week,
 * and answering it used to mean reading three tables by hand. The information
 * was always there - the audit log records why every claim failed - it was
 * just not in one place, and the reason a claim fails is deliberately hidden
 * from the person claiming so the endpoint cannot be used as an oracle.
 *
 * That secrecy is right for the public endpoint and wrong for support, so
 * this is the one place the real reason is surfaced, behind the admin role
 * and written to the audit log like every other admin action.
 *
 * It answers in the order a support person actually needs: what is this
 * piece, has it already been claimed and by whom, is this person locked out,
 * and what has been going wrong.
 */

export type Verdict =
  | 'not_found'
  | 'unclaimed_no_attempts'
  | 'unclaimed_wrong_code'
  | 'already_claimed'
  | 'rate_limited'
  | 'voided'
  | 'reserved';

export interface AttemptRow {
  at: Date;
  ip: string;
  succeeded: boolean;
  /** From the audit log. Null when there is no matching audit row. */
  reason: string | null;
}

export interface SupportReport {
  verdict: Verdict;
  /** One sentence a support person can act on, in plain language. */
  summary: string;
  piece: {
    serial: string;
    qrToken: string;
    status: string;
    verified: boolean;
    character: string;
    editionLabel: string;
    editionNumber: number | null;
    batch: string;
  } | null;
  owner: { handle: string; displayName: string; since: Date } | null;
  /** Newest first, capped. */
  attempts: AttemptRow[];
  failuresLastHour: number;
  /** Set when the piece itself is currently locked out. */
  pieceLockedForSeconds: number | null;
}

const EMPTY: Omit<SupportReport, 'verdict' | 'summary'> = {
  piece: null,
  owner: null,
  attempts: [],
  failuresLastHour: 0,
  pieceLockedForSeconds: null,
};

/**
 * Look a piece up by whatever support was handed.
 *
 * A customer reads out whatever is printed on the sticker, which is the
 * serial, or pastes the URL, which carries the token. Both work, in either
 * case, without the support person having to know which is which.
 */
export async function findPieceFor(prisma: PrismaClient, raw: string) {
  const query = raw.trim().toUpperCase();
  if (!query) return null;

  const token = parseQrToken(query) ?? parseQrToken(query.split('/').pop() ?? '');
  if (token) {
    const byToken = await prisma.piece.findUnique({ where: { qrToken: token } });
    if (byToken) return byToken;
  }

  // parseSerial accepts both written forms, so SP-000001 and BZ-V01427 both
  // land here without support needing to care which edition it is.
  if (parseSerial(query)) {
    return prisma.piece.findUnique({ where: { serial: query } });
  }

  return null;
}

export async function diagnose(prisma: PrismaClient, raw: string): Promise<SupportReport> {
  const piece = await findPieceFor(prisma, raw);

  if (!piece) {
    return {
      ...EMPTY,
      verdict: 'not_found',
      summary:
        'No piece matches that. Check for a typo, and note that O and I never ' +
        'appear in our codes, so a letter O is really a zero.',
    };
  }

  const [product, batch] = await Promise.all([
    prisma.product.findUnique({ where: { id: piece.productId } }),
    prisma.batch.findUnique({ where: { id: piece.batchId } }),
  ]);

  const info = {
    serial: piece.serial,
    qrToken: piece.qrToken,
    status: piece.status,
    verified: piece.verified,
    character: product?.character ?? 'unknown',
    editionLabel: product?.editionType ?? 'unknown',
    editionNumber: piece.editionNumber,
    batch: batch?.code ?? 'unknown',
  };

  // Recent attempts, joined to the audit log for the real reason.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [rawAttempts, auditRows] = await Promise.all([
    prisma.claimAttempt.findMany({
      where: { qrToken: piece.qrToken, at: { gte: since } },
      orderBy: { at: 'desc' },
      take: 25,
    }),
    prisma.auditLog.findMany({
      where: { entity: `qr_token:${piece.qrToken}`, action: 'CLAIM_FAILED', at: { gte: since } },
      orderBy: { at: 'desc' },
      take: 50,
    }),
  ]);

  const reasonAt = new Map<number, string>();
  for (const row of auditRows) {
    const after = row.after as { reason?: string } | null;
    if (after?.reason) reasonAt.set(row.at.getTime(), after.reason);
  }

  const attempts: AttemptRow[] = rawAttempts.map((a) => ({
    at: a.at,
    ip: a.ip,
    succeeded: a.succeeded,
    // Audit rows are written in the same transaction, within a second.
    reason:
      reasonAt.get(a.at.getTime()) ??
      [...reasonAt.entries()].find(([t]) => Math.abs(t - a.at.getTime()) < 2000)?.[1] ??
      null,
  }));

  const hourAgo = Date.now() - 60 * 60 * 1000;
  const failuresLastHour = attempts.filter(
    (a) => !a.succeeded && a.at.getTime() >= hourAgo,
  ).length;

  // Is the piece itself locked out right now? Ask the limiter rather than
  // reimplementing its ladder, so support sees exactly what a caller sees.
  const limit = await checkClaimRateLimit(prisma, '0.0.0.0', piece.qrToken);
  const pieceLockedForSeconds =
    !limit.allowed && limit.scope === 'piece' ? (limit.retryAfterSeconds ?? null) : null;

  // Owner, if any.
  let owner: SupportReport['owner'] = null;
  const latest = await prisma.ownershipEvent.findFirst({
    where: { pieceId: piece.id },
    orderBy: { seq: 'desc' },
  });
  if (latest?.toCollectorId) {
    const collector = await prisma.collectorId.findUnique({
      where: { id: latest.toCollectorId },
      select: { displayName: true, user: { select: { handle: true } } },
    });
    if (collector) {
      owner = {
        handle: collector.user.handle,
        displayName: collector.displayName,
        since: latest.occurredAt,
      };
    }
  }

  const base = { ...EMPTY, piece: info, owner, attempts, failuresLastHour, pieceLockedForSeconds };

  if (piece.status === 'VOID') {
    return {
      ...base,
      verdict: 'voided',
      summary:
        `${piece.serial} was voided, so it cannot be claimed. If a customer has ` +
        'it physically, this is the case to escalate rather than retry.',
    };
  }

  if (piece.status === 'RESERVED') {
    return {
      ...base,
      verdict: 'reserved',
      summary:
        `${piece.serial} is reserved and not claimable yet. Release it before ` +
        'telling the customer to try again.',
    };
  }

  if (piece.status === 'CLAIMED') {
    return {
      ...base,
      verdict: 'already_claimed',
      summary: owner
        ? `${piece.serial} was already claimed by @${owner.handle} on ` +
          `${owner.since.toISOString().slice(0, 10)}. If that is not the customer, ` +
          'treat it as a disputed claim rather than a broken code.'
        : `${piece.serial} is marked claimed but has no ownership row. That is a ` +
          'data problem, escalate it.',
    };
  }

  if (pieceLockedForSeconds !== null) {
    return {
      ...base,
      verdict: 'rate_limited',
      summary:
        `${piece.serial} is locked for about ${Math.ceil(pieceLockedForSeconds / 60)} ` +
        'more minutes after too many failed attempts. The customer is being shown ' +
        'the generic failure. Ask them to wait, the code itself is fine.',
    };
  }

  if (failuresLastHour > 0) {
    const wrongPiece = attempts.some((a) => a.reason === 'code_for_other_piece');
    return {
      ...base,
      verdict: 'unclaimed_wrong_code',
      summary: wrongPiece
        ? `${piece.serial} is unclaimed and fine. Someone entered a code that belongs ` +
          'to a different piece, so they are almost certainly scanning one sticker ' +
          'and reading the code off another.'
        : `${piece.serial} is unclaimed and fine. ${failuresLastHour} wrong code(s) in ` +
          'the last hour, so this is a typo or a rubbed scratch panel, not a fault.',
    };
  }

  return {
    ...base,
    verdict: 'unclaimed_no_attempts',
    summary:
      `${piece.serial} is unclaimed and nobody has tried to claim it in 24 hours. ` +
      'If the customer says they tried, they scanned a different piece.',
  };
}
