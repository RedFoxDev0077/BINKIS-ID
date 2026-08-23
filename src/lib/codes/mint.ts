import { appendCheckCharacter } from './check-character.ts';
import { cryptoRandom, drawFromAlphabet, type RandomSource } from './random.ts';
import { CLAIM_CODE_PAYLOAD_LENGTH } from './claim-code.ts';
import { QR_TOKEN_LENGTH } from './qr-token.ts';

/**
 * Minting. Server only.
 *
 * Deliberately separated from claim-code.ts and qr-token.ts, which are pure
 * and safe to import anywhere. Everything here reaches for node:crypto, and
 * the browser has no business creating a claim code or a QR token: it only
 * ever validates what the user typed.
 *
 * The split is enforced by the bundler rather than by discipline. Importing
 * this file from a client component fails the build, which is how the mistake
 * was caught in the first place.
 */

export function generateClaimCode(rng: RandomSource = cryptoRandom): string {
  const payload = drawFromAlphabet(rng, CLAIM_CODE_PAYLOAD_LENGTH);
  return appendCheckCharacter(payload);
}

export function generateQrToken(rng: RandomSource = cryptoRandom): string {
  return drawFromAlphabet(rng, QR_TOKEN_LENGTH);
}

export { cryptoRandom, type RandomSource };
