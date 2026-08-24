import { createHash } from 'node:crypto';
import { ALPHABET, ALPHABET_SIZE } from '../codes/alphabet.ts';

/**
 * A four-character check that binds one row's three printed values together.
 *
 * The expensive failure in variable-data printing is not a bad value, it is a
 * ROW SHIFT. If one column slips by a single row somewhere in the factory's
 * pipeline, every affected hologram carries one piece's number beside another
 * piece's claim code. Each label looks perfect. None of them work. Nobody finds
 * out until a customer tries to claim, by which point the run is scrap.
 *
 * Comparing three fields row by row would catch it, but nobody does that across
 * 137,000 rows. One short value that changes if ANY of the three changes turns
 * that into a single comparison, and makes it mechanical enough to actually be
 * run on a sample.
 *
 * Deliberately NOT keyed and NOT secret. The whole point is that David, the
 * factory, and anyone auditing the file later can recompute it from the row
 * itself, with no key to lose and nothing to ask us for. It protects against
 * accident, not against an attacker - an attacker who could rewrite the file
 * could rewrite the checks too, and the AES archive plus the file checksum are
 * what cover that.
 *
 * It is never printed on the hologram. It exists so the FILE survives being
 * opened, re-saved, sorted and exported by someone else's software.
 */
export const ROW_CHECK_LENGTH = 4;

export function rowCheck(
  pieceNumber: string,
  qrUrl: string,
  claimCode: string,
): string {
  // A separator that cannot occur inside any of the three fields, so
  // ("AB", "C") and ("A", "BC") can never hash to the same thing.
  const canonical = [pieceNumber, qrUrl, claimCode].join('');
  const digest = createHash('sha256').update(canonical, 'utf8').digest();

  let out = '';
  for (let i = 0; i < ROW_CHECK_LENGTH; i++) {
    out += ALPHABET[digest[i]! % ALPHABET_SIZE];
  }
  return out;
}

/** Verify a row against its own check. Used by the export self-audit. */
export function rowCheckMatches(
  pieceNumber: string,
  qrUrl: string,
  claimCode: string,
  expected: string,
): boolean {
  return rowCheck(pieceNumber, qrUrl, claimCode) === expected;
}
