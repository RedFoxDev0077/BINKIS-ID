import { describe, it, expect } from 'vitest';
import { MIN_PASSWORD_LENGTH } from '../../src/lib/auth/password.ts';
import { passwordSchema, signUpSchema, HANDLE_MIN } from '../../src/lib/validation/auth.ts';
import { getDictionary } from '../../src/lib/i18n/index.ts';

/**
 * The password rule, loosened to six on 26 October 2026.
 *
 * The client asked three times between September and October. Ten was my
 * choice and it was the wrong trade here: the password guards a collection,
 * while the piece itself is guarded by a nine-character claim code that is
 * spent on first use. Someone who guesses a password cannot claim anything
 * new and cannot move a piece without the other side accepting the transfer.
 * Meanwhile every scan is one-handed on a phone in a shop, and a collector
 * who cannot get past the form never registers the piece in their hand.
 *
 * What does the work is argon2id at 19 MiB and three passes, and that has not
 * moved.
 */

describe('the length rule', () => {
  it('is six', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(6);
  });

  it('accepts exactly six', () => {
    expect(passwordSchema.safeParse('abcdef').success).toBe(true);
  });

  it('refuses five', () => {
    expect(passwordSchema.safeParse('abcde').success).toBe(false);
  });

  it('still has an upper bound, so a megabyte is not hashed', () => {
    expect(passwordSchema.safeParse('a'.repeat(201)).success).toBe(false);
  });
});

describe('what is NOT required', () => {
  /**
   * The client asked for this twice in the same sentence: six or more,
   * "sin requerir mayúsculas ni caracteres especiales".
   *
   * There is no complexity rule and there never was one. These cases exist so
   * that adding one is a deliberate act that breaks a test, rather than
   * something that creeps in with a future edit.
   */
  it.each([
    ['all lowercase', 'abcdef'],
    ['all digits', '123456'],
    ['no uppercase', 'binkis'],
    ['no symbol', 'superman'],
    ['no digit', 'batmanx'],
    ['a space in the middle', 'me gusta'],
    ['accented characters', 'contraseña'],
    ['emoji, because a phone keyboard offers them', '🦇🦇🦇🦇🦇🦇'],
  ])('accepts a password with %s', (_name, value) => {
    expect(passwordSchema.safeParse(value).success, value).toBe(true);
  });
});

describe('the whole signup form', () => {
  const valid = {
    email: 'david@binkis.com',
    handle: 'david',
    password: 'abcdef',
    displayName: 'David',
  };

  it('accepts a six-character password alongside everything else', () => {
    expect(signUpSchema.safeParse(valid).success).toBe(true);
  });

  it('reports the password field, not the form, when it is too short', () => {
    const result = signUpSchema.safeParse({ ...valid, password: 'abc' });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((i) => i.path[0] === 'password')).toBe(true);
  });
});

describe('the message a collector actually reads', () => {
  /**
   * The client photographed the Spanish signup page showing "Password must be
   * at least 10 characters" in English. Zod messages are written where the
   * schema is declared and no locale exists there, so they were reaching the
   * screen untranslated.
   */
  it('offers the rule in both languages', () => {
    expect(getDictionary('es').auth.passwordTooShort).toContain('{min}');
    expect(getDictionary('en').auth.passwordTooShort).toContain('{min}');
  });

  it('says six in the hint, in both languages', () => {
    expect(getDictionary('es').auth.passwordHint).toContain('6');
    expect(getDictionary('en').auth.passwordHint).toContain('6');
  });

  it('no longer mentions ten anywhere a collector can see', () => {
    for (const locale of ['es', 'en'] as const) {
      expect(getDictionary(locale).auth.passwordHint, locale).not.toContain('10');
    }
  });

  it('keeps the handle bounds and their message in agreement', () => {
    expect(HANDLE_MIN).toBe(3);
    expect(getDictionary('es').auth.handleTooShort).toContain('{min}');
  });
});
