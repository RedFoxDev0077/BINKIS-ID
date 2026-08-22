import type { ErrorCorrectionLevel } from './encode.ts';

/**
 * Reed-Solomon block structure, from ISO/IEC 18004 table 9.
 *
 * [ecCodewordsPerBlock, blocksInGroup1, dataCodewordsInGroup1,
 *  blocksInGroup2, dataCodewordsInGroup2]
 *
 * Populated for versions 1-20. A BINKIS payload
 * (https://id.binkis.com/p/{12 chars} = 36 bytes) is version 3 at level M or
 * version 4 at level Q, so this covers the production case many times over,
 * and the decoder fails loudly rather than silently above version 20.
 */
export type BlockSpec = readonly [number, number, number, number, number];

export const MAX_SUPPORTED_VERSION = 20;

const T: Record<number, Record<ErrorCorrectionLevel, BlockSpec>> = {
  1: { L: [7, 1, 19, 0, 0], M: [10, 1, 16, 0, 0], Q: [13, 1, 13, 0, 0], H: [17, 1, 9, 0, 0] },
  2: { L: [10, 1, 34, 0, 0], M: [16, 1, 28, 0, 0], Q: [22, 1, 22, 0, 0], H: [28, 1, 16, 0, 0] },
  3: { L: [15, 1, 55, 0, 0], M: [26, 1, 44, 0, 0], Q: [18, 2, 17, 0, 0], H: [22, 2, 13, 0, 0] },
  4: { L: [20, 1, 80, 0, 0], M: [18, 2, 32, 0, 0], Q: [26, 2, 24, 0, 0], H: [16, 4, 9, 0, 0] },
  5: { L: [26, 1, 108, 0, 0], M: [24, 2, 43, 0, 0], Q: [18, 2, 15, 2, 16], H: [22, 2, 11, 2, 12] },
  6: { L: [18, 2, 68, 0, 0], M: [16, 4, 27, 0, 0], Q: [24, 4, 19, 0, 0], H: [28, 4, 15, 0, 0] },
  7: { L: [20, 2, 78, 0, 0], M: [18, 4, 31, 0, 0], Q: [18, 2, 14, 4, 15], H: [26, 4, 13, 1, 14] },
  8: { L: [24, 2, 97, 0, 0], M: [22, 2, 38, 2, 39], Q: [22, 4, 18, 2, 19], H: [26, 4, 14, 2, 15] },
  9: { L: [30, 2, 116, 0, 0], M: [22, 3, 36, 2, 37], Q: [20, 4, 16, 4, 17], H: [24, 4, 12, 4, 13] },
  10: { L: [18, 2, 68, 2, 69], M: [26, 4, 43, 1, 44], Q: [24, 6, 19, 2, 20], H: [28, 6, 15, 2, 16] },
  11: { L: [20, 4, 81, 0, 0], M: [30, 1, 50, 4, 51], Q: [28, 4, 22, 4, 23], H: [24, 3, 12, 8, 13] },
  12: { L: [24, 2, 92, 2, 93], M: [22, 6, 36, 2, 37], Q: [26, 4, 20, 6, 21], H: [28, 7, 14, 4, 15] },
  13: { L: [26, 4, 107, 0, 0], M: [22, 8, 37, 1, 38], Q: [24, 8, 20, 4, 21], H: [22, 12, 11, 4, 12] },
  14: { L: [30, 3, 115, 1, 116], M: [24, 4, 40, 5, 41], Q: [20, 11, 16, 5, 17], H: [24, 11, 12, 5, 13] },
  15: { L: [22, 5, 87, 1, 88], M: [24, 5, 41, 5, 42], Q: [30, 5, 24, 7, 25], H: [24, 11, 12, 7, 13] },
  16: { L: [24, 5, 98, 1, 99], M: [28, 7, 45, 3, 46], Q: [24, 15, 19, 2, 20], H: [30, 3, 15, 13, 16] },
  17: { L: [28, 1, 107, 5, 108], M: [28, 10, 46, 1, 47], Q: [28, 1, 22, 15, 23], H: [28, 2, 14, 17, 15] },
  18: { L: [30, 5, 120, 1, 121], M: [26, 9, 43, 4, 44], Q: [28, 17, 22, 1, 23], H: [28, 2, 14, 19, 15] },
  19: { L: [28, 3, 113, 4, 114], M: [26, 3, 44, 11, 45], Q: [26, 17, 21, 4, 22], H: [26, 9, 13, 16, 14] },
  20: { L: [28, 3, 107, 5, 108], M: [26, 3, 41, 13, 42], Q: [30, 15, 24, 5, 25], H: [28, 15, 15, 10, 16] },
};

export function blockSpec(version: number, level: ErrorCorrectionLevel): BlockSpec {
  const forVersion = T[version];
  if (!forVersion) {
    throw new Error(
      `QR version ${version} is outside the range this decoder supports ` +
        `(1-${MAX_SUPPORTED_VERSION}).`,
    );
  }
  return forVersion[level];
}

export function totalCodewords(version: number, level: ErrorCorrectionLevel): number {
  const [ec, blocks1, data1, blocks2, data2] = blockSpec(version, level);
  return blocks1 * (data1 + ec) + blocks2 * (data2 + ec);
}

/** Alignment pattern centre coordinates, ISO/IEC 18004 table E.1. */
export const ALIGNMENT_CENTRES: Record<number, readonly number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
  11: [6, 30, 54],
  12: [6, 32, 58],
  13: [6, 34, 62],
  14: [6, 26, 46, 66],
  15: [6, 26, 48, 70],
  16: [6, 26, 50, 74],
  17: [6, 30, 54, 78],
  18: [6, 30, 56, 82],
  19: [6, 30, 58, 86],
  20: [6, 34, 62, 90],
};

/** Format-information EC level bits, ISO/IEC 18004 table 12. */
export const EC_LEVEL_BITS: Record<number, ErrorCorrectionLevel> = {
  0b01: 'L',
  0b00: 'M',
  0b11: 'Q',
  0b10: 'H',
};

export const MASK_FUNCTIONS: ReadonlyArray<(row: number, col: number) => boolean> = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

export const ALPHANUMERIC_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

/** Character-count indicator width, ISO/IEC 18004 table 3. */
export function characterCountBits(version: number, mode: number): number {
  const band = version <= 9 ? 0 : version <= 26 ? 1 : 2;
  switch (mode) {
    case 0b0001:
      return [10, 12, 14][band]!;
    case 0b0010:
      return [9, 11, 13][band]!;
    case 0b0100:
      return [8, 16, 16][band]!;
    case 0b1000:
      return [8, 10, 12][band]!;
    default:
      throw new Error(`Unsupported QR mode indicator 0b${mode.toString(2).padStart(4, '0')}`);
  }
}
