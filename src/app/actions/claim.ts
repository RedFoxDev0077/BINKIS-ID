'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db/client';
import { claimPiece, GENERIC_CLAIM_FAILURE } from '@/lib/db/claim';
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
    return { status: 'error', message: outcome.message };
  }

  revalidatePath(`/p/${qrToken}`);
  return { status: 'success', serial: outcome.serial };
}

export { GENERIC_CLAIM_FAILURE };
