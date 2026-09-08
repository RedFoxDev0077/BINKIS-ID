import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/auth/current';
import { currentOwnerId } from '@/lib/db/transfer';
import { parseQrToken } from '@/lib/codes/qr-token';

/**
 * What the passport page cannot know without knowing who is asking.
 *
 * The passport page itself is public and identical for every visitor, which
 * is what lets it be cached. Three facts are not: whether you are signed in,
 * whether you own this piece, and whether you already have a transfer in
 * flight on it. Those live here, behind a response that is never cached.
 *
 * Splitting it this way is a security property, not only a performance one. A
 * page that renders differently for the signed-in owner cannot be cached and
 * served to the next visitor, and before this split the only thing preventing
 * that was that nothing was cached at all.
 *
 * It returns three booleans and nothing else. No handle, no email, no piece
 * id, and no indication of who the owner is if it is not you.
 */

export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ token: string }>;
}

const NOT_SIGNED_IN = { signedIn: false, isOwner: false, pendingTransfer: false } as const;

function json(body: unknown) {
  return NextResponse.json(body, {
    headers: {
      // Never cached, never shared. This is the one part of a passport that
      // depends on who is looking.
      'Cache-Control': 'private, no-store',
    },
  });
}

export async function GET(_request: Request, { params }: Params) {
  const { token: raw } = await params;

  const token = parseQrToken(raw);
  if (!token) return json(NOT_SIGNED_IN);

  const user = await getCurrentUser();
  if (!user?.collectorId) return json(NOT_SIGNED_IN);

  const piece = await prisma.piece.findUnique({
    where: { qrToken: token },
    select: { id: true, status: true },
  });

  // An unknown token answers exactly as a known one does for a non-owner, so
  // this cannot be used to test whether a token exists.
  if (!piece || piece.status !== 'CLAIMED') {
    return json({ signedIn: true, isOwner: false, pendingTransfer: false });
  }

  const isOwner = (await currentOwnerId(prisma, piece.id)) === user.collectorId;
  if (!isOwner) return json({ signedIn: true, isOwner: false, pendingTransfer: false });

  const pendingTransfer =
    (await prisma.transfer.count({
      where: { pieceId: piece.id, status: 'PENDING' },
    })) > 0;

  return json({ signedIn: true, isOwner: true, pendingTransfer });
}
