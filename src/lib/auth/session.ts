import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { PrismaClient, Session, User } from '@prisma/client';

/**
 * Server-side sessions.
 *
 * CLAUDE.md specifies "Lucia or Auth.js" with sessions in Postgres. Lucia was
 * archived in 2025 and now exists as a guide rather than a library, and
 * Auth.js cannot combine its Credentials provider with database sessions - it
 * forces JWTs. Since this registry is the permanent record of who owns a
 * physical object, "revoke this session now" has to actually work, so JWTs are
 * not acceptable here. What follows is the pattern Lucia itself recommends,
 * implemented directly.
 *
 * The token the browser holds is never stored. Only its SHA-256 lands in the
 * database, so a database dump yields no usable sessions. Same reasoning as
 * claim_hash: the thing that grants access lives outside the database.
 */

export const SESSION_COOKIE = 'binkis_session';
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const RENEW_WITHIN_MS = 1000 * 60 * 60 * 24 * 15; // renew when past halfway

export interface SessionUser {
  id: string;
  email: string;
  handle: string;
  collectorId: string | null;
  displayName: string | null;
}

export type SessionValidation =
  | { session: Session; user: SessionUser }
  | { session: null; user: null };

/** 32 bytes of entropy, base64url. This value only ever lives in the cookie. */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/** SHA-256, not HMAC: the token is already high-entropy, so a pepper adds nothing. */
function sessionIdFromToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(
  prisma: PrismaClient,
  userId: string,
  context: { ip?: string; userAgent?: string } = {},
): Promise<{ token: string; session: Session }> {
  const token = generateSessionToken();
  const session = await prisma.session.create({
    data: {
      id: sessionIdFromToken(token),
      userId,
      expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
      ip: context.ip ?? null,
      userAgent: context.userAgent?.slice(0, 512) ?? null,
    },
  });
  return { token, session };
}

export async function validateSessionToken(
  prisma: PrismaClient,
  token: string,
): Promise<SessionValidation> {
  if (!token) return { session: null, user: null };

  const row = await prisma.session.findUnique({
    where: { id: sessionIdFromToken(token) },
    include: { user: { include: { collectorId: true } } },
  });
  if (!row) return { session: null, user: null };

  // Expired sessions are deleted on sight rather than left to a cron job, so
  // the table cannot quietly accumulate credentials that still look valid.
  if (Date.now() >= row.expiresAt.getTime()) {
    await prisma.session.delete({ where: { id: row.id } }).catch(() => {});
    return { session: null, user: null };
  }

  // Sliding expiry. Extending only past the halfway mark avoids a database
  // write on every single request.
  let session: Session = row;
  if (Date.now() >= row.expiresAt.getTime() - RENEW_WITHIN_MS) {
    session = await prisma.session.update({
      where: { id: row.id },
      data: { expiresAt: new Date(Date.now() + SESSION_DURATION_MS) },
    });
  }

  return {
    session,
    user: {
      id: row.user.id,
      email: row.user.email,
      handle: row.user.handle,
      collectorId: row.user.collectorId?.id ?? null,
      displayName: row.user.collectorId?.displayName ?? null,
    },
  };
}

export async function invalidateSession(prisma: PrismaClient, sessionId: string): Promise<void> {
  await prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
}

/** Log out everywhere. Works instantly, which is the point of not using JWTs. */
export async function invalidateAllSessions(prisma: PrismaClient, userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}

/**
 * Cookie flags.
 *
 * `secure` is decided by the ACTUAL request protocol, not by NODE_ENV.
 *
 * Keying it off NODE_ENV is the usual advice and it is wrong for this
 * deployment. A Secure cookie is silently discarded by the browser over plain
 * HTTP, so a production build reached at http://<ip> - which is exactly how
 * this server is reachable until the DNS record exists - would set a session
 * cookie that the browser throws away. Sign-up succeeds, the redirect happens,
 * and the collector arrives signed out, with no error anywhere to explain it.
 *
 * Behind Caddy the app sees X-Forwarded-Proto, so the flag follows reality:
 * on for https, off for http, and no worse than the NODE_ENV version once TLS
 * is live.
 */
export function sessionCookieOptions(expiresAt: Date, secure: boolean) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure,
    path: '/',
    expires: expiresAt,
  };
}

/** True when the request actually arrived over HTTPS. */
export function isSecureRequest(headers: {
  forwardedProto?: string | null;
  origin?: string | null;
}): boolean {
  const proto = headers.forwardedProto?.split(',')[0]?.trim().toLowerCase();
  if (proto) return proto === 'https';
  return (headers.origin ?? '').startsWith('https://');
}

/** Constant-time string comparison, for anything compared against user input. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export type { User };
