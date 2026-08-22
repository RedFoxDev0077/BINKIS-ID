import { ALPHABET_SIZE, charAtIndex, indexOfChar, isAlphabetString } from './alphabet.ts';

/**
 * The check character: a weighted checksum over GF(31).
 *
 * This runs client-side, before the code ever reaches a server action. Its job
 * is to make sure a typo is rejected in the browser rather than consuming one
 * of a small number of rate-limited claim attempts.
 *
 *     check = -( sum of w_i * x_i ) mod 31
 *
 * where x_i is the alphabet index of each payload character and the weights
 * are 2, 3, 4 ... for the payload, with weight 1 reserved for the check
 * character itself. Verification is simply that the whole weighted sum,
 * check character included, is 0 mod 31.
 *
 * Guarantees, both exhaustively tested:
 *
 *   - EVERY single-character substitution is detected, at every position.
 *   - EVERY transposition of two characters is detected, adjacent or not.
 *
 * Both fall directly out of 31 being prime. A substitution at position i
 * shifts the sum by w_i * d; since GF(31) is a field and no weight is 0 mod
 * 31, that product can only be zero if d is zero, meaning nothing changed. A
 * swap of positions i and j shifts the sum by (w_i - w_j)(x_j - x_i), and the
 * weights are all distinct and all less than 31, so neither factor can vanish
 * unless the two characters were equal to begin with. That last part is why
 * the check character gets weight 1 and the payload starts at 2: if any two
 * positions shared a weight, swapping exactly those two would be invisible.
 *
 * ---------------------------------------------------------------------------
 * Why this and not Luhn mod 31
 *
 * CLAUDE.md originally specified Luhn mod 31, and this was built that way
 * first. Luhn is the right instinct, but its error-detection guarantee depends
 * on an EVEN modulus, which is what makes the base-10 doubling map a bijection
 * on 0..9. Over 31 the map collapses: d(x) = floor(2x/31) + (2x mod 31) sends
 * both x and x + 15 to the same value, so at every doubled position exactly
 * one wrong character validates. Measured, it caught 98.5% of single-character
 * typos and missed one adjacent transposition pair, '2' with 'Z'.
 *
 * The blind-spot pairs were 3/J 4/K 5/M 6/N 7/P 8/Q 9/R A/S B/T C/U D/V E/W
 * F/X G/Y H/Z. None of them are visually confusable, so the "cannot be misread
 * off foil" property was never the problem - the cost was simply that 1.5% of
 * typos reached the server and burned a rate-limited attempt.
 *
 * This is the same single printed character on the hologram, the same
 * client-side check, and the same factory specification. It is strictly
 * stronger, and it was changed while the batch could still be regenerated
 * for free. Approved by the client 20 August 2026, before any print run.
 * ---------------------------------------------------------------------------
 */

/** Claim codes are the only codes in the system that carry a check character. */
export const CHECKED_CODE_LENGTH = 11;

/**
 * Weight 1 belongs to the check character, so payload weights start at 2.
 * Every position therefore has a distinct weight, which is what makes
 * transpositions detectable.
 */
const FIRST_PAYLOAD_WEIGHT = 2;

/**
 * Beyond this the weights would reach 31 and wrap to 0, silently blinding the
 * checksum at that position. Our payload is 10 characters, so this is a guard
 * against a future change rather than a live constraint.
 */
const MAX_PAYLOAD_LENGTH = ALPHABET_SIZE - FIRST_PAYLOAD_WEIGHT; // 29

function weightedSum(payload: string): number {
  if (payload.length > MAX_PAYLOAD_LENGTH) {
    throw new Error(
      `Check character supports at most ${MAX_PAYLOAD_LENGTH} payload characters; ` +
        `beyond that the weights wrap past 31 and stop detecting errors.`,
    );
  }

  let sum = 0;
  for (let i = 0; i < payload.length; i++) {
    const codePoint = indexOfChar(payload[i]!);
    if (codePoint < 0) {
      throw new Error(`Character "${payload[i]}" is not in the 31-character alphabet`);
    }
    sum += (i + FIRST_PAYLOAD_WEIGHT) * codePoint;
  }
  return sum;
}

/** The check character for a payload. Throws on characters outside the alphabet. */
export function checkCharacter(payload: string): string {
  if (!isAlphabetString(payload)) {
    throw new Error('Check character payload contains characters outside the alphabet');
  }
  const remainder = weightedSum(payload) % ALPHABET_SIZE;
  return charAtIndex((ALPHABET_SIZE - remainder) % ALPHABET_SIZE);
}

export function appendCheckCharacter(payload: string): string {
  return payload + checkCharacter(payload);
}

/**
 * Validate a complete code, check character included.
 *
 * Returns false rather than throwing for anything malformed - wrong length,
 * excluded characters, empty string. Callers are handling user input, and a
 * thrown exception on a typo is not useful control flow.
 */
export function hasValidCheckCharacter(
  value: string,
  expectedLength: number = CHECKED_CODE_LENGTH,
): boolean {
  if (value.length !== expectedLength) return false;
  if (!isAlphabetString(value)) return false;

  const payload = value.slice(0, -1);
  const check = indexOfChar(value[value.length - 1]!);

  // Weight 1 on the check character, so it enters the sum unscaled.
  return (weightedSum(payload) + check) % ALPHABET_SIZE === 0;
}
