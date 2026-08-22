/**
 * Serials.
 *
 * XX-NNNNNN. Two-letter character code, hyphen, six digits. The digit block
 * encodes the edition, so a Classic and a Limited Edition can never collide
 * no matter how the production plan changes.
 *
 *   0xxxxx  Classic
 *   1xxxxx  Limited Edition   (last three digits are the edition number)
 *   5xxxxx  Legendary         (last three digits are the edition number)
 *   8xxxxx  Spare / replacement
 *   9xxxxx  Artist Proof      (last three digits are the edition number)
 *
 * The 2-4 and 6-7 blocks are deliberately unallocated so a future edition
 * type has somewhere to live without disturbing anything already printed.
 */

export const EDITION_TYPES = [
  'CLASSIC',
  'LIMITED',
  'LEGENDARY',
  'SPARE',
  'ARTIST_PROOF',
] as const;

export type EditionType = (typeof EDITION_TYPES)[number];

export interface EditionRange {
  readonly min: number;
  readonly max: number;
  /**
   * Whether the last three digits are read as the edition position, as in
   * "45 / 777". When true, a run may not exceed 999 pieces, because at 1000
   * the printed serial would read as edition 000 and the rule silently breaks.
   */
  readonly editionNumbered: boolean;
  readonly label: string;
}

export const EDITION_RANGES: Record<EditionType, EditionRange> = {
  CLASSIC: { min: 1, max: 99_999, editionNumbered: false, label: 'Classic' },
  LIMITED: { min: 100_001, max: 199_999, editionNumbered: true, label: 'Limited Edition' },
  LEGENDARY: { min: 500_001, max: 599_999, editionNumbered: true, label: 'Legendary' },
  SPARE: { min: 800_001, max: 899_999, editionNumbered: false, label: 'Spare' },
  ARTIST_PROOF: { min: 900_001, max: 999_999, editionNumbered: true, label: 'Artist Proof' },
};

/** The ceiling imposed by "the last three digits are the edition number". */
export const MAX_EDITION_NUMBER = 999;

export const CHARACTER_CODES = {
  SP: 'Superman',
  BM: 'Batman',
  HQ: 'Harley Quinn',
  FL: 'The Flash',
  WW: 'Wonder Woman',
  JK: 'The Joker',
  SG: 'Supergirl',
  CY: 'Cyborg',
  RF: 'Reverse Flash',
  BZ: 'Bizarro',
  CH: 'Cheetah',
  RD: 'Riddler',
  GL: 'Green Lantern',
  DS: 'Deathstroke',
} as const;

export type CharacterCode = keyof typeof CHARACTER_CODES;

export class SerialRangeError extends Error {
  override name = 'SerialRangeError';
}

export function isCharacterCode(value: string): value is CharacterCode {
  return Object.hasOwn(CHARACTER_CODES, value);
}

export function characterName(code: string): string {
  if (!isCharacterCode(code)) {
    throw new SerialRangeError(`Unknown character code "${code}"`);
  }
  return CHARACTER_CODES[code];
}

export function formatSerial(characterCode: string, serialNumber: number): string {
  if (!Number.isInteger(serialNumber) || serialNumber < 0 || serialNumber > 999_999) {
    throw new SerialRangeError(`Serial number out of range: ${serialNumber}`);
  }
  return `${characterCode}-${String(serialNumber).padStart(6, '0')}`;
}

export interface ParsedSerial {
  characterCode: CharacterCode;
  number: number;
  editionType: EditionType | null;
}

const SERIAL_PATTERN = /^([A-Z]{2})-(\d{6})$/;

export function parseSerial(serial: string): ParsedSerial | null {
  const match = SERIAL_PATTERN.exec(serial);
  if (!match) return null;

  const [, code, digits] = match;
  if (!isCharacterCode(code!)) return null;

  const number = Number.parseInt(digits!, 10);
  return { characterCode: code, number, editionType: editionTypeForNumber(number) };
}

export function editionTypeForNumber(serialNumber: number): EditionType | null {
  for (const type of EDITION_TYPES) {
    const { min, max } = EDITION_RANGES[type];
    if (serialNumber >= min && serialNumber <= max) return type;
  }
  return null;
}

/**
 * The edition position as printed - "45" in "45 / 777" - or null for editions
 * that do not carry one.
 */
export function editionNumberForNumber(serialNumber: number): number | null {
  const type = editionTypeForNumber(serialNumber);
  if (!type) return null;
  const range = EDITION_RANGES[type];
  if (!range.editionNumbered) return null;

  const position = serialNumber - range.min + 1;
  if (position > MAX_EDITION_NUMBER) return null;
  return position;
}

export function editionNumberForSerial(serial: string): number | null {
  const parsed = parseSerial(serial);
  if (!parsed) return null;
  return editionNumberForNumber(parsed.number);
}

/**
 * Allocate a contiguous block of serial numbers inside one edition range.
 *
 * `startSequence` is 1-based within the edition: sequence 1 of CLASSIC is
 * 000001, sequence 1 of LIMITED is 100001. It never silently clamps and never
 * wraps into the next range - a batch that does not fit is an error, because
 * the alternative is a hologram printed with a serial that means the wrong
 * thing.
 */
export function allocateSerialNumbers(
  editionType: EditionType,
  startSequence: number,
  quantity: number,
): number[] {
  const range = EDITION_RANGES[editionType];
  if (!range) {
    throw new SerialRangeError(`Unknown edition type "${editionType}"`);
  }
  if (!Number.isInteger(startSequence) || startSequence < 1) {
    throw new SerialRangeError(
      `Start sequence must be a positive integer, received ${startSequence}`,
    );
  }
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new SerialRangeError(`Quantity must be a positive integer, received ${quantity}`);
  }

  const endSequence = startSequence + quantity - 1;

  if (range.editionNumbered && endSequence > MAX_EDITION_NUMBER) {
    throw new SerialRangeError(
      `${editionType} serials carry the edition number in their last three digits, ` +
        `so the run cannot pass ${MAX_EDITION_NUMBER}. This batch would reach ${endSequence}.`,
    );
  }

  const first = range.min + startSequence - 1;
  const last = range.min + endSequence - 1;

  if (last > range.max) {
    throw new SerialRangeError(
      `${editionType} range is ${range.min}-${range.max}. A batch of ${quantity} ` +
        `starting at sequence ${startSequence} would reach ${last} and cross into ` +
        `another edition's range.`,
    );
  }

  const numbers: number[] = new Array(quantity);
  for (let i = 0; i < quantity; i++) numbers[i] = first + i;
  return numbers;
}

export interface ProductionPlan {
  /** Pieces that will actually be sold. */
  sellable: number;
  /** Extra rows the press consumes as setup and waste. */
  overage: number;
  /** Rows that must appear in the factory file. */
  total: number;
}

/**
 * Work out how many rows the factory file needs.
 *
 * Variable-data presses eat data. The hologram manufacturer asked for 30% more
 * rows than the ordered quantity, because rejects during setup and inspection
 * consume rows that never become a sellable label. That is normal and the file
 * has to carry it.
 *
 * It is also why this function refuses overage on an edition-numbered run.
 *
 * For Classic, a scrapped label just leaves a hole in the sequence. The piece
 * number is an identifier, nobody was promised "N of 30,000", and the run
 * simply delivers whatever survives.
 *
 * For a Limited Edition of 777, a Legendary of 10 or an A/P of 100, the
 * numbering IS the product. There is exactly one 45/777 and it has to exist.
 * Feeding 1,010 rows to harvest 777 good ones produces a run with gaps, and no
 * software can repair that after printing. Those runs are small enough that the
 * factory must instead print the exact rows and reprint any individual reject,
 * with press-setup waste absorbed by the separate SPARE range.
 *
 * Encoding that as a hard error rather than a note in a document is deliberate.
 * The note gets skimmed; the error cannot be.
 */
export function planProduction(
  editionType: EditionType,
  sellable: number,
  overagePercent: number,
): ProductionPlan {
  if (!Number.isInteger(sellable) || sellable < 1) {
    throw new SerialRangeError(`Quantity must be a positive integer, received ${sellable}`);
  }
  if (!Number.isFinite(overagePercent) || overagePercent < 0 || overagePercent > 200) {
    throw new SerialRangeError(
      `Overage must be between 0 and 200 percent, received ${overagePercent}`,
    );
  }

  if (overagePercent > 0 && EDITION_RANGES[editionType].editionNumbered) {
    throw new SerialRangeError(
      `${editionType} serials carry their edition number in the last three digits, so ` +
        'the run cannot be over-generated. Printing extra rows to absorb waste would ' +
        'leave gaps in the numbered sequence, and there is no way to repair a missing ' +
        `${EDITION_RANGES[editionType].label} piece after the press has run. Print the ` +
        'exact rows, reprint any individual reject, and take press-setup waste from the ' +
        'SPARE range instead.',
    );
  }

  const overage = Math.ceil((sellable * overagePercent) / 100);
  return { sellable, overage, total: sellable + overage };
}

/** Inverse of allocateSerialNumbers: which 1-based position a serial holds. */
export function sequenceForNumber(editionType: EditionType, serialNumber: number): number {
  return serialNumber - EDITION_RANGES[editionType].min + 1;
}
