import { Prisma, type PrismaClient } from '@prisma/client';
import { generateClaimCode, generateQrToken } from './codes/mint.ts';
import { cryptoRandom, type RandomSource } from './codes/random.ts';
import { hashClaimCode } from './hash.ts';
import {
  allocateSerialNumbers,
  editionNumberForNumber,
  formatSerial,
  parseSerial,
  sequenceForNumber,
  type EditionType,
} from './serial.ts';

/**
 * A generated piece, as it exists in memory during a batch run.
 *
 * `claimCode` is plaintext. This object is the only place it will ever exist
 * outside the encrypted factory export, and it must not be logged, persisted,
 * or returned across a process boundary.
 *
 * Note what is absent: the internal database id. The generator does not hand
 * it out, so it cannot leak into the export by accident.
 */
export interface GeneratedPiece {
  serial: string;
  qrToken: string;
  claimCode: string;
  claimHash: string;
  editionNumber: number | null;
}

export interface GenerateOptions {
  prisma: PrismaClient;
  batchCode: string;
  quantity: number;
  pepper: string;
  producedAt: Date;
  country: string;
  /** 1-based position within the edition range. Defaults to the next free one. */
  startSequence?: number;
  rng?: RandomSource;
  onProgress?: (completed: number, total: number) => void;
}

export class GenerationError extends Error {
  override name = 'GenerationError';
}

/** How many times a single piece may redraw before we call the RNG broken. */
const MAX_REDRAWS = 20;

const INSERT_CHUNK = 1_000;

export async function generatePieces(options: GenerateOptions): Promise<GeneratedPiece[]> {
  const {
    prisma,
    batchCode,
    quantity,
    pepper,
    producedAt,
    country,
    startSequence,
    rng = cryptoRandom,
    onProgress,
  } = options;

  const batch = await prisma.batch.findUnique({
    where: { code: batchCode },
    include: { product: true },
  });
  if (!batch) {
    throw new GenerationError(`No batch with code "${batchCode}"`);
  }

  // Non-negotiable 7: generated production data is immutable. Once a batch has
  // been exported for printing its serials, tokens and hashes are frozen.
  if (batch.checksum || batch.status === 'EXPORTED' || batch.status === 'PRINTED') {
    throw new GenerationError(
      `Batch ${batchCode} has already been exported for printing (status ${batch.status}). ` +
        'Regenerating it would invalidate physical stock. Create a new batch instead.',
    );
  }

  const existing = await prisma.piece.count({ where: { batchId: batch.id } });
  if (existing > 0) {
    throw new GenerationError(
      `Batch ${batchCode} already holds ${existing} pieces. Regeneration is not a feature.`,
    );
  }

  if (quantity > batch.quantity) {
    throw new GenerationError(
      `Batch ${batchCode} is declared as ${batch.quantity} pieces; asked to generate ${quantity}.`,
    );
  }

  const editionType = batch.product.editionType as EditionType;
  const characterCode = batch.product.characterCode;

  const from = startSequence ?? (await nextFreeSequence(prisma, characterCode, editionType));
  const serialNumbers = allocateSerialNumbers(editionType, from, quantity);

  const productionYear = producedAt.getUTCFullYear();

  const pieces: GeneratedPiece[] = serialNumbers.map((number) => {
    const claimCode = generateClaimCode(rng);
    return {
      serial: formatSerial(characterCode, number),
      qrToken: generateQrToken(rng),
      claimCode,
      claimHash: hashClaimCode(claimCode, pepper),
      editionNumber: editionNumberForNumber(number),
    };
  });

  const rowFor = (piece: GeneratedPiece) => ({
    serial: piece.serial,
    qrToken: piece.qrToken,
    claimHash: piece.claimHash,
    productId: batch.productId,
    batchId: batch.id,
    editionNumber: piece.editionNumber,
    productionYear,
    producedAt,
    country,
  });

  // Uniqueness is enforced by the unique indexes on serial, qr_token and
  // claim_hash. There is deliberately no "SELECT ... WHERE token = ?" before
  // the insert: a pre-check is a race, and it would also mean the constraint
  // was never actually exercised on the path that matters.
  let completed = 0;
  for (let offset = 0; offset < pieces.length; offset += INSERT_CHUNK) {
    const chunk = pieces.slice(offset, offset + INSERT_CHUNK);
    try {
      await prisma.piece.createMany({ data: chunk.map(rowFor) });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Somewhere in this chunk two values collided, or collided with an
      // existing row. Fall back to one insert at a time so the offender can be
      // redrawn without discarding the rest.
      for (const piece of chunk) {
        await insertWithRedraw(prisma, piece, rowFor, pepper, rng);
      }
    }
    completed += chunk.length;
    onProgress?.(completed, pieces.length);
  }

  return pieces;
}

type RowBuilder = (piece: GeneratedPiece) => Prisma.PieceUncheckedCreateInput;

async function insertWithRedraw(
  prisma: PrismaClient,
  piece: GeneratedPiece,
  rowFor: RowBuilder,
  pepper: string,
  rng: RandomSource,
): Promise<void> {
  for (let attempt = 1; attempt <= MAX_REDRAWS; attempt++) {
    try {
      await prisma.piece.create({ data: rowFor(piece) });
      return;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const fields = violatedFields(error);

      // A serial collision is not a random-draw problem. It means the range
      // this batch was allocated is already occupied, which is a planning
      // error, and redrawing would silently print a duplicate serial.
      if (fields.includes('serial')) {
        throw new GenerationError(
          `Serial ${piece.serial} already exists. The requested range overlaps ` +
            'pieces that have already been generated. Refusing to continue.',
        );
      }

      if (fields.includes('qr_token')) {
        piece.qrToken = generateQrToken(rng);
      }
      if (fields.includes('claim_hash')) {
        piece.claimCode = generateClaimCode(rng);
        piece.claimHash = hashClaimCode(piece.claimCode, pepper);
      }
      if (fields.length === 0) {
        // Unique violation we cannot attribute - redraw both rather than guess.
        piece.qrToken = generateQrToken(rng);
        piece.claimCode = generateClaimCode(rng);
        piece.claimHash = hashClaimCode(piece.claimCode, pepper);
      }
    }
  }

  throw new GenerationError(
    `Gave up on ${piece.serial} after ${MAX_REDRAWS} collisions. The random source ` +
      'is not producing distinct values. Refusing to emit a batch rather than risk ' +
      'two pieces sharing a claim code.',
  );
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function violatedFields(error: unknown): string[] {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return [];
  const target = error.meta?.target;
  if (Array.isArray(target)) return target.map(String);
  if (typeof target === 'string') return [target];
  return [];
}

/** The next unused 1-based position for a character within an edition range. */
export async function nextFreeSequence(
  prisma: PrismaClient,
  characterCode: string,
  editionType: EditionType,
): Promise<number> {
  const last = await prisma.piece.findFirst({
    where: { product: { characterCode, editionType } },
    orderBy: { serial: 'desc' },
    select: { serial: true },
  });
  if (!last) return 1;

  const parsed = parseSerial(last.serial);
  if (!parsed) {
    throw new GenerationError(`Existing serial "${last.serial}" is unparseable`);
  }
  return sequenceForNumber(editionType, parsed.number) + 1;
}
