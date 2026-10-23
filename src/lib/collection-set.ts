import { parseSerial } from './serial.ts';

/**
 * The Classic set board: eight slots, one per character of Series 1.
 *
 * A slot asks "do you own this character", not "how many do you own", because
 * the board exists to show what is missing. Duplicates are worth something to
 * a collector, but they are not progress.
 *
 * Two completions live here and they are deliberately separate. Eight distinct
 * characters is the one most people reach. Eight characters all carrying the
 * SAME printed number is the rare one, and it has to hold even when the
 * collector owns a drawer full of other pieces, because that is exactly the
 * person who will reach it.
 */

/** The eight Classics of Series 1, in the order the production run lists them. */
export const SERIES_1_CLASSIC = ['SP', 'BM', 'HQ', 'FL', 'WW', 'JK', 'SG', 'CY'] as const;

export const SERIES_1 = 'Series 1';

export interface OwnedPiece {
  serial: string;
  series: string;
  /** The piece's public lookup key, so a slot can link to its passport. */
  qrToken?: string;
}

export interface SetSlot {
  characterCode: string;
  owned: boolean;
  /** The lowest-numbered piece held for this character, for the link to it. */
  serial: string | null;
  /** That same piece's token. Null when the character is not owned. */
  qrToken: string | null;
}

export interface SetProgress {
  slots: SetSlot[];
  /** Distinct characters owned, 0 to 8. */
  owned: number;
  total: number;
  complete: boolean;
  /** Numbers held across all eight characters at once, lowest first. */
  matchingNumbers: number[];
}

export function classicSetProgress(
  pieces: readonly OwnedPiece[],
  series: string = SERIES_1,
): SetProgress {
  // Lowest number per character, and the set of numbers held per character.
  const best = new Map<string, { serial: string; number: number; qrToken: string | null }>();
  const numbers = new Map<string, Set<number>>();

  for (const piece of pieces) {
    if (piece.series !== series) continue;

    const parsed = parseSerial(piece.serial);
    // Classic only: a letter serial is a special edition and belongs to a
    // different board, even when its character shares a code.
    if (!parsed || parsed.editionType !== 'CLASSIC') continue;

    const code = parsed.characterCode;
    if (!(SERIES_1_CLASSIC as readonly string[]).includes(code)) continue;

    const held = numbers.get(code) ?? new Set<number>();
    held.add(parsed.number);
    numbers.set(code, held);

    const current = best.get(code);
    if (!current || parsed.number < current.number) {
      best.set(code, {
        serial: piece.serial,
        number: parsed.number,
        qrToken: piece.qrToken ?? null,
      });
    }
  }

  const slots: SetSlot[] = SERIES_1_CLASSIC.map((code) => ({
    characterCode: code,
    owned: best.has(code),
    serial: best.get(code)?.serial ?? null,
    qrToken: best.get(code)?.qrToken ?? null,
  }));

  const owned = slots.filter((slot) => slot.owned).length;
  const complete = owned === SERIES_1_CLASSIC.length;

  // A matching number has to exist for every character, so the smallest
  // character's numbers are the only candidates worth testing.
  let matchingNumbers: number[] = [];
  if (complete) {
    const smallest = [...numbers.values()].reduce((a, b) => (a.size <= b.size ? a : b));
    matchingNumbers = [...smallest]
      .filter((n) => [...numbers.values()].every((held) => held.has(n)))
      .sort((a, b) => a - b);
  }

  return { slots, owned, total: SERIES_1_CLASSIC.length, complete, matchingNumbers };
}
