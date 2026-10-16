import { describe, it, expect } from 'vitest';
import {
  CHARACTER_CODES,
  formatSerial,
  parseSerial,
  printedSerial,
} from '../../src/lib/serial.ts';

/**
 * The printed form, requested by the client on 15 October 2026, before any
 * Limited or Legendary hologram was made.
 *
 *   Limited       RF-001 .. RF-777        three digits, no edition letter
 *   Artist Proof  RF-001-AP .. RF-100-AP  the same, with a suffix
 *   Legendary     DS-01 .. DS-10          two digits, a run of ten
 *
 * Everything else keeps the form it already had, because Classic is at the
 * factory and Variant, Rare and Super Rare were deliberately left out of this
 * change.
 *
 * The registry's own serial does not move. RF-L00045 is still what the
 * database stores and still what the edition arithmetic works on; this is how
 * the piece is written on the hologram and on its page, which must agree with
 * each other or the collector thinks something is wrong.
 *
 * Bizarro is BIZ now, not BZ, in every code BINKIS uses. A three-letter code
 * is new, so most of what follows is really about proving nothing assumed two.
 */

describe('what changed', () => {
  it('writes Limited as three digits with no letter', () => {
    expect(printedSerial('RF-L00001')).toBe('RF-001');
    expect(printedSerial('RF-L00045')).toBe('RF-045');
    expect(printedSerial('RF-L00777')).toBe('RF-777');
  });

  it('writes Artist Proof with the suffix', () => {
    expect(printedSerial('RF-AP00001')).toBe('RF-001-AP');
    expect(printedSerial('RF-AP00100')).toBe('RF-100-AP');
  });

  it('writes Legendary as two digits', () => {
    expect(printedSerial('DS-00001')).toBe('DS-01');
    expect(printedSerial('DS-00010')).toBe('DS-10');
  });

  it('writes Legendary Artist Proofs the same way', () => {
    expect(printedSerial('DS-AP00001')).toBe('DS-01-AP');
    expect(printedSerial('DS-AP00004')).toBe('DS-04-AP');
  });
});

describe('what did not change', () => {
  it('leaves Classic alone, because it is already at the factory', () => {
    expect(printedSerial('SP-000001')).toBe('SP-000001');
    expect(printedSerial('HQ-017998')).toBe('HQ-017998');
  });

  it('leaves Variant, Rare and Super Rare alone, by the client instruction', () => {
    expect(printedSerial('BIZ-V01427')).toBe('BIZ-V01427');
    expect(printedSerial('BR-R05321')).toBe('BR-R05321');
    expect(printedSerial('PI-S00189')).toBe('PI-S00189');
  });

  it('leaves spares alone: they never reach a customer as themselves', () => {
    expect(printedSerial('SP-X00001')).toBe('SP-X00001');
  });
});

describe('Bizarro is BIZ', () => {
  it('is the character code in the registry', () => {
    expect(CHARACTER_CODES).toHaveProperty('BIZ', 'Bizarro');
    expect(CHARACTER_CODES).not.toHaveProperty('BZ');
  });

  it('formats and parses with three letters', () => {
    const serial = formatSerial('BIZ', 100_001);
    expect(serial).toBe('BIZ-L00001');
    expect(parseSerial(serial)).toMatchObject({ characterCode: 'BIZ', editionType: 'LIMITED' });
  });

  it('prints like every other Limited', () => {
    expect(printedSerial('BIZ-L00001')).toBe('BIZ-001');
    expect(printedSerial('BIZ-AP00100')).toBe('BIZ-100-AP');
  });

  it('still works for its Variant pieces, which keep their letter form', () => {
    expect(parseSerial('BIZ-V02777')).toMatchObject({
      characterCode: 'BIZ',
      editionType: 'VARIANT',
    });
  });
});

describe('a collector can type what is printed', () => {
  it('reads the printed Limited form back to the same piece', () => {
    expect(parseSerial('RF-001')).toMatchObject({
      characterCode: 'RF',
      editionType: 'LIMITED',
    });
    expect(parseSerial('RF-001')!.number).toBe(parseSerial('RF-L00001')!.number);
    expect(parseSerial('RF-777')!.number).toBe(parseSerial('RF-L00777')!.number);
  });

  it('reads the printed Artist Proof form', () => {
    expect(parseSerial('RF-100-AP')!.number).toBe(parseSerial('RF-AP00100')!.number);
    expect(parseSerial('RF-100-AP')!.editionType).toBe('ARTIST_PROOF');
  });

  it('reads the printed Legendary form', () => {
    expect(parseSerial('DS-07')!.number).toBe(parseSerial('DS-00007')!.number);
    expect(parseSerial('DS-04-AP')!.number).toBe(parseSerial('DS-AP00004')!.number);
  });

  it('still reads every form printed before this change', () => {
    for (const serial of ['SP-000001', 'RF-L00045', 'BIZ-V01427', 'DS-00007', 'RF-AP00100']) {
      expect(parseSerial(serial), serial).not.toBeNull();
    }
  });

  it('refuses a printed form that is out of its run', () => {
    // Limited is 777 pieces, Legendary is 10. Nothing beyond that exists.
    expect(parseSerial('RF-778')).toBeNull();
    expect(parseSerial('RF-000')).toBeNull();
    expect(parseSerial('DS-11')).toBeNull();
    expect(parseSerial('RF-101-AP')).toBeNull();
  });
});

describe('round trip', () => {
  it('every printed form reads back to the piece it was printed from', () => {
    const cases = [
      ['RF', 100_001],
      ['BIZ', 100_777],
      ['CH', 900_001],
      ['GL', 900_100],
      ['DS', 500_001],
      ['DS', 500_010],
    ] as const;

    for (const [code, number] of cases) {
      const serial = formatSerial(code, number);
      const printed = printedSerial(serial);
      const back = parseSerial(printed);
      expect(back, `${serial} printed as ${printed}`).not.toBeNull();
      expect(back!.number, `${serial} printed as ${printed}`).toBe(number);
      expect(back!.characterCode, printed).toBe(code);
    }
  });
});
