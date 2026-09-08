/**
 * Serials.
 *
 * Two forms, and the rule between them is one sentence: all digits means
 * Classic, a letter means a special edition.
 *
 *   SP-000001   Classic, XX-NNNNNN, six digits
 *   BZ-V01427   Variant piece 1427, XX-LNNNNN, edition letter then position
 *
 * The letter form was adopted on 30 August 2026, at the client's request and
 * before any special edition was printed. BZ-201427 reads as "two hundred and
 * one thousand" for a run of 2,777, which is nonsense to the person holding
 * it: the leading digit was doing a machine's job in the one place only humans
 * look. Classic keeps its six digits because a piece with no edition position
 * has nothing to show, and because SP-000001 to SP-000400 are already at the
 * factory.
 *
 * Internally nothing changed. Every serial is still a number in an edition
 * range, and all the allocation and edition arithmetic below is untouched;
 * only how that number is written down and read back.
 *
 *   0xxxxx  Classic
 *   1xxxxx  Limited Edition   (last three digits are the edition number)
 *   2xxxxx  Variant           (last four digits are the edition number)
 *   3xxxxx  Rare              (last four digits are the edition number)
 *   4xxxxx  Super Rare        (last four digits are the edition number)
 *   5xxxxx  Legendary         (last three digits are the edition number)
 *   8xxxxx  Spare / replacement
 *   9xxxxx  Artist Proof      (last three digits are the edition number)
 *
 * The 6-7 blocks remain unallocated so a future edition type still has
 * somewhere to live without disturbing anything already printed.
 *
 * Variant, Rare and Super Rare were added on 29 August 2026, before any of the
 * three had been printed, and they moved the edition-number width from a
 * global constant to a property of each range. The original numbered editions
 * are all under 999 - Limited 777, Legendary 10, Artist Proof 100 - so three
 * digits was enough. A Variant run of 2,777 is not, and reading BZ-202777 as
 * edition 777 would name a different piece entirely.
 */

export const EDITION_TYPES = [
  'CLASSIC',
  'LIMITED',
  'VARIANT',
  'RARE',
  'SUPER_RARE',
  'LEGENDARY',
  'SPARE',
  'ARTIST_PROOF',
] as const;

export type EditionType = (typeof EDITION_TYPES)[number];

export interface EditionRange {
  readonly min: number;
  readonly max: number;
  /**
   * Whether the trailing digits are read as the edition position, as in
   * "45 / 777".
   */
  readonly editionNumbered: boolean;
  /**
   * The largest edition position this range can express, set by how many
   * trailing digits a reader is expected to take.
   *
   * Per-range rather than global. The first three numbered editions are all
   * read as three digits and must stay that way, because RF-100045 is already
   * specified to the factory as 45 of 777. The editions added later are read
   * as four, because their runs pass 999.
   */
  readonly maxEditionNumber: number;
  readonly label: string;
}

const THREE_DIGIT = 999;
const FOUR_DIGIT = 9_999;

/**
 * The letter printed on a special edition. Null for Classic, which stays
 * numeric.
 *
 * I and O are deliberately unused, for the same reason the claim-code alphabet
 * excludes them: beside five digits they are read as 1 and 0.
 */
export const EDITION_LETTERS: Record<EditionType, string | null> = {
  CLASSIC: null,
  LIMITED: 'L',
  VARIANT: 'V',
  RARE: 'R',
  SUPER_RARE: 'S',
  LEGENDARY: 'G',
  SPARE: 'X',
  ARTIST_PROOF: 'P',
};

/** Digits after the edition letter. Five covers a full range (1..99,999). */
const POSITION_DIGITS = 5;

export const EDITION_RANGES: Record<EditionType, EditionRange> = {
  CLASSIC:
    { min: 1, max: 99_999, editionNumbered: false, maxEditionNumber: 0, label: 'Classic' },
  LIMITED:
    { min: 100_001, max: 199_999, editionNumbered: true, maxEditionNumber: THREE_DIGIT, label: 'Limited Edition' },
  VARIANT:
    { min: 200_001, max: 299_999, editionNumbered: true, maxEditionNumber: FOUR_DIGIT, label: 'Variant' },
  RARE:
    { min: 300_001, max: 399_999, editionNumbered: true, maxEditionNumber: FOUR_DIGIT, label: 'Rare' },
  SUPER_RARE:
    { min: 400_001, max: 499_999, editionNumbered: true, maxEditionNumber: FOUR_DIGIT, label: 'Super Rare' },
  LEGENDARY:
    { min: 500_001, max: 599_999, editionNumbered: true, maxEditionNumber: THREE_DIGIT, label: 'Legendary' },
  SPARE:
    { min: 800_001, max: 899_999, editionNumbered: false, maxEditionNumber: 0, label: 'Spare' },
  ARTIST_PROOF:
    { min: 900_001, max: 999_999, editionNumbered: true, maxEditionNumber: THREE_DIGIT, label: 'Artist Proof' },
};

/** The largest edition position a given edition can express. */
export function maxEditionNumberFor(editionType: EditionType): number {
  return EDITION_RANGES[editionType].maxEditionNumber;
}

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
  BR: 'Brainiac',
  PI: 'Poison Ivy',
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

  const type = editionTypeForNumber(serialNumber);
  const letter = type ? EDITION_LETTERS[type] : null;

  // Classic, and anything in an unallocated block, stays a plain number.
  if (!type || letter === null) {
    return `${characterCode}-${String(serialNumber).padStart(6, '0')}`;
  }

  const position = serialNumber - EDITION_RANGES[type].min + 1;
  return `${characterCode}-${letter}${String(position).padStart(POSITION_DIGITS, '0')}`;
}

export interface ParsedSerial {
  characterCode: CharacterCode;
  number: number;
  editionType: EditionType | null;
}

const CLASSIC_PATTERN = /^([A-Z]{2})-(\d{6})$/;
const LETTER_PATTERN = /^([A-Z]{2})-([A-Z])(\d{5})$/;

/** Reverse of EDITION_LETTERS, built once. */
const TYPE_BY_LETTER = new Map<string, EditionType>(
  EDITION_TYPES.flatMap((type) => {
    const letter = EDITION_LETTERS[type];
    return letter === null ? [] : [[letter, type] as const];
  }),
);

export function parseSerial(serial: string): ParsedSerial | null {
  const plain = CLASSIC_PATTERN.exec(serial);
  if (plain) {
    const [, code, digits] = plain;
    if (!isCharacterCode(code!)) return null;
    const number = Number.parseInt(digits!, 10);
    return { characterCode: code, number, editionType: editionTypeForNumber(number) };
  }

  const lettered = LETTER_PATTERN.exec(serial);
  if (!lettered) return null;

  const [, code, letter, digits] = lettered;
  if (!isCharacterCode(code!)) return null;

  const type = TYPE_BY_LETTER.get(letter!);
  if (!type) return null;

  // Positions are 1-based, so 00000 is not a piece.
  const position = Number.parseInt(digits!, 10);
  if (position < 1) return null;

  const number = EDITION_RANGES[type].min + position - 1;
  if (number > EDITION_RANGES[type].max) return null;

  return { characterCode: code, number, editionType: type };
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
  if (position > range.maxEditionNumber) return null;
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

  if (range.editionNumbered && endSequence > range.maxEditionNumber) {
    const digits = String(range.maxEditionNumber).length;
    throw new SerialRangeError(
      `${editionType} serials carry the edition number in their last ${digits} digits, ` +
        `so the run cannot pass ${range.maxEditionNumber}. This batch would reach ${endSequence}.`,
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
      `${editionType} serials carry their edition number in their trailing digits, so ` +
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
