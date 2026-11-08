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

  it('leaves Classic alone a second time, because it has no letter to separate', () => {
    expect(printedSerial('SP-014278')).toBe('SP-014278');
  });
});

/**
 * The separated letter, asked for by the client on 8 November 2026 and agreed
 * before Krystal printed any Variant, Rare or Super Rare:
 *
 *   was   BIZ-V01427      letter and position run together, five digits
 *   now   BIZ-V-1427      letter, hyphen, position at four
 *
 * His reason, and it is the right one: the letter and the number are two
 * different facts, and jammed together they read as one. BIZ-V01427 looks like
 * a part code. BIZ-V-1427 says Variant, piece 1427.
 *
 * Four digits rather than five because every run that uses this form fits:
 * Variant 4,777, Rare 7,777, Super Rare 2,777, Spare 3,000. The padding is not
 * a cap - a run past 9,999 would simply print five - but nothing on order
 * reaches it, so what goes to the factory is four.
 *
 * This is the same KIND of change as 15 October: the registry still stores
 * BIZ-V01427 and every piece of edition arithmetic still works on that. Only
 * the spelling on the sticker and the page moves, which is why it can be made
 * at all. The pieces already minted keep their identity, their QR token and
 * their claim code; nothing is regenerated.
 */
describe('the separated edition letter', () => {
  it('writes Variant as letter, hyphen, four digits', () => {
    expect(printedSerial('BIZ-V00001')).toBe('BIZ-V-0001');
    expect(printedSerial('BIZ-V01427')).toBe('BIZ-V-1427');
    expect(printedSerial('BIZ-V04777')).toBe('BIZ-V-4777');
  });

  it('writes Rare and Super Rare the same way', () => {
    expect(printedSerial('BR-R05321')).toBe('BR-R-5321');
    expect(printedSerial('BR-R07777')).toBe('BR-R-7777');
    expect(printedSerial('PI-S00189')).toBe('PI-S-0189');
    expect(printedSerial('PI-S02222')).toBe('PI-S-2222');
  });

  it('writes spares the same way, so the letter form has one rule', () => {
    expect(printedSerial('SP-X00001')).toBe('SP-X-0001');
    expect(printedSerial('SP-X03000')).toBe('SP-X-3000');
  });

  it('does not touch the editions that print with no letter at all', () => {
    // 15 October took the letter off these. Separating a letter that is not
    // there would put it back, which is the opposite of what he asked for.
    expect(printedSerial('RF-L00045')).toBe('RF-045');
    expect(printedSerial('DS-00007')).toBe('DS-07');
    expect(printedSerial('RF-AP00100')).toBe('RF-100-AP');
  });

  it('reads the separated form back to the very same piece', () => {
    for (const [printed, stored] of [
      ['BIZ-V-1427', 'BIZ-V01427'],
      ['BR-R-5321', 'BR-R05321'],
      ['PI-S-0189', 'PI-S00189'],
      ['SP-X-0001', 'SP-X00001'],
    ] as const) {
      const back = parseSerial(printed);
      expect(back, printed).not.toBeNull();
      expect(back!.number, printed).toBe(parseSerial(stored)!.number);
      expect(back!.editionType, printed).toBe(parseSerial(stored)!.editionType);
    }
  });

  it('still reads the run-together form, which is what the registry stores', () => {
    expect(parseSerial('BIZ-V01427')!.number).toBe(parseSerial('BIZ-V-1427')!.number);
  });

  it('refuses a separated position that is not a piece', () => {
    expect(parseSerial('BIZ-V-0000')).toBeNull();
    expect(parseSerial('ZZ-V-1427')).toBeNull();
    expect(parseSerial('BIZ-Q-1427')).toBeNull();
  });

  it('round trips every letter edition through the printed form', () => {
    const cases = [
      ['BIZ', 200_001],
      ['BIZ', 204_777],
      ['BR', 307_777],
      ['PI', 402_222],
      ['SP', 803_000],
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

/**
 * Katana, ordered 22 October 2026: a second Legendary, ten pieces and four
 * proofs, the same shape as Deathstroke.
 *
 * The reason this needs its own block is that adding her broke a rule that
 * had been written as a test for one character code. A proof is printed at
 * the width of the edition it shadows, and "the edition it shadows" was
 * spelled `characterCode === 'DS'`, which was true only while Deathstroke
 * was the only Legendary. Katana's proofs would have gone to the factory as
 * KTN-001-AP instead of KTN-01-AP.
 */
describe('Katana, the second Legendary', () => {
  it('is in the registry under a three-letter code', () => {
    expect(CHARACTER_CODES).toHaveProperty('KTN', 'Katana');
  });

  it('prints as two digits, like every Legendary', () => {
    expect(printedSerial('KTN-00001')).toBe('KTN-01');
    expect(printedSerial('KTN-00010')).toBe('KTN-10');
  });

  it('prints its proofs at the width of the run they shadow', () => {
    expect(printedSerial('KTN-AP00001')).toBe('KTN-01-AP');
    expect(printedSerial('KTN-AP00004')).toBe('KTN-04-AP');
  });

  it('leaves the hundred proofs of a Limited character at three digits', () => {
    // The rule is the edition shadowed, not the number of characters.
    expect(printedSerial('RF-AP00001')).toBe('RF-001-AP');
    expect(printedSerial('GL-AP00100')).toBe('GL-100-AP');
  });

  it('reads its printed forms back to the same piece', () => {
    expect(parseSerial('KTN-07')!.number).toBe(parseSerial('KTN-00007')!.number);
    expect(parseSerial('KTN-04-AP')!.number).toBe(parseSerial('KTN-AP00004')!.number);
  });

  it('refuses a position outside the run it shadows', () => {
    // Ten pieces and four proofs. An eleventh and a fifth do not exist.
    expect(parseSerial('KTN-11')).toBeNull();
    expect(parseSerial('KTN-05-AP')).toBeNull();
    expect(parseSerial('DS-05-AP')).toBeNull();
  });

  it('round trips every piece of the run, and every proof', () => {
    for (let i = 1; i <= 10; i++) {
      const serial = formatSerial('KTN', 500_000 + i);
      const back = parseSerial(printedSerial(serial));
      expect(back?.number, serial).toBe(500_000 + i);
      expect(back?.characterCode, serial).toBe('KTN');
    }
    for (let i = 1; i <= 4; i++) {
      const serial = formatSerial('KTN', 900_000 + i);
      const back = parseSerial(printedSerial(serial));
      expect(back?.number, serial).toBe(900_000 + i);
      expect(back?.editionType, serial).toBe('ARTIST_PROOF');
    }
  });
});
