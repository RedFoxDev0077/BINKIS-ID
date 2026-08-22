import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { encodeQr, type ErrorCorrectionLevel } from '../qr/encode.ts';
import { renderQrSvg, parseQrSvg } from '../qr/svg.ts';
import { decodeQr } from '../qr/decode.ts';
import { qrPayload } from '../codes/qr-token.ts';
import type { GeneratedPiece } from '../generator.ts';

/**
 * Requirement 5: render every QR to SVG and machine-decode it back to confirm
 * it resolves to the intended URL.
 *
 * Deliberately not a spot check. Every single piece is rendered, written to
 * disk, read back off disk, re-parsed into a module grid geometrically, and
 * decoded by an independent implementation. The file on disk is the thing the
 * factory prints, so the file on disk is the thing that gets verified - not
 * the in-memory matrix it came from.
 */

export interface QrVerificationOptions {
  origin: string;
  errorCorrectionLevel?: ErrorCorrectionLevel;
  outputDir: string;
  moduleSize?: number;
  quietZone?: number;
  onProgress?: (completed: number, total: number) => void;
}

export interface QrVerificationResult {
  verified: number;
  outputDir: string;
  version: number;
  symbolSize: number;
  errorCorrectionLevel: ErrorCorrectionLevel;
}

export class QrVerificationError extends Error {
  override name = 'QrVerificationError';
}

export async function renderAndVerifyQrCodes(
  pieces: readonly GeneratedPiece[],
  options: QrVerificationOptions,
): Promise<QrVerificationResult> {
  const {
    origin,
    errorCorrectionLevel = 'M',
    outputDir,
    moduleSize = 8,
    quietZone = 4,
    onProgress,
  } = options;

  await mkdir(outputDir, { recursive: true });

  let version = 0;
  let symbolSize = 0;

  for (const [index, piece] of pieces.entries()) {
    const expected = qrPayload(piece.qrToken, origin);

    const encoded = encodeQr(expected, errorCorrectionLevel);
    const svg = renderQrSvg(encoded.matrix, {
      moduleSize,
      quietZone,
      title: piece.serial,
    });

    const path = join(outputDir, `${piece.serial}.svg`);
    await writeFile(path, svg, 'utf8');

    // Read it back off disk. Anything that goes wrong between here and the
    // press - a truncated write, a bad encoding - shows up now.
    const fromDisk = await readFile(path, 'utf8');

    let decoded;
    try {
      decoded = decodeQr(parseQrSvg(fromDisk));
    } catch (error) {
      throw new QrVerificationError(
        `${piece.serial}: rendered QR could not be decoded (${(error as Error).message})`,
      );
    }

    if (decoded.text !== expected) {
      throw new QrVerificationError(
        `${piece.serial}: QR decodes to "${decoded.text}" but should resolve to "${expected}"`,
      );
    }
    if (!decoded.text.endsWith(`/p/${piece.qrToken}`)) {
      throw new QrVerificationError(
        `${piece.serial}: decoded URL does not end in this piece's token`,
      );
    }

    if (version === 0) {
      version = decoded.version;
      symbolSize = encoded.matrix.size;
    } else if (decoded.version !== version) {
      // Every payload in a batch is the same length, so every symbol must be
      // the same version. A different one means a different module size on a
      // sticker that is physically identical, which is a print defect.
      throw new QrVerificationError(
        `${piece.serial}: QR is version ${decoded.version}; the rest of the batch is version ${version}`,
      );
    }

    onProgress?.(index + 1, pieces.length);
  }

  return {
    verified: pieces.length,
    outputDir,
    version,
    symbolSize,
    errorCorrectionLevel,
  };
}
