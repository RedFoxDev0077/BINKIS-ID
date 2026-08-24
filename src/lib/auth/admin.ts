import { cache } from 'react';
import { cookies } from 'next/headers';
import { prisma } from '../db/client.ts';
import { SESSION_COOKIE, validateSessionToken } from './session.ts';

/**
 * Admin authorisation.
 *
 * A separate role, checked server-side on every admin request. There is no
 * client-side gate anywhere: hiding a link is presentation, not authorisation,
 * and every admin action re-checks rather than trusting the page that rendered
 * the button.
 */
export interface AdminUser {
  id: string;
  email: string;
  handle: string;
  collectorId: string | null;
}

export const getAdminUser = cache(async (): Promise<AdminUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const { user } = await validateSessionToken(prisma, token);
  if (!user) return null;

  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, email: true, handle: true, role: true },
  });
  if (row?.role !== 'ADMIN') return null;

  return {
    id: row.id,
    email: row.email,
    handle: row.handle,
    collectorId: user.collectorId,
  };
});

/** Throws rather than returning null, for use inside an action. */
export async function requireAdmin(): Promise<AdminUser> {
  const admin = await getAdminUser();
  if (!admin) throw new Error('Forbidden: administrator role required');
  return admin;
}

/**
 * Every admin action is audited, with before and after values.
 *
 * CLAUDE.md: "Separate role, every action audited." The audit row is written
 * inside the same transaction as the change wherever possible, so an action
 * cannot succeed without leaving a trace.
 */
export interface AuditInput {
  actor: string;
  action: string;
  entity: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
}

export function auditData(input: AuditInput) {
  return {
    actor: input.actor,
    action: input.action,
    entity: input.entity,
    before: (input.before ?? undefined) as never,
    after: (input.after ?? undefined) as never,
    ip: input.ip ?? null,
  };
}
