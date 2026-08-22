/**
 * GF(256) arithmetic for QR Reed-Solomon, primitive polynomial x^8+x^4+x^3+x^2+1
 * (0x11D), as specified by ISO/IEC 18004.
 */

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);

{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]!;
}

export function gfMultiply(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a]! + LOG[b]!]!;
}

export function gfExp(power: number): number {
  return EXP[((power % 255) + 255) % 255]!;
}

/**
 * Reed-Solomon syndromes for a codeword block.
 *
 * QR uses a generator whose roots are alpha^0 .. alpha^(ecCount-1). Every
 * syndrome is zero if and only if the block is a valid codeword. We only need
 * detection, not correction: this runs against artwork we just rendered
 * ourselves, so any non-zero syndrome means the render or the SVG round-trip
 * corrupted the symbol, and the correct response is to fail the batch, not to
 * quietly repair it.
 */
export function syndromes(codewords: Uint8Array, ecCount: number): number[] {
  const result: number[] = [];
  for (let j = 0; j < ecCount; j++) {
    let value = 0;
    for (const cw of codewords) {
      value = gfMultiply(value, gfExp(j)) ^ cw;
    }
    result.push(value);
  }
  return result;
}

export function isValidCodeword(codewords: Uint8Array, ecCount: number): boolean {
  return syndromes(codewords, ecCount).every((s) => s === 0);
}
