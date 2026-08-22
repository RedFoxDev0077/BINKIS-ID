/** A square grid of QR modules. 1 is dark, 0 is light. */
export interface BitMatrix {
  readonly size: number;
  readonly data: Uint8Array;
}

export function createMatrix(size: number): BitMatrix {
  return { size, data: new Uint8Array(size * size) };
}

export function getModule(matrix: BitMatrix, row: number, col: number): number {
  if (row < 0 || col < 0 || row >= matrix.size || col >= matrix.size) return 0;
  return matrix.data[row * matrix.size + col]!;
}

export function setModule(matrix: BitMatrix, row: number, col: number, value: number): void {
  matrix.data[row * matrix.size + col] = value ? 1 : 0;
}

/** QR symbol sizes are 21, 25, 29 ... 177, i.e. 17 + 4 * version. */
export function versionForSize(size: number): number {
  if ((size - 17) % 4 !== 0) {
    throw new Error(`${size} is not a valid QR symbol size`);
  }
  const version = (size - 17) / 4;
  if (version < 1 || version > 40) {
    throw new Error(`${size} maps to QR version ${version}, which does not exist`);
  }
  return version;
}

export function matricesEqual(a: BitMatrix, b: BitMatrix): boolean {
  if (a.size !== b.size) return false;
  for (let i = 0; i < a.data.length; i++) {
    if (a.data[i] !== b.data[i]) return false;
  }
  return true;
}
