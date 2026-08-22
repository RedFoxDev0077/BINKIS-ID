import { isAlphabetString, normaliseCode } from './alphabet.ts';
import { cryptoRandom, drawFromAlphabet, type RandomSource } from './random.ts';

/**
 * The QR token.
 *
 * Twelve random characters, and nothing else. It is not derived from the
 * serial, the claim code or the internal id, and none of those can be derived
 * from it. A photographed QR is worth exactly one public page view.
 *
 * Keyspace is 31^12, about 7.9e17. Enumerating the ~140,000 live tokens by
 * guessing is not a threat model, it is a rounding error.
 *
 * Twelve characters also keeps the payload short, which keeps the QR version
 * low, which keeps the printed modules large - and large modules are what
 * survive being printed on reflective holographic foil.
 */

export const QR_TOKEN_LENGTH = 12;

export const DEFAULT_PUBLIC_ORIGIN = 'https://id.binkis.com';

export function generateQrToken(rng: RandomSource = cryptoRandom): string {
  return drawFromAlphabet(rng, QR_TOKEN_LENGTH);
}

export function isWellFormedQrToken(value: string): boolean {
  return value.length === QR_TOKEN_LENGTH && isAlphabetString(value);
}

export function parseQrToken(raw: string): string | null {
  const normalised = normaliseCode(raw);
  return isWellFormedQrToken(normalised) ? normalised : null;
}

/**
 * The entire QR payload. No tracking parameters, no campaign tags, no serial,
 * no claim code, no internal id. Anything added here is added to 134,399
 * physical objects that cannot be recalled.
 */
export function qrPayload(token: string, origin: string = DEFAULT_PUBLIC_ORIGIN): string {
  if (!isWellFormedQrToken(token)) {
    throw new Error(`Refusing to build a QR payload for malformed token "${token}"`);
  }
  return `${origin.replace(/\/+$/, '')}/p/${token}`;
}
