import { describe, it, expect } from 'vitest';
import {
  EDITION_RANGES,
  EDITION_TYPES,
  CHARACTER_CODES,
  formatSerial,
  parseSerial,
  editionTypeForNumber,
  editionNumberForSerial,
  allocateSerialNumbers,
  planProduction,
  SerialRangeError,
} from '../../src/lib/serial.ts';

// The digit block encodes the edition so ranges can never collide. A serial is
// printed onto a physical hologram; a range mistake is unrecoverable once the
// factory runs.

describe('serial ranges', () => {
  it('covers exactly the five edition types from CLAUDE.md', () => {
    expect([...EDITION_TYPES].sort()).toEqual(
      ['ARTIST_PROOF', 'CLASSIC', 'LEGENDARY', 'LIMITED', 'SPARE'].sort(),
    );
  });

  it('assigns the leading digit CLAUDE.md specifies', () => {
    expect(Math.floor(EDITION_RANGES.CLASSIC.min / 100_000)).toBe(0);
    expect(Math.floor(EDITION_RANGES.LIMITED.min / 100_000)).toBe(1);
    expect(Math.floor(EDITION_RANGES.LEGENDARY.min / 100_000)).toBe(5);
    expect(Math.floor(EDITION_RANGES.SPARE.min / 100_000)).toBe(8);
    expect(Math.floor(EDITION_RANGES.ARTIST_PROOF.min / 100_000)).toBe(9);
  });

  it('has no overlapping ranges, pairwise', () => {
    for (const a of EDITION_TYPES) {
      for (const b of EDITION_TYPES) {
        if (a === b) continue;
        const ra = EDITION_RANGES[a];
        const rb = EDITION_RANGES[b];
        const overlaps = ra.min <= rb.max && rb.min <= ra.max;
        expect(overlaps, a + ' overlaps ' + b).toBe(false);
      }
    }
  });

  it('never lets a number belong to two editions', () => {
    for (let n = 0; n <= 999_999; n += 7) {
      const matches = EDITION_TYPES.filter(
        (t) => n >= EDITION_RANGES[t].min && n <= EDITION_RANGES[t].max,
      );
      expect(matches.length).toBeLessThanOrEqual(1);
      expect(editionTypeForNumber(n)).toBe(matches[0] ?? null);
    }
  });

  it('reserves the 2-4 and 6-7 blocks so a future edition has somewhere to go', () => {
    for (const n of [200_000, 300_000, 400_000, 600_000, 700_000]) {
      expect(editionTypeForNumber(n)).toBeNull();
    }
  });
});

describe('serial formatting', () => {
  it('is XX-NNNNNN, zero padded to six digits', () => {
    expect(formatSerial('SP', 1)).toBe('SP-000001');
    expect(formatSerial('SP', 200)).toBe('SP-000200');
    expect(formatSerial('SP', 14_278)).toBe('SP-014278');
    expect(formatSerial('RF', 100_045)).toBe('RF-100045');
    expect(formatSerial('DS', 500_007)).toBe('DS-500007');
  });

  it('round-trips through parseSerial', () => {
    const serials = ['SP-000001', 'SP-014278', 'RF-100045', 'DS-500007', 'BM-800001', 'HQ-900100'];
    for (const serial of serials) {
      const parsed = parseSerial(serial);
      expect(parsed).not.toBeNull();
      expect(formatSerial(parsed!.characterCode, parsed!.number)).toBe(serial);
    }
  });

  it('rejects malformed serials rather than guessing', () => {
    const bad = ['SP000001', 'SP-1', 'SP-0000001', 'S-000001', 'SPP-000001', 'sp-000001', 'ZZ-000001', ''];
    for (const value of bad) {
      expect(parseSerial(value), value).toBeNull();
    }
  });

  it('only accepts the fourteen character codes in CLAUDE.md', () => {
    expect(Object.keys(CHARACTER_CODES)).toHaveLength(14);
    expect(CHARACTER_CODES.SP).toBe('Superman');
    expect(CHARACTER_CODES.BM).toBe('Batman');
    expect(CHARACTER_CODES.HQ).toBe('Harley Quinn');
    expect(CHARACTER_CODES.FL).toBe('The Flash');
    expect(CHARACTER_CODES.WW).toBe('Wonder Woman');
    expect(CHARACTER_CODES.JK).toBe('The Joker');
    expect(CHARACTER_CODES.SG).toBe('Supergirl');
    expect(CHARACTER_CODES.CY).toBe('Cyborg');
    expect(CHARACTER_CODES.RF).toBe('Reverse Flash');
    expect(CHARACTER_CODES.BZ).toBe('Bizarro');
    expect(CHARACTER_CODES.CH).toBe('Cheetah');
    expect(CHARACTER_CODES.RD).toBe('Riddler');
    expect(CHARACTER_CODES.GL).toBe('Green Lantern');
    expect(CHARACTER_CODES.DS).toBe('Deathstroke');
  });
});

describe('edition number is readable off the printed serial', () => {
  it('reads the last three digits for Limited Edition: RF-100045 is 45 of 777', () => {
    expect(editionNumberForSerial('RF-100045')).toBe(45);
    expect(editionNumberForSerial('RF-100001')).toBe(1);
    expect(editionNumberForSerial('RF-100777')).toBe(777);
  });

  it('reads the last three digits for Legendary: DS-500007 is 7 of 10', () => {
    expect(editionNumberForSerial('DS-500007')).toBe(7);
    expect(editionNumberForSerial('DS-500010')).toBe(10);
  });

  it('reads the last three digits for Artist Proof', () => {
    expect(editionNumberForSerial('HQ-900001')).toBe(1);
    expect(editionNumberForSerial('HQ-900100')).toBe(100);
  });

  it('has no edition number for Classic or Spare', () => {
    expect(editionNumberForSerial('SP-014278')).toBeNull();
    expect(editionNumberForSerial('SP-800001')).toBeNull();
  });
});

describe('allocateSerialNumbers', () => {
  it('produces SP-000001 through SP-000200 for the first Classic batch of 200', () => {
    const numbers = allocateSerialNumbers('CLASSIC', 1, 200);
    expect(numbers).toHaveLength(200);
    expect(formatSerial('SP', numbers[0]!)).toBe('SP-000001');
    expect(formatSerial('SP', numbers[199]!)).toBe('SP-000200');
  });

  it('is contiguous and strictly ascending', () => {
    const numbers = allocateSerialNumbers('CLASSIC', 500, 1000);
    for (let i = 1; i < numbers.length; i++) {
      expect(numbers[i]! - numbers[i - 1]!).toBe(1);
    }
  });

  it('starts a Limited Edition run at 100001 so the last three digits are the edition number', () => {
    const numbers = allocateSerialNumbers('LIMITED', 1, 777);
    expect(numbers[0]).toBe(100_001);
    expect(numbers[776]).toBe(100_777);
    expect(formatSerial('RF', numbers[44]!)).toBe('RF-100045');
    expect(editionNumberForSerial(formatSerial('RF', numbers[44]!))).toBe(45);
  });

  it('starts a Legendary run at 500001, so DS-500007 is the seventh', () => {
    const numbers = allocateSerialNumbers('LEGENDARY', 1, 10);
    expect(formatSerial('DS', numbers[6]!)).toBe('DS-500007');
  });

  it('places spares in the 8 block and artist proofs in the 9 block', () => {
    expect(allocateSerialNumbers('SPARE', 1, 1)[0]).toBe(800_001);
    expect(allocateSerialNumbers('ARTIST_PROOF', 1, 1)[0]).toBe(900_001);
  });

  it('keeps every allocated number inside its own range', () => {
    for (const type of EDITION_TYPES) {
      const { min, max } = EDITION_RANGES[type];
      const numbers = allocateSerialNumbers(type, 1, 50);
      for (const n of numbers) {
        expect(n).toBeGreaterThanOrEqual(min);
        expect(n).toBeLessThanOrEqual(max);
        expect(editionTypeForNumber(n)).toBe(type);
      }
    }
  });

  it('refuses to run off the end of a range instead of bleeding into the next one', () => {
    expect(() => allocateSerialNumbers('CLASSIC', 99_999, 2)).toThrow(SerialRangeError);
    // The whole point: overflowing Classic must never produce a 1xxxxx serial.
    try {
      allocateSerialNumbers('CLASSIC', 99_999, 2);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as Error).message).toMatch(/CLASSIC/);
    }
  });

  it('refuses an edition-numbered run that would push the edition number past 999', () => {
    // Beyond 999 the "last three digits are the edition number" rule silently
    // breaks: 101000 would read as edition 0.
    expect(() => allocateSerialNumbers('LIMITED', 1, 1000)).toThrow(SerialRangeError);
    expect(() => allocateSerialNumbers('LEGENDARY', 999, 2)).toThrow(SerialRangeError);
    expect(() => allocateSerialNumbers('ARTIST_PROOF', 1, 1000)).toThrow(SerialRangeError);
    // Spares carry no edition semantics, so they are free to exceed 999.
    expect(() => allocateSerialNumbers('SPARE', 1, 3000)).not.toThrow();
  });

  it('rejects nonsense quantities and start positions', () => {
    expect(() => allocateSerialNumbers('CLASSIC', 1, 0)).toThrow(SerialRangeError);
    expect(() => allocateSerialNumbers('CLASSIC', 1, -5)).toThrow(SerialRangeError);
    expect(() => allocateSerialNumbers('CLASSIC', 0, 10)).toThrow(SerialRangeError);
    expect(() => allocateSerialNumbers('CLASSIC', 1.5, 10)).toThrow(SerialRangeError);
  });

  it('supports the full production run: 130,000 Classic across 8 characters', () => {
    // 16,250 per character stays inside the 99,999 Classic range with room left.
    const perCharacter = 130_000 / 8;
    expect(perCharacter).toBe(16_250);
    const numbers = allocateSerialNumbers('CLASSIC', 1, perCharacter);
    expect(numbers.at(-1)).toBe(16_250);
    expect(editionTypeForNumber(numbers.at(-1)!)).toBe('CLASSIC');
  });
});

describe('production overage, for press waste', () => {
  // The hologram manufacturer asked for 30% more rows than the ordered
  // quantity, because a variable-data press consumes rows on setup and
  // rejects. Confirmed by the factory on 20 August 2026.

  it('adds the requested percentage on top of the sellable count', () => {
    expect(planProduction('CLASSIC', 30_000, 30)).toEqual({
      sellable: 30_000,
      overage: 9_000,
      total: 39_000,
    });
  });

  it('rounds a fractional overage up, never down', () => {
    // Short-changing the press means it runs out of rows mid-job.
    expect(planProduction('CLASSIC', 8_000, 30).overage).toBe(2_400);
    expect(planProduction('CLASSIC', 101, 30).overage).toBe(31);
    expect(planProduction('CLASSIC', 1, 30).overage).toBe(1);
  });

  it('is a no-op at zero percent', () => {
    expect(planProduction('CLASSIC', 200, 0)).toEqual({
      sellable: 200,
      overage: 0,
      total: 200,
    });
  });

  it('keeps every Classic run inside its range even after 30% overage', () => {
    // Superman is the largest Classic run at 30,000. 39,000 must still fit
    // inside 1-99,999, and it does, with room left over.
    for (const quantity of [30_000, 25_000, 18_000, 15_000, 12_000, 10_000, 8_000]) {
      const plan = planProduction('CLASSIC', quantity, 30);
      const numbers = allocateSerialNumbers('CLASSIC', 1, plan.total);
      expect(numbers.at(-1)).toBeLessThanOrEqual(EDITION_RANGES.CLASSIC.max);
      expect(editionTypeForNumber(numbers.at(-1)!)).toBe('CLASSIC');
    }
  });

  it('REFUSES to over-generate an edition-numbered run', () => {
    // This is the guard that matters. Over-generating a run of 777 to absorb
    // waste leaves holes in the numbered sequence, and a missing 45/777 cannot
    // be repaired after the press has run.
    for (const type of ['LIMITED', 'LEGENDARY', 'ARTIST_PROOF'] as const) {
      expect(() => planProduction(type, 777, 30)).toThrow(SerialRangeError);
      expect(() => planProduction(type, 777, 1)).toThrow(SerialRangeError);
    }

    try {
      planProduction('LIMITED', 777, 30);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as Error).message).toMatch(/SPARE range/);
    }
  });

  it('still allows edition-numbered runs at exactly zero overage', () => {
    expect(planProduction('LIMITED', 777, 0).total).toBe(777);
    expect(planProduction('LEGENDARY', 10, 0).total).toBe(10);
    expect(planProduction('ARTIST_PROOF', 100, 0).total).toBe(100);
  });

  it('allows overage on spares, which carry no edition semantics', () => {
    expect(planProduction('SPARE', 3_000, 30).total).toBe(3_900);
  });

  it('rejects nonsense input', () => {
    expect(() => planProduction('CLASSIC', 0, 30)).toThrow(SerialRangeError);
    expect(() => planProduction('CLASSIC', -1, 30)).toThrow(SerialRangeError);
    expect(() => planProduction('CLASSIC', 100, -5)).toThrow(SerialRangeError);
    expect(() => planProduction('CLASSIC', 100, 500)).toThrow(SerialRangeError);
  });

  it('covers the whole production run at 30% overage', () => {
    // 130,000 Classic across 8 characters, over-generated, plus the numbered
    // runs at exact count. This is the row total the factory file will carry.
    const classic = [30_000, 25_000, 18_000, 15_000, 12_000, 12_000, 10_000, 8_000];
    const classicRows = classic.reduce((sum, q) => sum + planProduction('CLASSIC', q, 30).total, 0);
    expect(classicRows).toBe(169_000);

    const numbered =
      5 * planProduction('LIMITED', 777, 0).total +
      5 * planProduction('ARTIST_PROOF', 100, 0).total +
      planProduction('LEGENDARY', 10, 0).total +
      planProduction('ARTIST_PROOF', 4, 0).total;
    expect(numbered).toBe(4_399);

    expect(classicRows + numbered).toBe(173_399);
  });
});
