import QRCode from 'qrcode';
import type { BitMatrix } from './matrix.ts';

export type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

export interface EncodedQr {
  readonly payload: string;
  readonly matrix: BitMatrix;
  readonly version: number;
  readonly errorCorrectionLevel: ErrorCorrectionLevel;
  readonly maskPattern: number;
}

/**
 * Encode a payload to a module matrix.
 *
 * Error correction is a real physical trade-off here, not a default to
 * accept blindly. Our payload is 36 characters:
 *
 *   level M -> version 3, 29x29 modules
 *   level Q -> version 4, 33x33 modules
 *
 * On a fixed sticker footprint, version 3 gives modules about 14% larger than
 * version 4. Larger modules are what survives being printed on reflective
 * holographic foil, which is the actual failure mode in a shop. M is the
 * default for that reason, and it is exposed as a flag so it can be raised
 * after a physical print test rather than argued about in advance.
 */
export function encodeQr(
  payload: string,
  errorCorrectionLevel: ErrorCorrectionLevel = 'M',
): EncodedQr {
  const qr = QRCode.create(payload, { errorCorrectionLevel });

  return {
    payload,
    matrix: { size: qr.modules.size, data: Uint8Array.from(qr.modules.data) },
    version: qr.version,
    errorCorrectionLevel,
    maskPattern: qr.maskPattern ?? -1,
  };
}
