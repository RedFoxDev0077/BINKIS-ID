import { randomBytes } from 'node:crypto';
import { ALPHABET, ALPHABET_SIZE, charAtIndex } from './alphabet.ts';

/**
 * A source of random strings over the 31-character alphabet.
 *
 * Injectable so tests can feed a deliberately broken source and prove the
 * generator survives a collision through the database constraint rather than
 * through an application-level pre-check.
 */
export type RandomSource = (length: number) => string;

// 256 is not a multiple of 31. Taking `byte % 31` would over-represent the
// first eight characters by about 3%, which quietly shrinks the keyspace of
// every claim code we ever print. Reject the biased tail instead.
const REJECT_AT = 256 - (256 % ALPHABET_SIZE); // 248

/** Cryptographically secure, uniform over the alphabet. */
export const cryptoRandom: RandomSource = (length: number): string => {
  if (!Number.isInteger(length) || length <= 0) {
    throw new RangeError(`Invalid random length: ${length}`);
  }

  let out = '';
  while (out.length < length) {
    // Over-draw so the common case is a single syscall.
    const bytes = randomBytes((length - out.length) * 2 + 8);
    for (const byte of bytes) {
      if (byte >= REJECT_AT) continue;
      out += charAtIndex(byte % ALPHABET_SIZE);
      if (out.length === length) break;
    }
  }
  return out;
};

/** Guard against an injected source that hands back something unusable. */
export function drawFromAlphabet(rng: RandomSource, length: number): string {
  const value = rng(length);
  if (typeof value !== 'string' || value.length !== length) {
    throw new Error(
      `Random source returned ${typeof value} of length ${
        (value as string)?.length
      }, expected a string of length ${length}`,
    );
  }
  for (const char of value) {
    if (!ALPHABET.includes(char)) {
      throw new Error(
        `Random source emitted "${char}", which is not in the 31-character alphabet`,
      );
    }
  }
  return value;
}
