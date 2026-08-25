import type { PrismaClient } from '@prisma/client';

/**
 * Claim rate limiting, with progressive lockout.
 *
 * CLAUDE.md requires this and it was missing: attempts were being recorded and
 * never read back, so the endpoint could be hammered as fast as the server
 * would answer. That mattered more than it looks, because the argument for
 * shortening the claim code to nine characters rested on guessing being
 * impossible under a rate limit. Without this, that argument was not true.
 *
 * Two independent limits, because there are two different attacks:
 *
 *   BY IP     one machine working through many pieces.
 *   BY PIECE  many machines working on one piece. This is the shape an attack
 *             on a Legendary would actually take, and an IP limit alone does
 *             nothing against it.
 *
 * Legitimate failures are rare by design. The check character is validated in
 * the browser, so a typo never reaches here at all; a failure that does reach
 * the server means a genuinely wrong code, an already-claimed piece, or a code
 * aimed at the wrong piece. That lets the thresholds be tight without hurting
 * an honest collector who is simply bad at typing.
 */

/** How far back failures are counted. */
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

/**
 * Progressive lockout by recent failure count.
 *
 * Each step is the pause enforced from the LAST failure, so an attacker who
 * keeps trying keeps extending their own lockout while someone who made a few
 * honest mistakes is waved through again in a minute.
 */
const IP_LADDER: ReadonlyArray<{ failures: number; lockoutMs: number }> = [
  { failures: 40, lockoutMs: 2 * 60 * 60 * 1000 }, // 2 hours
  { failures: 20, lockoutMs: 30 * 60 * 1000 },     // 30 minutes
  { failures: 10, lockoutMs: 5 * 60 * 1000 },      // 5 minutes
  { failures: 5, lockoutMs: 60 * 1000 },           // 1 minute
];

/**
 * A single piece tolerates fewer failures than an IP, and the lockout is flat.
 * Nobody legitimately fails eight times on one BINKI: they are holding it and
 * reading the code off it.
 */
const PIECE_FAILURE_LIMIT = 8;
const PIECE_LOCKOUT_MS = 30 * 60 * 1000;

export interface RateLimitDecision {
  allowed: boolean;
  /** Seconds until the caller may try again. Only set when blocked. */
  retryAfterSeconds?: number;
  /**
   * Which limit tripped. 'ip' is the caller's own doing and can be reported to
   * them; 'piece' reflects other people's activity and must not be, or the
   * endpoint starts telling an attacker which pieces are under attack.
   */
  scope?: 'ip' | 'piece';
}

const ALLOWED: RateLimitDecision = { allowed: true };

export async function checkClaimRateLimit(
  prisma: PrismaClient,
  ip: string,
  qrToken: string,
): Promise<RateLimitDecision> {
  const since = new Date(Date.now() - WINDOW_MS);

  // Both counts in one round trip. This runs before any hashing or piece
  // lookup, so a flood costs one cheap indexed query rather than an argon2-era
  // amount of work.
  const [ipFailures, pieceFailures] = await Promise.all([
    prisma.claimAttempt.findMany({
      where: { ip, succeeded: false, at: { gte: since } },
      orderBy: { at: 'desc' },
      select: { at: true },
    }),
    prisma.claimAttempt.findMany({
      where: { qrToken, succeeded: false, at: { gte: since } },
      orderBy: { at: 'desc' },
      select: { at: true },
    }),
  ]);

  const now = Date.now();

  const piece = evaluate(pieceFailures, now, [
    { failures: PIECE_FAILURE_LIMIT, lockoutMs: PIECE_LOCKOUT_MS },
  ]);
  if (piece) return { allowed: false, retryAfterSeconds: piece, scope: 'piece' };

  const byIp = evaluate(ipFailures, now, IP_LADDER);
  if (byIp) return { allowed: false, retryAfterSeconds: byIp, scope: 'ip' };

  return ALLOWED;
}

/**
 * Returns the remaining lockout in seconds, or null if not locked out.
 * The ladder is ordered most-severe first, so the first match wins.
 */
function evaluate(
  failures: ReadonlyArray<{ at: Date }>,
  now: number,
  ladder: ReadonlyArray<{ failures: number; lockoutMs: number }>,
): number | null {
  if (failures.length === 0) return null;
  const lastAt = failures[0]!.at.getTime();

  for (const step of ladder) {
    if (failures.length < step.failures) continue;
    const elapsed = now - lastAt;
    if (elapsed >= step.lockoutMs) return null; // served their time
    return Math.max(1, Math.ceil((step.lockoutMs - elapsed) / 1000));
  }
  return null;
}

/** Human-facing wait, rounded to something worth saying out loud. */
export function describeWait(seconds: number, locale: string): string {
  const minutes = Math.ceil(seconds / 60);
  if (locale === 'es') {
    return minutes <= 1 ? 'un momento' : `${minutes} minutos`;
  }
  return minutes <= 1 ? 'a moment' : `${minutes} minutes`;
}
