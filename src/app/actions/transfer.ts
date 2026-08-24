'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/auth/current';
import {
  acceptTransfer,
  cancelTransfer,
  initiateTransfer,
  respondDecline,
  type TransferFailure,
} from '@/lib/db/transfer';
import { getTranslations } from '@/lib/i18n';

export interface TransferState {
  status: 'idle' | 'sent' | 'error';
  message?: string;
}

const initiateSchema = z.object({
  serial: z.string().trim().toUpperCase().regex(/^[A-Z]{2}-\d{6}$/, 'invalid_serial'),
  recipient: z.string().trim().min(3).max(254),
  message: z.string().trim().max(500).optional(),
});

/**
 * Failures are named specifically here, unlike claiming.
 *
 * The claim endpoint must stay a single generic message because it guards a
 * secret and would otherwise work as an oracle. A transfer guards nothing
 * secret: the sender already owns the piece and already knows who they are
 * sending it to. Being vague would just make a legitimate mistake, like a
 * mistyped handle, impossible to fix.
 */
function messageFor(reason: TransferFailure, t: Awaited<ReturnType<typeof getTranslations>>['t']) {
  return t.transfer.errors[reason] ?? t.common.somethingWrong;
}

export async function sendTransfer(
  _prev: TransferState,
  formData: FormData,
): Promise<TransferState> {
  const { t } = await getTranslations();
  const user = await getCurrentUser();
  if (!user?.collectorId) return { status: 'error', message: t.common.somethingWrong };

  const parsed = initiateSchema.safeParse({
    serial: formData.get('serial'),
    recipient: formData.get('recipient'),
    message: formData.get('message') || undefined,
  });
  if (!parsed.success) {
    return { status: 'error', message: t.transfer.errors.recipient_unknown };
  }

  const result = await initiateTransfer(prisma, {
    pieceSerial: parsed.data.serial,
    fromCollectorId: user.collectorId,
    recipient: parsed.data.recipient,
    message: parsed.data.message,
  });

  if (!result.ok) return { status: 'error', message: messageFor(result.reason, t) };

  revalidatePath('/collection');
  revalidatePath('/transfers');
  return { status: 'sent', message: t.transfer.sent };
}

export async function acceptTransferAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user?.collectorId) return;

  await acceptTransfer(prisma, String(formData.get('transferId')), user.collectorId);
  revalidatePath('/transfers');
  revalidatePath('/collection');
}

export async function declineTransferAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user?.collectorId) return;

  await respondDecline(prisma, String(formData.get('transferId')), user.collectorId);
  revalidatePath('/transfers');
}

export async function cancelTransferAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user?.collectorId) return;

  await cancelTransfer(prisma, String(formData.get('transferId')), user.collectorId);
  revalidatePath('/transfers');
  revalidatePath('/collection');
}
