'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { z } from 'zod';
import { prisma } from '@/lib/db/client';
import { requireAdmin, auditData } from '@/lib/auth/admin';

/**
 * Admin mutations.
 *
 * Every one of these re-checks the role server-side and writes an audit row in
 * the same transaction as the change. An action cannot succeed without leaving
 * a trace, and hiding the button in the UI is never the control.
 *
 * Note what is absent: nothing here can edit a serial, a QR token or a claim
 * hash. Those are frozen at export, and an admin screen is exactly the sort of
 * convenience that would quietly make them editable.
 */

async function actorIp(): Promise<string | undefined> {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || undefined;
}

const serialSchema = z.string().trim().toUpperCase().regex(/^[A-Z]{2}-\d{6}$/);

export async function voidPiece(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const serial = serialSchema.parse(formData.get('serial'));
  const reason = String(formData.get('reason') ?? '').trim().slice(0, 300);
  const ip = await actorIp();

  const piece = await prisma.piece.findUnique({
    where: { serial },
    select: { id: true, status: true, verified: true },
  });
  if (!piece) return;

  await prisma.$transaction(async (tx) => {
    // Conditional: a piece already void stays void, and a concurrent void
    // does not write two VOIDED events.
    const { count } = await tx.piece.updateMany({
      where: { id: piece.id, status: { not: 'VOID' } },
      data: { status: 'VOID', verified: false },
    });
    if (count !== 1) return;

    const last = await tx.passportEvent.findFirst({
      where: { pieceId: piece.id },
      orderBy: { seq: 'desc' },
      select: { seq: true },
    });

    // The void is recorded on the public timeline, not hidden. A piece that
    // was withdrawn should say so to anyone who scans it.
    await tx.passportEvent.create({
      data: {
        pieceId: piece.id,
        seq: (last?.seq ?? 0) + 1,
        type: 'VOIDED',
        title: 'Withdrawn from the registry',
        body: reason || null,
        actor: admin.handle,
      },
    });

    // Any transfer in flight dies with it.
    await tx.transfer.updateMany({
      where: { pieceId: piece.id, status: 'PENDING' },
      data: { status: 'CANCELLED', respondedAt: new Date() },
    });

    await tx.auditLog.create({
      data: auditData({
        actor: admin.handle,
        action: 'PIECE_VOIDED',
        entity: `piece:${serial}`,
        before: { status: piece.status, verified: piece.verified },
        after: { status: 'VOID', reason },
        ip,
      }),
    });
  });

  revalidatePath('/admin/pieces');
}

export async function setVerified(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const serial = serialSchema.parse(formData.get('serial'));
  const verified = String(formData.get('verified')) === 'true';
  const reason = String(formData.get('reason') ?? '').trim().slice(0, 300);
  const ip = await actorIp();

  const piece = await prisma.piece.findUnique({
    where: { serial },
    select: { id: true, verified: true, status: true },
  });
  if (!piece || piece.status === 'VOID' || piece.verified === verified) return;

  await prisma.$transaction(async (tx) => {
    await tx.piece.update({ where: { id: piece.id }, data: { verified } });

    const last = await tx.passportEvent.findFirst({
      where: { pieceId: piece.id },
      orderBy: { seq: 'desc' },
      select: { seq: true },
    });

    await tx.passportEvent.create({
      data: {
        pieceId: piece.id,
        seq: (last?.seq ?? 0) + 1,
        type: 'VERIFICATION',
        title: verified ? 'Verified by BINKIS' : 'Verification withdrawn',
        body: reason || null,
        actor: admin.handle,
      },
    });

    await tx.auditLog.create({
      data: auditData({
        actor: admin.handle,
        action: verified ? 'PIECE_VERIFIED' : 'PIECE_UNVERIFIED',
        entity: `piece:${serial}`,
        before: { verified: piece.verified },
        after: { verified, reason },
        ip,
      }),
    });
  });

  revalidatePath('/admin/pieces');
}

export async function setUserRole(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const handle = String(formData.get('handle') ?? '').trim().toLowerCase();
  const role = String(formData.get('role')) === 'ADMIN' ? 'ADMIN' : 'COLLECTOR';
  const ip = await actorIp();

  const target = await prisma.user.findUnique({
    where: { handle },
    select: { id: true, role: true, handle: true },
  });
  if (!target) return;

  // An admin cannot demote themselves, which is the classic way to lock
  // everyone out of the admin area with one careless click.
  if (target.id === admin.id) return;

  await prisma.$transaction([
    prisma.user.update({ where: { id: target.id }, data: { role } }),
    prisma.auditLog.create({
      data: auditData({
        actor: admin.handle,
        action: 'USER_ROLE_CHANGED',
        entity: `user:${target.handle}`,
        before: { role: target.role },
        after: { role },
        ip,
      }),
    }),
  ]);

  revalidatePath('/admin/users');
}
