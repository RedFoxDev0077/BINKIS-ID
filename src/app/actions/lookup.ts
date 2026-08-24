'use server';

import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/client';
import { parseQrToken } from '@/lib/codes/qr-token';
import { parseSerial } from '@/lib/serial';

/**
 * Look a piece up by its printed number or its QR token.
 *
 * The reason this exists: the QR is printed on reflective holographic foil,
 * and a scan can fail on an old phone, in bad light, or at a bad angle. The
 * serial is printed in the clear right next to it, so a collector always has a
 * way in even when the camera will not cooperate.
 *
 * It resolves nothing secret. Both inputs are public, and it lands on the same
 * page a scan would - so it is a convenience, not a second way to guess at
 * pieces.
 */
export async function lookupPiece(formData: FormData): Promise<void> {
  const raw = String(formData.get('q') ?? '').trim();
  if (!raw) redirect('/');

  // A full token goes straight through.
  const token = parseQrToken(raw);
  if (token) {
    const byToken = await prisma.piece.findUnique({
      where: { qrToken: token },
      select: { qrToken: true },
    });
    if (byToken) redirect(`/p/${byToken.qrToken}` as never);
  }

  // Otherwise treat it as a printed serial, tolerating a missing hyphen.
  const candidate = raw.toUpperCase().replace(/\s+/g, '');
  const normalised = /^[A-Z]{2}-?\d{6}$/.test(candidate)
    ? `${candidate.slice(0, 2)}-${candidate.replace('-', '').slice(2)}`
    : candidate;

  if (parseSerial(normalised)) {
    const bySerial = await prisma.piece.findUnique({
      where: { serial: normalised },
      select: { qrToken: true },
    });
    if (bySerial) redirect(`/p/${bySerial.qrToken}` as never);
  }

  redirect(`/?notfound=${encodeURIComponent(raw.slice(0, 24))}` as never);
}
