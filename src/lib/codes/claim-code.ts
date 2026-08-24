import { isAlphabetString, normaliseCode } from './alphabet.ts';
import { hasValidCheckCharacter } from './check-character.ts';

/**
 * The Claim Code.
 *
 * Eight random characters from the 31-character alphabet plus one GF(31)
 * weighted check character, displayed as XXX-XXX-XXX.
 *
 * Keyspace is 31^8, about 8.5e11. A code only ever claims the piece it was
 * minted for, so the number that matters is the odds of guessing one specific
 * piece's code: about one in 850 billion, per attempt, against a rate limit.
 *
 * Shortened from eleven characters at the client's request on 24 Aug 2026, to
 * reduce typing on a phone. Nine is the floor, and the binding constraint is
 * not guessing - it is PARTIAL DISCLOSURE. Scratch panels get rubbed in
 * transit, opened halfway, and photographed. With nine characters, half a code
 * showing still leaves ~923,000 combinations. At seven it leaves ~30,000,
 * which is guessable if rate limiting ever fails.
 *
 * Plaintext exists in exactly two places for its whole life: in memory during
 * generation, and inside the encrypted factory export. It is never stored,
 * never logged, never returned.
 *
 * This module is PURE: formatting, parsing and validation only, with no
 * node:crypto import, so a client component can use it to check a typed code
 * without dragging the minting path into the browser bundle. Minting lives
 * in mint.ts.
 */

export const CLAIM_CODE_LENGTH = 9;
export const CLAIM_CODE_PAYLOAD_LENGTH = 8;


/**
 * XXX-XXX-XXX, the form printed under the scratch panel.
 *
 * Three groups of three rather than 4-4-3: shorter groups are easier to read
 * back off foil and to dictate over a phone.
 */
export function formatClaimCode(code: string): string {
  const normalised = normaliseCode(code);
  if (normalised.length !== CLAIM_CODE_LENGTH) {
    throw new Error(`Cannot format a claim code of length ${normalised.length}`);
  }
  return `${normalised.slice(0, 3)}-${normalised.slice(3, 6)}-${normalised.slice(6, 9)}`;
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
