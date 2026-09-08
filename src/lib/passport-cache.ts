import { unstable_cache, revalidateTag } from 'next/cache';
import { getPassportByToken, ownerCountForToken, type PublicPassport } from './passport.ts';

/**
 * The cached read path for a passport.
 *
 * Every scan of every hologram lands on the passport page, and before this
 * each one ran the full query set against Postgres. With 155,506 pieces going
 * to market that is the read pattern that decides whether one small server is
 * enough, and CLAUDE.md says as much: what makes this scale is that public
 * pages are read-heavy and cacheable.
 *
 * Only public data is cached. Whether you are signed in and whether you own
 * the piece are deliberately not here, because caching anything that varies
 * by viewer would mean serving one collector's view to the next visitor. That
 * lives behind /api/viewer, which is never cached.
 *
 * Each piece is tagged separately, so a claim invalidates one piece rather
 * than the whole registry.
 */

/** Cache tag for a single piece. Claim and transfer both invalidate it. */
export function pieceTag(qrToken: string): string {
  return `piece:${qrToken}`;
}

/**
 * Five minutes.
 *
 * A passport changes on three occasions: it is claimed, it is transferred, or
 * an admin edits it. The first two invalidate the tag directly, so the window
 * only matters for the third. Five minutes of staleness on an admin edit is a
 * fair trade for not touching the database on a scan.
 */
const TTL_SECONDS = 300;

/**
 * Put the Dates back.
 *
 * unstable_cache stores its result as JSON, so a Date goes in and an ISO
 * string comes out. Nothing complains: the value is still truthy, still
 * renders in a template, and TypeScript still believes it is a Date because
 * the cast says so. It fails at the first thing that does real date work,
 * which on this page is the production date, and the whole passport 500s
 * with "RangeError: Invalid time value".
 *
 * This is not a detail to leave to memory. Every Date on PublicPassport is
 * revived here, and 14-passport-cache.test.ts fails if a new one is added
 * without being listed.
 */
function revive(passport: PublicPassport | null): PublicPassport | null {
  if (!passport) return null;
  return {
    ...passport,
    producedAt: new Date(passport.producedAt),
    events: passport.events.map((event) => ({
      ...event,
      occurredAt: new Date(event.occurredAt),
    })),
  };
}

export const getCachedPassport = async (token: string): Promise<PublicPassport | null> => {
  const cached = (await unstable_cache(
    async () => getPassportByToken(token),
    ['passport', token],
    { tags: [pieceTag(token)], revalidate: TTL_SECONDS },
  )()) as PublicPassport | null;

  return revive(cached);
};

export const getCachedOwnerCount = (qrToken: string) =>
  unstable_cache(
    async () => ownerCountForToken(qrToken),
    ['owner-count', qrToken],
    { tags: [pieceTag(qrToken)], revalidate: TTL_SECONDS },
  )();

/**
 * Drop a piece from the cache.
 *
 * Called after a claim and after a transfer is accepted or declined. Safe to
 * call when nothing was cached, and safe to call for a token that does not
 * exist.
 */
export function invalidatePiece(qrToken: string): void {
  revalidateTag(pieceTag(qrToken));
}
