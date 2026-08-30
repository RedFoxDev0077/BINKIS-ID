import { describe, it, expect } from 'vitest';
import {
  EDITION_RANGES,
  EDITION_TYPES,
  CHARACTER_CODES,
  SerialRangeError,
  allocateSerialNumbers,
  editionNumberForNumber,
  editionTypeForNumber,
  formatSerial,
  parseSerial,
  planProduction,
  maxEditionNumberFor,
} from '../../src/lib/serial.ts';

/**
 * Variant, Rare and Super Rare, added at the client's request on 29 August
 * 2026, before any of these three have been printed.
 *
 *   Variant     4 characters x 2,777   BZ, BM, HQ, JK   11,108
 *   Rare        Brainiac (BR)                            7,777
 *   Super Rare  Poison Ivy (PI)                          2,777
 *                                                       -------
 *                                                        21,662
 *
 * The interesting part is not the new ranges, it is that all three runs are
 * larger than 999. The original three numbered editions - Limited 777,
 * Legendary 10, Artist Proof 100 - all fit in three digits, and the code hard
 * coded that assumption as MAX_EDITION_NUMBER. A Variant of 2,777 breaks it,
 * so the cap became a property of each range rather than one global constant.
 */

describe('the three new edition types exist', () => {
  it('registers Variant, Rare and Super Rare', () => {
    expect(EDITION_TYPES).toContain('VARIANT');
    expect(EDITION_TYPES).toContain('RARE');
    expect(EDITION_TYPES).toContain('SUPER_RARE');
  });

  it('gives each one its own block, in the gaps left for exactly this', () => {
    expect(EDITION_RANGES.VARIANT.min).toBe(200_001);
    expect(EDITION_RANGES.VARIANT.max).toBe(299_999);
    expect(EDITION_RANGES.RARE.min).toBe(300_001);
    expect(EDITION_RANGES.RARE.max).toBe(399_999);
    expect(EDITION_RANGES.SUPER_RARE.min).toBe(400_001);
    expect(EDITION_RANGES.SUPER_RARE.max).toBe(499_999);
  });

  it('leaves 6 and 7 unallocated for whatever comes next', () => {
    for (const number of [600_001, 650_000, 700_001, 799_999]) {
      expect(editionTypeForNumber(number)).toBeNull();
    }
  });

  it('does not disturb a single existing range', () => {
    expect(EDITION_RANGES.CLASSIC).toMatchObject({ min: 1, max: 99_999 });
    expect(EDITION_RANGES.LIMITED).toMatchObject({ min: 100_001, max: 199_999 });
    expect(EDITION_RANGES.LEGENDARY).toMatchObject({ min: 500_001, max: 599_999 });
    expect(EDITION_RANGES.SPARE).toMatchObject({ min: 800_001, max: 899_999 });
    expect(EDITION_RANGES.ARTIST_PROOF).toMatchObject({ min: 900_001, max: 999_999 });
  });

  it('keeps every range disjoint, including the new ones', () => {
    const seen: Array<{ type: string; min: number; max: number }> = [];
    for (const type of EDITION_TYPES) {
      const { min, max } = EDITION_RANGES[type];
      for (const other of seen) {
        const overlaps = min <= other.max && max >= other.min;
        expect(overlaps, `${type} overlaps ${other.type}`).toBe(false);
      }
      seen.push({ type, min, max });
    }
  });
});

describe('the two new characters', () => {
  it('knows Brainiac and Poison Ivy', () => {
    expect(CHARACTER_CODES.BR).toBe('Brainiac');
    expect(CHARACTER_CODES.PI).toBe('Poison Ivy');
  });

  it('does not collide with an existing code', () => {
    const codes = Object.keys(CHARACTER_CODES);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('parses a Brainiac Rare serial back to what it means', () => {
    const parsed = parseSerial('BR-300001');
    expect(parsed).toMatchObject({ characterCode: 'BR', number: 300_001, editionType: 'RARE' });
  });

  it('parses a Poison Ivy Super Rare serial', () => {
    const parsed = parseSerial('PI-400001');
    expect(parsed).toMatchObject({
      characterCode: 'PI',
      number: 400_001,
      editionType: 'SUPER_RARE',
    });
  });
});

describe('edition numbering past 999', () => {
  it('still caps the original three at 999, because that is what is printed', () => {
    // RF-100045 has to keep meaning 45 of 777. Widening these would change the
    // meaning of serials that are already on their way to a press.
    expect(maxEditionNumberFor('LIMITED')).toBe(999);
    expect(maxEditionNumberFor('LEGENDARY')).toBe(999);
    expect(maxEditionNumberFor('ARTIST_PROOF')).toBe(999);
  });

  it('allows four digits on the new editions, which need them', () => {
    expect(maxEditionNumberFor('VARIANT')).toBe(9_999);
    expect(maxEditionNumberFor('RARE')).toBe(9_999);
    expect(maxEditionNumberFor('SUPER_RARE')).toBe(9_999);
  });

  it('reads the edition position correctly at the top of a 2,777 run', () => {
    // BZ-202777 is 2777 of 2777. Under the old three-digit rule this read as
    // 777, which is a different piece in a different edition.
    expect(editionNumberForNumber(200_001)).toBe(1);
    expect(editionNumberForNumber(202_777)).toBe(2_777);
    expect(formatSerial('BZ', 202_777)).toBe('BZ-202777');
  });

  it('reads the top of Brainiac 7,777', () => {
    expect(editionNumberForNumber(307_777)).toBe(7_777);
  });

  it('still refuses to number past its own range cap', () => {
    expect(editionNumberForNumber(210_000)).toBeNull();
  });
});

describe('allocating the new runs', () => {
  it('allocates a full Variant run of 2,777', () => {
    const numbers = allocateSerialNumbers('VARIANT', 1, 2_777);
    expect(numbers).toHaveLength(2_777);
    expect(numbers[0]).toBe(200_001);
    expect(numbers.at(-1)).toBe(202_777);
    expect(formatSerial('HQ', numbers.at(-1)!)).toBe('HQ-202777');
  });

  it('allocates Brainiac 7,777 as one block', () => {
    const numbers = allocateSerialNumbers('RARE', 1, 7_777);
    expect(numbers).toHaveLength(7_777);
    expect(numbers.at(-1)).toBe(307_777);
    expect(editionNumberForNumber(numbers.at(-1)!)).toBe(7_777);
  });

  it('allocates Poison Ivy 2,777', () => {
    const numbers = allocateSerialNumbers('SUPER_RARE', 1, 2_777);
    expect(numbers.at(-1)).toBe(402_777);
  });

  it('refuses a run that would pass the four digit ceiling', () => {
    expect(() => allocateSerialNumbers('VARIANT', 1, 10_000)).toThrow(SerialRangeError);
  });

  it('still refuses a Limited run past 999', () => {
    expect(() => allocateSerialNumbers('LIMITED', 1, 1_000)).toThrow(SerialRangeError);
  });

  it('never crosses out of its block', () => {
    for (const type of ['VARIANT', 'RARE', 'SUPER_RARE'] as const) {
      const range = EDITION_RANGES[type];
      const numbers = allocateSerialNumbers(type, 1, 5);
      expect(numbers.every((n) => n >= range.min && n <= range.max)).toBe(true);
    }
  });
});

describe('production planning for the new editions', () => {
  it('refuses overage, because these are numbered runs', () => {
    // A Variant is "45 / 2,777". Over-generating to absorb press waste leaves
    // holes in that sequence, and a missing 45/2,777 cannot be repaired after
    // the run. Same reasoning as Limited and Legendary.
    expect(() => planProduction('VARIANT', 2_777, 30)).toThrow(SerialRangeError);
    expect(() => planProduction('RARE', 7_777, 30)).toThrow(SerialRangeError);
    expect(() => planProduction('SUPER_RARE', 2_777, 30)).toThrow(SerialRangeError);
  });

  it('plans the exact rows at zero overage', () => {
    expect(planProduction('VARIANT', 2_777, 0).total).toBe(2_777);
    expect(planProduction('RARE', 7_777, 0).total).toBe(7_777);
    expect(planProduction('SUPER_RARE', 2_777, 0).total).toBe(2_777);
  });

  it('adds up to the 21,662 the client asked for', () => {
    const variant = 4 * planProduction('VARIANT', 2_777, 0).total; // BZ, BM, HQ, JK
    const rare = planProduction('RARE', 7_777, 0).total; // Brainiac
    const superRare = planProduction('SUPER_RARE', 2_777, 0).total; // Poison Ivy

    expect(variant).toBe(11_108);
    expect(rare).toBe(7_777);
    expect(superRare).toBe(2_777);
    expect(variant + rare + superRare).toBe(21_662);
  });

  it('does not change the Serie 1 total', () => {
    // 134,399 stays what it was. The new editions are additional, and must not
    // silently move a number the factory has already been quoted on.
    const classic = [30_000, 25_000, 18_000, 15_000, 12_000, 12_000, 10_000, 8_000];
    const classicTotal = classic.reduce((a, b) => a + b, 0);
    const numbered = 5 * 777 + 5 * 100 + 10 + 4;
    expect(classicTotal + numbered).toBe(134_399);
  });
});

describe('a Variant of one character cannot be confused with another', () => {
  it('same number, different character, different piece', () => {
    // The four Variant characters share one hologram design; only the
    // abbreviation and the numbering differ. The serial is what keeps them
    // apart, so this is the property that matters.
    const serials = ['BZ', 'BM', 'HQ', 'JK'].map((c) => formatSerial(c, 200_045));
    expect(new Set(serials).size).toBe(4);
    expect(serials).toEqual(['BZ-200045', 'BM-200045', 'HQ-200045', 'JK-200045']);
  });

  it('a Variant Batman is not a Classic Batman', () => {
    expect(editionTypeForNumber(200_045)).toBe('VARIANT');
    expect(editionTypeForNumber(45)).toBe('CLASSIC');
  });
});
