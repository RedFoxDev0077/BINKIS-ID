import { describe, it, expect } from 'vitest';
import {
  ALPHABET,
  ALPHABET_SIZE,
  EXCLUDED_CHARACTERS,
  isAlphabetString,
  normaliseCode,
  indexOfChar,
  charAtIndex,
} from '../../src/lib/codes/alphabet.ts';
import { generateClaimCode, formatClaimCode, parseClaimCode } from '../../src/lib/codes/claim-code.ts';
import { generateQrToken, QR_TOKEN_LENGTH } from '../../src/lib/codes/qr-token.ts';

// The alphabet exists so a code cannot be misread off reflective holographic
// foil. If an excluded character ever reaches a printed sticker, that sticker
// is scrap. This is checked against generated output, not just the constant.

describe('the 31-character unambiguous alphabet', () => {
  it('is exactly the alphabet CLAUDE.md specifies', () => {
    expect(ALPHABET).toBe('23456789ABCDEFGHJKMNPQRSTUVWXYZ');
    expect(ALPHABET).toHaveLength(31);
    expect(ALPHABET_SIZE).toBe(31);
  });

  it('contains no duplicate characters', () => {
    expect(new Set(ALPHABET).size).toBe(ALPHABET.length);
  });

  it('excludes 0, 1, O, I and L', () => {
    expect([...EXCLUDED_CHARACTERS].sort()).toEqual(['0', '1', 'I', 'L', 'O']);
    for (const excluded of EXCLUDED_CHARACTERS) {
      expect(ALPHABET).not.toContain(excluded);
    }
  });

  it('is uppercase and alphanumeric only, digits before letters, ascending', () => {
    expect(ALPHABET).toBe(ALPHABET.toUpperCase());
    expect(/^[0-9A-Z]+$/.test(ALPHABET)).toBe(true);
    expect([...ALPHABET].join('')).toBe([...ALPHABET].sort().join(''));
  });

  it('index and character map round-trip', () => {
    for (let i = 0; i < ALPHABET_SIZE; i++) {
      expect(indexOfChar(charAtIndex(i))).toBe(i);
    }
    expect(indexOfChar('O')).toBe(-1);
    expect(indexOfChar('0')).toBe(-1);
    expect(indexOfChar('l')).toBe(-1);
  });

  describe('generated claim codes', () => {
    const SAMPLES = 20_000;
    const codes = Array.from({ length: SAMPLES }, () => generateClaimCode());

    it('never emit an excluded character', () => {
      for (const code of codes) {
        for (const ch of code) {
          expect(EXCLUDED_CHARACTERS).not.toContain(ch);
        }
      }
    });

    it('are 11 characters drawn only from the alphabet', () => {
      for (const code of codes) {
        expect(code).toHaveLength(11);
        expect(isAlphabetString(code)).toBe(true);
      }
    });

    it('are drawn without modulo bias', () => {
      // Naive `byte % 31` over-represents the first 8 characters by ~3%.
      // Chi-square over ~200k drawn characters would catch that comfortably.
      const counts = new Map<string, number>([...ALPHABET].map((c) => [c, 0]));
      // The check character is derived, not drawn - exclude it.
      for (const code of codes) {
        for (const ch of code.slice(0, 10)) counts.set(ch, counts.get(ch)! + 1);
      }
      const total = SAMPLES * 10;
      const expected = total / ALPHABET_SIZE;
      let chiSquare = 0;
      for (const observed of counts.values()) {
        chiSquare += (observed - expected) ** 2 / expected;
      }
      // 30 degrees of freedom, p=0.001 critical value is 59.7.
      expect(chiSquare).toBeLessThan(59.7);
    });
  });

  describe('generated QR tokens', () => {
    const tokens = Array.from({ length: 20_000 }, () => generateQrToken());

    it('are 12 characters from the same alphabet with no excluded characters', () => {
      for (const token of tokens) {
        expect(token).toHaveLength(QR_TOKEN_LENGTH);
        expect(isAlphabetString(token)).toBe(true);
      }
    });
  });

  describe('normalisation of what a human types on a phone', () => {
    it('uppercases and strips hyphens and whitespace', () => {
      expect(normaliseCode('7k9p-2m4x-q3f')).toBe('7K9P2M4XQ3F');
      expect(normaliseCode('  7K9P 2M4X Q3F ')).toBe('7K9P2M4XQ3F');
      expect(normaliseCode('7K9P—2M4X—Q3F')).toBe('7K9P2M4XQ3F'); // em dash from iOS autocorrect
    });

    it('does NOT silently rewrite an excluded character into a valid one', () => {
      // Mapping O->0 or I->1 would be meaningless here: 0 and 1 are not in
      // the alphabet either. Guessing what the user meant would let a typo
      // reach the database. Reject instead.
      expect(parseClaimCode('7K9P2M4XQ3O')).toBeNull();
      expect(parseClaimCode('7K9P2M4XQ3I')).toBeNull();
      expect(parseClaimCode('7K9P2M4XQ3L')).toBeNull();
    });
  });

  describe('display formatting', () => {
    it('formats as XXXX-XXXX-XXX and parses back losslessly', () => {
      for (let i = 0; i < 1000; i++) {
        const code = generateClaimCode();
        const formatted = formatClaimCode(code);
        expect(formatted).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{3}$/);
        expect(parseClaimCode(formatted)).toBe(code);
        expect(parseClaimCode(formatted.toLowerCase())).toBe(code);
      }
    });
  });
});
