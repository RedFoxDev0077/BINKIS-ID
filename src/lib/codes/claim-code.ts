import { isAlphabetString, normaliseCode } from './alphabet.ts';
import { appendCheckCharacter, hasValidCheckCharacter } from './check-character.ts';
import { cryptoRandom, drawFromAlphabet, type RandomSource } from './random.ts';

/**
 * The Claim Code.
 *
 * Ten random characters from the 31-character alphabet plus one GF(31)
 * weighted check character, displayed as XXXX-XXXX-XXX.
 *
 * Keyspace is 31^10, about 8.2e14. Against roughly 140,000 live codes that is
 * one guess in ~5.9 billion - and a guess also has to be aimed at the right
 * piece, because a code only claims the piece it was minted for.
 *
 * Plaintext exists in exactly two places for its whole life: in memory during
 * generation, and inside the encrypted factory export. It is never stored,
 * never logged, never returned.
 */

export const CLAIM_CODE_LENGTH = 11;
export const CLAIM_CODE_PAYLOAD_LENGTH = 10;

export function generateClaimCode(rng: RandomSource = cryptoRandom): string {
  const payload = drawFromAlphabet(rng, CLAIM_CODE_PAYLOAD_LENGTH);
  return appendCheckCharacter(payload);
}

/** XXXX-XXXX-XXX, the form printed under the scratch panel. */
export function formatClaimCode(code: string): string {
  const normalised = normaliseCode(code);
  if (normalised.length !== CLAIM_CODE_LENGTH) {
    throw new Error(`Cannot format a claim code of length ${normalised.length}`);
  }
  return `${normalised.slice(0, 4)}-${normalised.slice(4, 8)}-${normalised.slice(8, 11)}`;
}

/**
 * Turn user input into a canonical claim code, or null.
 *
 * Null covers every rejection: wrong length, an excluded character, a failed
 * check character. Callers must not distinguish between them to the user.
 */
export function parseClaimCode(raw: string): string | null {
  const normalised = normaliseCode(raw);
  if (normalised.length !== CLAIM_CODE_LENGTH) return null;
  if (!isAlphabetString(normalised)) return null;
  if (!hasValidCheckCharacter(normalised, CLAIM_CODE_LENGTH)) return null;
  return normalised;
}

export function isWellFormedClaimCode(raw: string): boolean {
  return parseClaimCode(raw) !== null;
}
