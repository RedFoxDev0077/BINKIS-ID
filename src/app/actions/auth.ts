'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import {
  SESSION_COOKIE,
  createSession,
  invalidateSession,
  sessionCookieOptions,
} from '@/lib/auth/session';
import { getCurrentSession } from '@/lib/auth/current';
import { signInSchema, signUpSchema } from '@/lib/validation/auth';
import { getTranslations } from '@/lib/i18n';

export interface AuthState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

async function requestContext() {
  const h = await headers();
  return {
    ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || undefined,
    userAgent: h.get('user-agent') ?? undefined,
  };
}

async function startSession(userId: string) {
  const { token, session } = await createSession(prisma, userId, await requestContext());
  const store = await cookies();
  store.set(SESSION_COOKIE, token, sessionCookieOptions(session.expiresAt));
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const { t } = await getTranslations();

  const parsed = signUpSchema.safeParse({
    email: formData.get('email'),
    handle: formData.get('handle'),
    password: formData.get('password'),
    displayName: formData.get('displayName') || undefined,
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'form');
      fieldErrors[key] ??= issue.message;
    }
    return { fieldErrors };
  }

  const { email, handle, password, displayName } = parsed.data;
  const passwordHash = await hashPassword(password);

  let userId: string;
  try {
    // User and Collector ID are created together. A user without a Collector
    // ID cannot own anything, so a half-created account would be a dead end.
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({ data: { email, handle, passwordHash } });
      await tx.collectorId.create({
        data: { userId: created.id, displayName: displayName ?? handle },
      });
      return created;
    });
    userId = user.id;
  } catch (error) {
    // Uniqueness is enforced by the database, not by a pre-flight SELECT,
    // so two simultaneous signups for the same handle cannot both win.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = String(error.meta?.target ?? '');
      if (target.includes('email')) return { fieldErrors: { email: t.auth.emailTaken } };
      if (target.includes('handle')) return { fieldErrors: { handle: t.auth.handleTaken } };
    }
    return { error: t.common.somethingWrong };
  }

  await startSession(userId);
  redirect('/collection');
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const { t } = await getTranslations();

  const parsed = signInSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) return { error: t.auth.failed };

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });

  // Same generic message whether the email is unknown or the password is
  // wrong, and the hash is still computed for an unknown email so the
  // response time does not reveal which accounts exist.
  if (!user) {
    await hashPassword('timing-equaliser-not-a-real-password');
    return { error: t.auth.failed };
  }

  const ok = await verifyPassword(user.passwordHash, parsed.data.password);
  if (!ok) return { error: t.auth.failed };

  await startSession(user.id);

  // Open-redirect guard. Only a same-origin absolute path is honoured, so a
  // crafted ?next=//evil.example cannot bounce a freshly signed-in collector
  // off the site. typedRoutes cannot know about a runtime string, hence the
  // cast, which is safe precisely because of the check above.
  const requested = String(formData.get('next') ?? '');
  const safeNext =
    requested.startsWith('/') && !requested.startsWith('//') ? requested : '/collection';
  redirect(safeNext as Parameters<typeof redirect>[0]);
}

export async function signOut(): Promise<void> {
  const { session } = await getCurrentSession();
  if (session) await invalidateSession(prisma, session.id);

  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect('/');
}
