'use server';

import { headers } from 'next/headers';
import { prisma } from '@/lib/db/client';
import { claimPiece, RATE_LIMITED_FAILURE } from '@/lib/db/claim';
import { describeWait } from '@/lib/db/rate-limit';
import { getTranslations, fill } from '@/lib/i18n';
import { getCurrentUser } from '@/lib/auth/current';

export interface ClaimState {
  status: 'idle' | 'success' | 'error' | 'unauthenticated';
  message?: string;
  serial?: string;
}

/**
 * The claim server action.
 *
 * Everything that decides the outcome happens in claimPiece: the atomic
 * conditional write, the rate-limited attempt record, and the single generic
 * failure that keeps the endpoint from working as a code oracle. This wrapper
 * only resolves who is asking and passes the request through.
 */
export async function submitClaim(_prev: ClaimState, formData: FormData): Promise<ClaimState> {
  const user = await getCurrentUser();
  if (!user?.collectorId) {
    return { status: 'unauthenticated' };
  }

  const qrToken = String(formData.get('qrToken') ?? '');
  const submittedCode = String(formData.get('code') ?? '');

  const pepper = process.env.CLAIM_CODE_PEPPER ?? '';
  if (!pepper) {
    // Refuse rather than fail open. Without the pepper no code can be
    // verified, and answering anything here would be a lie.
    throw new Error('CLAIM_CODE_PEPPER is not configured');
  }

  const h = await headers();
  const ip =
    h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || '0.0.0.0';

  const outcome = await claimPiece(prisma, {
    qrToken,
    submittedCode,
    collectorId: user.collectorId,
    pepper,
    ip,
  });

  if (!outcome.ok) {
    // The limiter returns a sentinel rather than prose, so the wait can be
    // rendered in the collector's own language with a real number of minutes
    // instead of a shrug.
    if (outcome.message === RATE_LIMITED_FAILURE) {
      const { t, locale } = await getTranslations();
      return {
        status: 'error',
        message: fill(t.claim.tooManyAttempts, {
          wait: describeWait(outcome.retryAfterSeconds ?? 60, locale),
        }),
      };
    }
    return { status: 'error', message: outcome.message };
  }

  // Deliberately NOT revalidatePath(`/p/${qrToken}`) here.
  //
  // ClaimForm only renders while the piece is unclaimed, and the success
  // reveal lives inside it. Revalidating re-renders this page as *claimed*,
  // which unmounts the form and destroys the reveal before anyone sees it -
  // the claim works, and the collector watches the form quietly disappear.
  //
  // CLAUDE.md: "The claim moment is the product... a real reveal on success,
  // the Passport visibly flipping to VERIFIED. Do not let it feel like a form
  // submission." Revalidating here is precisely what made it feel like one.
  //
  // Nothing goes stale as a result: /p/[token] is a dynamic route, so the next
  // visit server-renders the claimed passport from the database anyway.
  return { status: 'success', serial: outcome.serial };
}
