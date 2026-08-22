import { describe, it, expect } from 'vitest';
import { ALPHABET } from '../../src/lib/codes/alphabet.ts';
import {
  checkCharacter,
  appendCheckCharacter,
  hasValidCheckCharacter,
} from '../../src/lib/codes/check-character.ts';
import {
  generateClaimCode,
  CLAIM_CODE_PAYLOAD_LENGTH,
} from '../../src/lib/codes/claim-code.ts';

// The check character is the thing that stops a typo from ever reaching the
// database and burning a rate-limited attempt. It is validated client-side, so
// it has to be exactly right, and its blind spots have to be measured rather
// than assumed.
//
// This is a weighted checksum over GF(31), not Luhn mod 31. Luhn's guarantee
// depends on an even modulus; over 31 it leaks about 1.5% of single-character
// typos. See the note in check-character.ts for the full reasoning.

const payloadOf = () => generateClaimCode().slice(0, CLAIM_CODE_PAYLOAD_LENGTH);

describe('GF(31) check character', () => {
  it('is deterministic', () => {
    const payload = '7K9P2M4XQ3';
    const first = checkCharacter(payload);
    for (let i = 0; i < 100; i++) {
      expect(checkCharacter(payload)).toBe(first);
    }
  });

  it('produces a character that is itself inside the 31-char alphabet', () => {
    for (let i = 0; i < 2000; i++) {
      expect(ALPHABET).toContain(checkCharacter(payloadOf()));
    }
  });

  it('validates a code it just built', () => {
    for (let i = 0; i < 2000; i++) {
      expect(hasValidCheckCharacter(appendCheckCharacter(payloadOf()))).toBe(true);
    }
  });

  it('the documented example from CLAUDE.md is 11 characters with a valid check character', () => {
    // 7K9P-2M4X-Q3F is quoted in CLAUDE.md as the shape of a claim code.
    const payload = '7K9P2M4XQ3';
    expect(payload).toHaveLength(CLAIM_CODE_PAYLOAD_LENGTH);
    const full = appendCheckCharacter(payload);
    expect(full).toHaveLength(11);
    expect(hasValidCheckCharacter(full)).toBe(true);
  });

  it('rejects a code whose check character has been altered', () => {
    const full = appendCheckCharacter('7K9P2M4XQ3');
    for (const c of ALPHABET) {
      if (c === full[10]) continue;
      expect(hasValidCheckCharacter(full.slice(0, 10) + c)).toBe(false);
    }
  });

  // --- the two guarantees that actually matter in a shop, on a phone ---

  it('detects EVERY single-character substitution, at every position', () => {
    // 31 is prime and no weight is 0 mod 31, so a substitution at position i
    // shifts the weighted sum by w_i * d, which cannot vanish unless d is 0.
    let checked = 0;
    for (let sample = 0; sample < 200; sample++) {
      const full = appendCheckCharacter(payloadOf());
      for (let pos = 0; pos < full.length; pos++) {
        for (const replacement of ALPHABET) {
          if (replacement === full[pos]) continue;
          const mutated = full.slice(0, pos) + replacement + full.slice(pos + 1);
          expect(hasValidCheckCharacter(mutated)).toBe(false);
          checked++;
        }
      }
    }
    // 200 samples x 11 positions x 30 substitutions
    expect(checked).toBe(200 * 11 * 30);
  });

  it('detects EVERY transposition, adjacent or not', () => {
    // A swap of positions i and j shifts the sum by (w_i - w_j)(x_j - x_i).
    // All eleven weights are distinct and below 31, so neither factor can be
    // zero unless the two characters were already equal. Weight 1 is reserved
    // for the check character and the payload starts at 2 precisely so that no
    // two positions share a weight.
    let checked = 0;
    for (let sample = 0; sample < 300; sample++) {
      const full = appendCheckCharacter(payloadOf());
      for (let i = 0; i < full.length; i++) {
        for (let j = i + 1; j < full.length; j++) {
          if (full[i] === full[j]) continue;
          const swapped =
            full.slice(0, i) + full[j] + full.slice(i + 1, j) + full[i] + full.slice(j + 1);
          expect(hasValidCheckCharacter(swapped)).toBe(false);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(10_000);
  });

  it('detects every adjacent transposition specifically', () => {
    // Called out on its own because this is the typo a human actually makes
    // reading a code off foil, and it is the case Luhn mod 31 leaked on '2'/'Z'.
    for (let sample = 0; sample < 500; sample++) {
      const full = appendCheckCharacter(payloadOf());
      for (let pos = 0; pos < full.length - 1; pos++) {
        if (full[pos] === full[pos + 1]) continue;
        const swapped =
          full.slice(0, pos) + full[pos + 1] + full[pos] + full.slice(pos + 2);
        expect(hasValidCheckCharacter(swapped)).toBe(false);
      }
    }
  });

  it('has no blind spot for any character, including the pairs Luhn mod 31 missed', () => {
    // Luhn mod 31 sent x and x+15 to the same doubled value, so 3/J 4/K 5/M
    // 6/N 7/P 8/Q 9/R A/S B/T C/U D/V E/W F/X G/Y H/Z each hid one typo.
    // Every one of those pairs is now caught, at every position.
    const formerBlindSpots: Array<[string, string]> = [
      ['3', 'J'], ['4', 'K'], ['5', 'M'], ['6', 'N'], ['7', 'P'],
      ['8', 'Q'], ['9', 'R'], ['A', 'S'], ['B', 'T'], ['C', 'U'],
      ['D', 'V'], ['E', 'W'], ['F', 'X'], ['G', 'Y'], ['H', 'Z'],
    ];

    for (const [a, b] of formerBlindSpots) {
      for (let pos = 0; pos < 11; pos++) {
        const base = payloadOf();
        const seeded = (base.slice(0, pos) + a + base.slice(pos + 1)).slice(0, 10);
        const full = appendCheckCharacter(seeded);
        if (full[pos] !== a) continue;

        const mutated = full.slice(0, pos) + b + full.slice(pos + 1);
        expect(hasValidCheckCharacter(mutated), `${a} -> ${b} at ${pos}`).toBe(false);
      }
    }
  });

  it('rejects strings containing characters outside the alphabet instead of throwing', () => {
    for (const bad of ['7K9P2M4XQ3O', '7K9P2M4XQ30', '7K9P2M4XQ3I', '7K9P2M4XQ3L', '7K9P2M4XQ31']) {
      expect(hasValidCheckCharacter(bad)).toBe(false);
    }
  });

  it('rejects wrong-length input', () => {
    expect(hasValidCheckCharacter('')).toBe(false);
    expect(hasValidCheckCharacter('7K9P')).toBe(false);
    expect(hasValidCheckCharacter(appendCheckCharacter('7K9P2M4XQ3') + 'A')).toBe(false);
  });

  it('spreads check characters across the whole alphabet', () => {
    // A checksum that collapsed onto a few characters would be a sign the
    // weights or the modulus were wrong.
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) seen.add(checkCharacter(payloadOf()));
    expect(seen.size).toBe(ALPHABET.length);
  });
});
