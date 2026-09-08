import { describe, it, expect } from 'vitest';
import {
  EDITION_RANGES,
  EDITION_TYPES,
  EDITION_LETTERS,
  SerialRangeError,
  allocateSerialNumbers,
  editionNumberForNumber,
  formatSerial,
  parseSerial,
} from '../../src/lib/serial.ts';

/**
 * Letter serials, approved by the client on 30 August 2026.
 *
 * BZ-201427 reads as "two hundred and one thousand four hundred and
 * twenty-seven" for an edition of 2,777 pieces, which is nonsense to the
 * person holding it. The leading digit was doing a machine's job in a place
 * only humans look. So the special editions now carry their letter and their
 * real position: BZ-V01427 is Variant piece 1427.
 *
 * Classic keeps six digits. That is not an inconsistency, it is the point:
 * 130,000 of the 156,000 pieces are Classic, SP-000001 to SP-000400 are
 * already with the factory, and a plain number is the right thing for a piece
 * with no edition position to show. The rule a person needs is one sentence:
 * all digits means Classic, a letter means a special edition.
 *
 * The internal numbering does not change at all. Ranges, allocation and
 * edition arithmetic are untouched; only how a serial is written and read.
 */

const SPECIAL = ['LIMITED', 'VARIANT', 'RARE', 'SUPER_RARE', 'LEGENDARY', 'SPARE', 'ARTIST_PROOF'] as const;

describe('Classic is untouched', () => {
  it('still writes six digits', () => {
    // SP-000001 to SP-000400 are already at the factory. If this ever changes,
    // the stickers already printed stop matching the registry.
    expect(formatSerial('SP', 1)).toBe('SP-000001');
    expect(formatSerial('SP', 200)).toBe('SP-000200');
    expect(formatSerial('SP', 400)).toBe('SP-000400');
    expect(formatSerial('BM', 14_278)).toBe('BM-014278');
  });

  it('still reads six digits back', () => {
    expect(parseSerial('SP-000001')).toMatchObject({
      characterCode: 'SP',
      number: 1,
      editionType: 'CLASSIC',
    });
  });

  it('carries no edition letter', () => {
    expect(EDITION_LETTERS.CLASSIC).toBeNull();
  });
});

describe('every special edition carries its letter', () => {
  it('writes the letter and the real position', () => {
    expect(formatSerial('RF', 100_045)).toBe('RF-L00045'); // Limited 45 of 777
    expect(formatSerial('BZ', 201_427)).toBe('BZ-V01427'); // Variant 1427 of 2777
    expect(formatSerial('BR', 305_321)).toBe('BR-R05321'); // Rare 5321 of 7777
    expect(formatSerial('PI', 400_189)).toBe('PI-S00189'); // Super Rare 189 of 2222
    expect(formatSerial('DS', 500_007)).toBe('DS-G00007'); // Legendary 7 of 10
    expect(formatSerial('RF', 900_045)).toBe('RF-P00045'); // Artist Proof 45
    expect(formatSerial('SP', 800_001)).toBe('SP-X00001'); // Spare 1
  });

  it('the printed number is the position, not an internal offset', () => {
    // This is the whole reason for the change. The digits a collector reads
    // must be the same number the passport page shows as "1427 / 2777".
    for (const [serial, expected] of [
      ['RF-L00045', 45],
      ['BZ-V01427', 1_427],
      ['BR-R05321', 5_321],
      ['PI-S00189', 189],
      ['DS-G00007', 7],
    ] as const) {
      const parsed = parseSerial(serial)!;
      expect(editionNumberForNumber(parsed.number), serial).toBe(expected);
    }
  });

  it('assigns a distinct letter to each edition', () => {
    const letters = EDITION_TYPES.map((t) => EDITION_LETTERS[t]).filter(
      (l): l is string => l !== null,
    );
    expect(new Set(letters).size).toBe(letters.length);
  });

  it('never uses a letter that is easy to misread off foil', () => {
    // Same reasoning as the claim-code alphabet: O and I are excluded so they
    // cannot be confused with 0 and 1 in the digits beside them.
    for (const letter of Object.values(EDITION_LETTERS)) {
      if (letter === null) continue;
      expect(['I', 'O'], `${letter} is ambiguous`).not.toContain(letter);
    }
  });
});

describe('round trip', () => {
  it('parse(format(n)) returns n, for every edition', () => {
    for (const type of EDITION_TYPES) {
      const { min } = EDITION_RANGES[type];
      for (const offset of [0, 1, 44, 776, 2_776, 9_998]) {
        const number = min + offset;
        if (number > EDITION_RANGES[type].max) continue;
        const serial = formatSerial('BZ', number);
        const parsed = parseSerial(serial);
        expect(parsed, `${type} ${serial}`).not.toBeNull();
        expect(parsed!.number, `${type} ${serial}`).toBe(number);
        expect(parsed!.editionType, `${type} ${serial}`).toBe(type);
      }
    }
  });

  it('formats every serial an allocation produces', () => {
    for (const type of SPECIAL) {
      const numbers = allocateSerialNumbers(type, 1, 3);
      for (const n of numbers) {
        const serial = formatSerial('RF', n);
        expect(parseSerial(serial)?.number, serial).toBe(n);
      }
    }
  });
});

describe('what must be rejected', () => {
  it('refuses an unknown edition letter', () => {
    expect(parseSerial('BZ-Q01427')).toBeNull();
    expect(parseSerial('BZ-A01427')).toBeNull();
  });

  it('refuses position zero, because positions start at one', () => {
    expect(parseSerial('BZ-V00000')).toBeNull();
  });

  it('refuses the wrong number of digits after a letter', () => {
    expect(parseSerial('BZ-V001427')).toBeNull();
    expect(parseSerial('BZ-V0142')).toBeNull();
  });

  it('refuses a letter on a Classic-length serial', () => {
    expect(parseSerial('BZ-V000001')).toBeNull();
  });

  it('refuses an unknown character code', () => {
    expect(parseSerial('ZZ-V01427')).toBeNull();
  });

  it('refuses lowercase', () => {
    expect(parseSerial('bz-v01427')).toBeNull();
  });
});

describe('a Classic and a special edition can never collide', () => {
  it('the old numeric form still resolves to the same piece', () => {
    // BZ-201427 and BZ-V01427 are two ways of writing one piece, and the old
    // way still reads. Nothing printed before this change becomes unreadable,
    // which is what makes the change safe to make at all.
    const oldForm = parseSerial('BZ-201427')!;
    const newForm = parseSerial('BZ-V01427')!;
    expect(oldForm.number).toBe(newForm.number);
    expect(oldForm.editionType).toBe('VARIANT');
    expect(newForm.editionType).toBe('VARIANT');

    // And the canonical way to write it is now the letter form.
    expect(formatSerial('BZ', oldForm.number)).toBe('BZ-V01427');
  });

  it('same position, different edition, different serial', () => {
    const serials = SPECIAL.map((t) => formatSerial('BM', EDITION_RANGES[t].min + 44));
    expect(new Set(serials).size).toBe(serials.length);
  });
});

describe('the second production order, at its real quantities', () => {
  it('Super Rare is 2,222, not 2,777', () => {
    // Changed by the client on 30 August 2026, to differentiate it from the
    // Variant run of 2,777.
    const numbers = allocateSerialNumbers('SUPER_RARE', 1, 2_222);
    expect(numbers).toHaveLength(2_222);
    expect(formatSerial('PI', numbers.at(-1)!)).toBe('PI-S02222');
  });

  it('adds up to 21,107', () => {
    const variant = 4 * 2_777;
    expect(variant + 7_777 + 2_222).toBe(21_107);
  });

  it('the top of each new run formats correctly', () => {
    expect(formatSerial('BZ', 200_000 + 2_777)).toBe('BZ-V02777');
    expect(formatSerial('BR', 300_000 + 7_777)).toBe('BR-R07777');
    expect(formatSerial('PI', 400_000 + 2_222)).toBe('PI-S02222');
  });

  it('still refuses a run past the four digit ceiling', () => {
    expect(() => allocateSerialNumbers('VARIANT', 1, 10_000)).toThrow(SerialRangeError);
  });
});
