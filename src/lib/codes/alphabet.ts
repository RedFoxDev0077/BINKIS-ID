/**
 * The 31-character unambiguous alphabet.
 *
 * 0, 1, O, I and L are excluded so a code cannot be misread off reflective
 * holographic foil, in a shop, in bad light, by someone squinting at a
 * scratch panel. This is the single most consequential constant in the
 * system: it is stamped onto physical objects and cannot be changed after
 * the factory runs.
 */
export const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export const ALPHABET_SIZE = ALPHABET.length;

/** Characters deliberately kept out of the alphabet, for documentation and tests. */
export const EXCLUDED_CHARACTERS = '01OIL';

const INDEX = new Map<string, number>();
for (let i = 0; i < ALPHABET.length; i++) INDEX.set(ALPHABET[i]!, i);

export function indexOfChar(char: string): number {
  return INDEX.get(char) ?? -1;
}

export function charAtIndex(index: number): string {
  const char = ALPHABET[index];
  if (char === undefined) {
    throw new RangeError(`Alphabet index out of range: ${index}`);
  }
  return char;
}

export function isAlphabetString(value: string): boolean {
  if (value.length === 0) return false;
  for (const char of value) {
    if (!INDEX.has(char)) return false;
  }
  return true;
}

/**
 * Turn what a human typed on a phone into a canonical code.
 *
 * Uppercases, and strips whitespace and any dash-like character (iOS
 * autocorrect will happily turn a typed hyphen into an en or em dash).
 *
 * It deliberately does NOT try to repair an excluded character. Mapping
 * O to 0 or I to 1 would be meaningless, because 0 and 1 are not in the
 * alphabet either - there is no valid character to repair towards. Guessing
 * would let a typo reach the database and burn a rate-limited attempt.
 * Rejecting is both safer and more honest.
 */
export function normaliseCode(raw: string): string {
  // ‐-― covers hyphen through horizontal bar (en dash, em dash);
  // − is minus; ﹘/﹣/－ are the small and fullwidth forms.
  return raw.replace(/[\s\-_.‐-―−﹘﹣－]/g, '').toUpperCase();
}
