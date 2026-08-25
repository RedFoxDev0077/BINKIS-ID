import { PrismaClient } from '@prisma/client';
import { claimPiece } from '../db/claim.ts';
import type { GeneratedPiece } from '../generator.ts';
import type { EditionType } from '../serial.ts';

/**
 * Requirement 6: programmatically claim every generated code against a staging
 * database, assert each resolves to the correct piece, then reset.
 *
 * This is the rehearsal that catches the failure nobody wants to discover
 * after 134,399 stickers exist: a code that does not open the piece it was
 * printed on. It runs against a separate staging database, never against the
 * live registry - a piece in production must be claimed by its owner, not by
 * this script.
 *
 * The staging database is wiped before the run and wiped again after it, so it
 * never retains claim hashes.
 */

export interface StagingOptions {
  stagingUrl: string;
  pepper: string;
  characterCode: string;
  character: string;
  editionType: EditionType;
  batchCode: string;
  producedAt: Date;
  country: string;
  concurrency?: number;
  onProgress?: (completed: number, total: number) => void;
}

export interface StagingResult {
  claimed: number;
  ownershipRows: number;
  passportRows: number;
}

export class StagingVerificationError extends Error {
  override name = 'StagingVerificationError';
}

export async function rehearseClaims(
  pieces: readonly GeneratedPiece[],
  options: StagingOptions,
): Promise<StagingResult> {
  const { stagingUrl, pepper, concurrency = 8, onProgress } = options;

  // Every claim holds a connection for the length of its transaction, so the
  // pool has to be wider than the number of workers or they deadlock waiting
  // on each other. Prisma's default is (cores * 2 + 1), which is not related
  // to our concurrency and starves as soon as the two numbers cross.
  const url = new URL(stagingUrl);
  url.searchParams.set('connection_limit', String(concurrency * 2 + 4));
  url.searchParams.set('pool_timeout', '60');

  const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });

  try {
    await wipe(prisma);

    const product = await prisma.product.create({
      data: {
        character: options.character,
        characterCode: options.characterCode,
        editionType: options.editionType,
        series: 'staging-rehearsal',
        rarity: 'staging',
        runSize: pieces.length,
      },
    });
    const batch = await prisma.batch.create({
      data: {
        code: options.batchCode,
        productId: product.id,
        quantity: pieces.length,
        status: 'GENERATED',
      },
    });

    // Mirror the batch. Same serials, same tokens, same hashes - so a claim
    // here exercises exactly the rows that will exist in production.
    await prisma.piece.createMany({
      data: pieces.map((piece) => ({
        serial: piece.serial,
        qrToken: piece.qrToken,
        claimHash: piece.claimHash,
        productId: product.id,
        batchId: batch.id,
        editionNumber: piece.editionNumber,
        productionYear: options.producedAt.getUTCFullYear(),
        producedAt: options.producedAt,
        country: options.country,
      })),
    });

    const user = await prisma.user.create({
      data: {
        email: 'rehearsal@staging.invalid',
        handle: 'staging-rehearsal',
        passwordHash: 'not-a-real-account',
      },
    });
    const collector = await prisma.collectorId.create({
      data: { userId: user.id, displayName: 'Staging Rehearsal', publicProfile: false },
    });

    let completed = 0;
    const queue = [...pieces];

    const worker = async () => {
      for (;;) {
        const piece = queue.shift();
        if (!piece) return;

        const outcome = await claimPiece(prisma, {
          qrToken: piece.qrToken,
          submittedCode: piece.claimCode,
          collectorId: collector.id,
          pepper,
          ip: '127.0.0.1',
          // The rehearsal claims every code in the batch from one address on
          // purpose, against a throwaway database. Rate limiting it would be
          // rate limiting ourselves.
          skipRateLimit: true,
          // A collector tapping CLAIM should fail fast; this rehearsal should
          // not. It drives every piece in the batch through a shared pool as
          // hard as it can, so queueing behind other workers is expected and
          // must not be mistaken for a bad code.
          transaction: { maxWait: 120_000, timeout: 120_000 },
        });

        if (!outcome.ok) {
          throw new StagingVerificationError(
            `${piece.serial}: its own claim code was rejected. This code would be ` +
              'printed on a sticker that can never be claimed.',
          );
        }
        // The code must open its own piece, not merely some piece.
        if (outcome.serial !== piece.serial) {
          throw new StagingVerificationError(
            `${piece.serial}: claim code resolved to ${outcome.serial} instead. ` +
              'Two pieces are cross-wired.',
          );
        }
        if (outcome.qrToken !== piece.qrToken) {
          throw new StagingVerificationError(
            `${piece.serial}: claim resolved to QR token ${outcome.qrToken}, expected ${piece.qrToken}`,
          );
        }

        onProgress?.(++completed, pieces.length);
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(concurrency, pieces.length) }, () => worker()),
    );

    const claimedCount = await prisma.piece.count({ where: { status: 'CLAIMED' } });
    const ownershipRows = await prisma.ownershipEvent.count();
    const passportRows = await prisma.passportEvent.count({ where: { type: 'CLAIMED' } });

    if (claimedCount !== pieces.length) {
      throw new StagingVerificationError(
        `${claimedCount} of ${pieces.length} pieces ended up claimed`,
      );
    }
    if (ownershipRows !== pieces.length) {
      throw new StagingVerificationError(
        `Expected exactly ${pieces.length} ownership rows, found ${ownershipRows}`,
      );
    }
    if (passportRows !== pieces.length) {
      throw new StagingVerificationError(
        `Expected exactly ${pieces.length} CLAIMED passport events, found ${passportRows}`,
      );
    }

    return { claimed: claimedCount, ownershipRows, passportRows };
  } finally {
    // Reset, whether the rehearsal passed or failed. Staging must not be left
    // holding claim hashes for a production batch.
    await wipe(prisma).catch(() => {});
    await prisma.$disconnect();
  }
}

async function wipe(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      passport_events, ownership_events, claim_attempts, audit_logs,
      pieces, batches, products, collector_ids, users
    RESTART IDENTITY CASCADE
  `);
}
