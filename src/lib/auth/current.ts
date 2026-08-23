import { cache } from 'react';
import { cookies } from 'next/headers';
import { prisma } from '../db/client.ts';
import { SESSION_COOKIE, validateSessionToken, type SessionUser } from './session.ts';

/**
 * The signed-in collector, or null.
 *
 * Wrapped in React's cache so a page that asks several times in one render
 * hits the database once. Deliberately never throws: an anonymous visitor
 * scanning a QR is the normal case, not an error.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const { user } = await validateSessionToken(prisma, token);
  return user;
});

export const getCurrentSession = cache(async () => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return { session: null, user: null };
  return validateSessionToken(prisma, token);
});
