import { createHmac, timingSafeEqual } from 'node:crypto';
import { isAlphabetString, normaliseCode } from './codes/alphabet.ts';
import { CLAIM_CODE_LENGTH } from './codes/claim-code.ts';

/**
 * Claim codes are stored only as HMAC-SHA256 under a server-side pepper.
 *
 * Not bcrypt or argon2: those are for passwords, where the input is
 * low-entropy and human-chosen. A claim code is 31^10 of uniform machine
 * entropy, so the offline-guessing threat a slow KDF defends against does not
 * apply, and we need to hash 134,399 of them in one CLI run and look one up
 * by exact match on every claim. HMAC with a secret pepper is the right shape:
 * the lookup is an indexed equality on claim_hash, and without the pepper the
 * hashes are not attackable at all.
 *
 * The pepper lives in the environment, never in the database. That separation
 * is the entire security boundary. A database dump on its own yields nothing.
 *
 * The pepper must never be rotated after a batch has been printed. Rotation
 * invalidates every physical hologram already in the world.
 */

export const MIN_PEPPER_LENGTH = 32;

export class PepperError extends Error {
  override name = 'PepperError';
}

export function assertPepper(pepper: string): void {
  if (!pepper) {
    throw new PepperError(
      'CLAIM_CODE_PEPPER is not set. Refusing to hash a claim code without it.',
    );
  }
  if (pepper.length < MIN_PEPPER_LENGTH) {
    throw new PepperError(
      `CLAIM_CODE_PEPPER is ${pepper.length} characters. It must be at least ` +
        `${MIN_PEPPER_LENGTH}. Generate one with: openssl rand -base64 48`,
    );
  }
}

/**
 * HMAC-SHA256(pepper, normalised code), hex.
 *
 * The code is normalised first so the hyphenated display form and the raw
 * form produce the same hash.
 *
 * This deliberately does not validate the check character. That is a
 * client-side input control, not a property of the code itself, and the claim
 * path checks it separately before it ever gets here.
 */
export function hashClaimCode(code: string, pepper: string): string {
  assertPepper(pepper);

  const normalised = normaliseCode(code);
  if (normalised.length !== CLAIM_CODE_LENGTH || !isAlphabetString(normalised)) {
    throw new Error('Refusing to hash a value that is not a well-formed claim code');
  }

  return createHmac('sha256', pepper).update(normalised, 'utf8').digest('hex');
}

/** Constant-time comparison of two hex hashes. */
export function hashesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return timingSafeEqual(bufA, bufB);
}
