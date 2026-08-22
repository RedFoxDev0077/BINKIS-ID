import { getModule, versionForSize, type BitMatrix } from './matrix.ts';
import { isValidCodeword } from './galois.ts';
import {
  ALIGNMENT_CENTRES,
  ALPHANUMERIC_CHARSET,
  EC_LEVEL_BITS,
  MASK_FUNCTIONS,
  blockSpec,
  characterCountBits,
  totalCodewords,
} from './tables.ts';
import type { ErrorCorrectionLevel } from './encode.ts';

/**
 * A QR decoder, written from the specification.
 *
 * Requirement 5 of the batch generator is that every rendered QR is machine
 * decoded back to confirm it resolves to the intended URL. A round trip is
 * only evidence if the two directions are independent: encoding is done by the
 * `qrcode` library, and everything below - format information, masking, block
 * de-interleaving, Reed-Solomon verification, segment decoding - is
 * implemented here against ISO/IEC 18004. A bug in one side cannot cancel a
 * bug in the other.
 *
 * It detects corruption rather than correcting it. The input is artwork we
 * rendered seconds earlier; a non-zero Reed-Solomon syndrome means the render
 * or the SVG round trip damaged the symbol, and the right answer is to fail
 * the batch before it reaches a printing press in China.
 */

export class QrDecodeError extends Error {
  override name = 'QrDecodeError';
}

export interface DecodedQr {
  text: string;
  version: number;
  errorCorrectionLevel: ErrorCorrectionLevel;
  maskPattern: number;
}

export function decodeQr(matrix: BitMatrix): DecodedQr {
  const version = versionForSize(matrix.size);
  const { errorCorrectionLevel, maskPattern } = readFormatInformation(matrix);

  const reserved = buildFunctionPatternMap(matrix.size, version);
  const raw = readCodewords(matrix, reserved, version, errorCorrectionLevel, maskPattern);
  const data = deinterleaveAndVerify(raw, version, errorCorrectionLevel);
  const text = decodeSegments(data, version);

  return { text, version, errorCorrectionLevel, maskPattern };
}

// ---------------------------------------------------------------------------
// Format information: 5 data bits (2 EC level + 3 mask) protected by BCH(15,5)
// ---------------------------------------------------------------------------

const FORMAT_MASK = 0b101010000010010; // 0x5412
const FORMAT_GENERATOR = 0b10100110111; // 0x537

function validFormatWords(): number[] {
  const words: number[] = [];
  for (let data = 0; data < 32; data++) {
    let remainder = data << 10;
    for (let bit = 14; bit >= 10; bit--) {
      if (remainder & (1 << bit)) {
        remainder ^= FORMAT_GENERATOR << (bit - 10);
      }
    }
    words.push(((data << 10) | remainder) ^ FORMAT_MASK);
  }
  return words;
}

const FORMAT_WORDS = validFormatWords();

function readFormatInformation(matrix: BitMatrix): {
  errorCorrectionLevel: ErrorCorrectionLevel;
  maskPattern: number;
} {
  const size = matrix.size;

  // Copy 1, around the top-left finder.
  let first = 0;
  for (let i = 0; i <= 5; i++) first = (first << 1) | getModule(matrix, i, 8);
  first = (first << 1) | getModule(matrix, 7, 8);
  first = (first << 1) | getModule(matrix, 8, 8);
  first = (first << 1) | getModule(matrix, 8, 7);
  for (let j = 5; j >= 0; j--) first = (first << 1) | getModule(matrix, 8, j);

  // Copy 2, split between the bottom-left and top-right finders.
  let second = 0;
  for (let i = size - 1; i >= size - 7; i--) second = (second << 1) | getModule(matrix, i, 8);
  for (let j = size - 8; j <= size - 1; j++) second = (second << 1) | getModule(matrix, 8, j);

  const decoded = decodeFormatWord(first) ?? decodeFormatWord(second);
  if (decoded === null) {
    throw new QrDecodeError(
      'Neither copy of the format information is a valid BCH codeword. ' +
        'The symbol is not a readable QR code.',
    );
  }
  return decoded;
}

function decodeFormatWord(word: number): {
  errorCorrectionLevel: ErrorCorrectionLevel;
  maskPattern: number;
} | null {
  for (const candidate of FORMAT_WORDS) {
    if (candidate !== word) continue;
    const unmasked = (word ^ FORMAT_MASK) >> 10;
    const level = EC_LEVEL_BITS[(unmasked >> 3) & 0b11];
    if (!level) return null;
    return { errorCorrectionLevel: level, maskPattern: unmasked & 0b111 };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Function patterns
// ---------------------------------------------------------------------------

function buildFunctionPatternMap(size: number, version: number): Uint8Array {
  const reserved = new Uint8Array(size * size);
  const mark = (row: number, col: number) => {
    if (row >= 0 && col >= 0 && row < size && col < size) reserved[row * size + col] = 1;
  };

  // Three corner regions, each covering a finder pattern, its separator, and
  // the format information strip that runs alongside it. The dark module at
  // (size-8, 8) falls inside the bottom-left region.
  const markRegion = (rowFrom: number, rowTo: number, colFrom: number, colTo: number) => {
    for (let r = rowFrom; r <= rowTo; r++) {
      for (let c = colFrom; c <= colTo; c++) mark(r, c);
    }
  };
  markRegion(0, 8, 0, 8); // top-left finder + separator + format
  markRegion(0, 8, size - 8, size - 1); // top-right finder + separator + format
  markRegion(size - 8, size - 1, 0, 8); // bottom-left finder + separator + format

  // Timing patterns.
  for (let i = 0; i < size; i++) {
    mark(6, i);
    mark(i, 6);
  }

  // Alignment patterns, skipping the three that would sit on a finder.
  const centres = ALIGNMENT_CENTRES[version] ?? [];
  for (const rowCentre of centres) {
    for (const colCentre of centres) {
      const onFinder =
        (rowCentre === 6 && colCentre === 6) ||
        (rowCentre === 6 && colCentre === size - 7) ||
        (rowCentre === size - 7 && colCentre === 6);
      if (onFinder) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) mark(rowCentre + dr, colCentre + dc);
      }
    }
  }

  // Dark module.
  mark(size - 8, 8);

  // Version information, versions 7 and above.
  if (version >= 7) {
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        mark(i, size - 11 + j);
        mark(size - 11 + j, i);
      }
    }
  }

  return reserved;
}

// ---------------------------------------------------------------------------
// Codeword extraction
// ---------------------------------------------------------------------------

function readCodewords(
  matrix: BitMatrix,
  reserved: Uint8Array,
  version: number,
  level: ErrorCorrectionLevel,
  maskPattern: number,
): Uint8Array {
  const size = matrix.size;
  const unmask = MASK_FUNCTIONS[maskPattern];
  if (!unmask) throw new QrDecodeError(`Invalid mask pattern ${maskPattern}`);

  const expected = totalCodewords(version, level);
  const out = new Uint8Array(expected);
  let byteIndex = 0;
  let bitCount = 0;
  let current = 0;
  let upward = true;

  for (let col = size - 1; col > 0; col -= 2) {
    // Column 6 is the vertical timing pattern and is not part of a strip.
    if (col === 6) col--;

    for (let i = 0; i < size; i++) {
      const row = upward ? size - 1 - i : i;
      for (let offset = 0; offset < 2; offset++) {
        const c = col - offset;
        if (reserved[row * size + c]) continue;

        let bit = getModule(matrix, row, c);
        if (unmask(row, c)) bit ^= 1;

        current = (current << 1) | bit;
        bitCount++;
        if (bitCount === 8) {
          if (byteIndex < expected) out[byteIndex++] = current;
          current = 0;
          bitCount = 0;
        }
      }
    }
    upward = !upward;
  }

  if (byteIndex < expected) {
    throw new QrDecodeError(
      `Read only ${byteIndex} of ${expected} codewords. The symbol is truncated.`,
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// Block de-interleaving and Reed-Solomon verification
// ---------------------------------------------------------------------------

function deinterleaveAndVerify(
  raw: Uint8Array,
  version: number,
  level: ErrorCorrectionLevel,
): Uint8Array {
  const [ecCount, blocks1, data1, blocks2, data2] = blockSpec(version, level);

  const blocks: Array<{ data: number[]; ec: number[] }> = [];
  for (let i = 0; i < blocks1; i++) blocks.push({ data: [], ec: [] });
  for (let i = 0; i < blocks2; i++) blocks.push({ data: [], ec: [] });

  const dataCounts = [
    ...Array<number>(blocks1).fill(data1),
    ...Array<number>(blocks2).fill(data2),
  ];

  let cursor = 0;
  const maxData = Math.max(data1, blocks2 > 0 ? data2 : 0);
  for (let i = 0; i < maxData; i++) {
    for (let b = 0; b < blocks.length; b++) {
      if (i < dataCounts[b]!) blocks[b]!.data.push(raw[cursor++]!);
    }
  }
  for (let i = 0; i < ecCount; i++) {
    for (const block of blocks) block.ec.push(raw[cursor++]!);
  }

  for (const [index, block] of blocks.entries()) {
    const codeword = Uint8Array.from([...block.data, ...block.ec]);
    if (!isValidCodeword(codeword, ecCount)) {
      throw new QrDecodeError(
        `Reed-Solomon check failed on block ${index + 1} of ${blocks.length}. ` +
          'The rendered symbol does not carry intact data.',
      );
    }
  }

  const out: number[] = [];
  for (const block of blocks) out.push(...block.data);
  return Uint8Array.from(out);
}

// ---------------------------------------------------------------------------
// Segment decoding
// ---------------------------------------------------------------------------

class BitReader {
  private position = 0;
  private readonly bytes: Uint8Array;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  get remaining(): number {
    return this.bytes.length * 8 - this.position;
  }

  read(count: number): number {
    if (count > this.remaining) {
      throw new QrDecodeError('Ran off the end of the data stream');
    }
    let value = 0;
    for (let i = 0; i < count; i++) {
      const byte = this.bytes[(this.position + i) >> 3]!;
      const bit = (byte >> (7 - ((this.position + i) & 7))) & 1;
      value = (value << 1) | bit;
    }
    this.position += count;
    return value;
  }
}

type Segment = { kind: 'bytes'; bytes: number[] } | { kind: 'text'; text: string };

/**
 * A single payload is routinely split across several segments in different
 * modes - an encoder will switch to alphanumeric for a run of uppercase and
 * digits and back to byte mode for the rest, because it is cheaper. Segments
 * must be reassembled in the order they appear, and adjacent byte segments
 * must be UTF-8 decoded together rather than one at a time.
 */
function decodeSegments(data: Uint8Array, version: number): string {
  const reader = new BitReader(data);
  const segments: Segment[] = [];

  const pushBytes = (values: number[]) => {
    const last = segments.at(-1);
    if (last?.kind === 'bytes') last.bytes.push(...values);
    else segments.push({ kind: 'bytes', bytes: values });
  };

  while (reader.remaining >= 4) {
    const mode = reader.read(4);
    if (mode === 0b0000) break; // terminator

    const count = reader.read(characterCountBits(version, mode));

    switch (mode) {
      case 0b0100: {
        const values: number[] = [];
        for (let i = 0; i < count; i++) values.push(reader.read(8));
        pushBytes(values);
        break;
      }
      case 0b0010: {
        let out = '';
        let i = 0;
        for (; i + 1 < count; i += 2) {
          const pair = reader.read(11);
          out += ALPHANUMERIC_CHARSET[Math.floor(pair / 45)];
          out += ALPHANUMERIC_CHARSET[pair % 45];
        }
        if (i < count) out += ALPHANUMERIC_CHARSET[reader.read(6)];
        segments.push({ kind: 'text', text: out });
        break;
      }
      case 0b0001: {
        let out = '';
        let i = 0;
        for (; i + 2 < count; i += 3) out += String(reader.read(10)).padStart(3, '0');
        if (count - i === 2) out += String(reader.read(7)).padStart(2, '0');
        else if (count - i === 1) out += String(reader.read(4));
        segments.push({ kind: 'text', text: out });
        break;
      }
      default:
        throw new QrDecodeError(
          `Mode 0b${mode.toString(2).padStart(4, '0')} is not supported by this decoder`,
        );
    }
  }

  const decoder = new TextDecoder('utf-8', { fatal: true });
  return segments
    .map((segment) =>
      segment.kind === 'text' ? segment.text : decoder.decode(Uint8Array.from(segment.bytes)),
    )
    .join('');
}
