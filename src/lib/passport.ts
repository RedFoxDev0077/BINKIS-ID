import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from './db/client.ts';
import { parseQrToken } from './codes/qr-token.ts';
import { editionNumberForSerial, EDITION_RANGES, type EditionType } from './serial.ts';

/**
 * The public passport view of a piece.
 *
 * Two non-negotiables are enforced here, in the shape of the type itself,
 * rather than by remembering not to render something:
 *
 *   - The internal id never leaves the database. It is not on this type, so
 *     it cannot reach a page, an API response or a log by accident.
 *   - Public pages never expose owner personal data. The owner is a handle
 *     and a display name. No email, no real name, no user id.
 *
 * The claim_hash is likewise absent. Everything on this type is safe to show
 * to anyone who scans the QR, which is exactly who will see it.
 */
export interface PublicOwner {
  handle: string;
  displayName: string;
}

export interface PublicEvent {
  seq: number;
  type: string;
  title: string;
  body: string | null;
  occurredAt: Date;
}

export interface PublicPassport {
  serial: string;
  qrToken: string;
  status: 'UNCLAIMED' | 'CLAIMED' | 'VOID' | 'RESERVED';
  verified: boolean;

  character: string;
  characterCode: string;
  series: string;
  rarity: string;
  editionType: EditionType;
  editionLabel: string;
  editionNumber: number | null;
  runSize: number;
  artworkUrl: string | null;

  productionYear: number;
  producedAt: Date;
  country: string;
  batchCode: string;

  owner: PublicOwner | null;
  events: PublicEvent[];
}

/**
 * The client is a parameter, defaulting to the shared singleton.
 *
 * Every other data function here takes its Prisma client explicitly, and this
 * one originally did not. That made it untestable: it silently queried
 * whatever DATABASE_URL pointed at rather than the database the caller was
 * using, so a privacy test could pass by finding nothing at all.
 */
export async function getPassportByToken(
  rawToken: string,
  client: PrismaClient = defaultPrisma,
): Promise<PublicPassport | null> {
  const token = parseQrToken(rawToken);
  if (!token) return null;

  const piece = await client.piece.findUnique({
    where: { qrToken: token },
    select: {
      // id is deliberately NOT selected.
      serial: true,
      qrToken: true,
      status: true,
      verified: true,
      editionNumber: true,
      productionYear: true,
      producedAt: true,
      country: true,
      product: {
        select: {
          character: true,
          characterCode: true,
          series: true,
          rarity: true,
          editionType: true,
          runSize: true,
          artworkUrl: true,
        },
      },
      batch: { select: { code: true } },
      passportEvents: {
        orderBy: { seq: 'asc' },
        select: { seq: true, type: true, title: true, body: true, occurredAt: true },
      },
      ownershipEvents: {
        orderBy: { seq: 'desc' },
        take: 1,
        select: {
          toCollector: {
            select: {
              displayName: true,
              publicProfile: true,
              user: { select: { handle: true } },
            },
          },
        },
      },
    },
  });

  if (!piece) return null;

  // Current ownership is derived from the latest ledger row, never from a
  // column on the piece. That is what makes the history permanent.
  const latest = piece.ownershipEvents[0]?.toCollector ?? null;

  return {
    serial: piece.serial,
    qrToken: piece.qrToken,
    status: piece.status,
    verified: piece.verified,

    character: piece.product.character,
    characterCode: piece.product.characterCode,
    series: piece.product.series,
    rarity: piece.product.rarity,
    editionType: piece.product.editionType as EditionType,
    editionLabel: EDITION_RANGES[piece.product.editionType as EditionType].label,
    editionNumber: piece.editionNumber ?? editionNumberForSerial(piece.serial),
    runSize: piece.product.runSize,
    artworkUrl: piece.product.artworkUrl,

    productionYear: piece.productionYear,
    producedAt: piece.producedAt,
    country: piece.country,
    batchCode: piece.batch.code,

    owner: latest
      ? {
          handle: latest.user.handle,
          // A collector who turned off their public profile still owns the
          // piece; the passport just does not name them.
          displayName: latest.publicProfile ? latest.displayName : latest.user.handle,
        }
      : null,
    events: piece.passportEvents,
  };
}

/**
 * Rarity tiers, ordered. Used for the colour token and for sorting.
 * Unknown values fall back to Common rather than throwing, because a product
 * row is admin-entered and must never be able to break a public page.
 */
export const RARITY_TIERS = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic'] as const;
export type Rarity = (typeof RARITY_TIERS)[number];

export function normaliseRarity(value: string): Rarity {
  const match = RARITY_TIERS.find((tier) => tier.toLowerCase() === value.trim().toLowerCase());
  return match ?? 'Common';
}
