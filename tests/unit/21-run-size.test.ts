import { describe, it, expect } from 'vitest';
import { reconcileRunSize, SerialRangeError } from '../../src/lib/serial.ts';

/**
 * The run size is what the passport prints after the slash: "45 / 777".
 *
 * It lives on the Product, not on the Piece, so one row governs every piece of
 * that edition - and that is exactly why adding to a run is dangerous. The
 * generator upserts the product with `update: {}`, so a batch appended to an
 * existing product inherits the OLD run size. Generate 223 more Brainiacs
 * without moving it and every passport in the edition, new and old, still
 * reads "/ 7,777", while the new pieces read "7,999 / 7,777", which is
 * nonsense to the person holding the piece.
 *
 * This happened once already. The Variant run went from 2,777 to 4,777 on
 * 4 November 2026 and the run size had to be moved by hand afterwards. A hand
 * step that must not be forgotten is a bug waiting for the one time it is.
 *
 * So the rule is: either the caller declares the new run size, or a batch that
 * would overflow the declared run is refused before anything is written.
 */
describe('reconcileRunSize', () => {
  const numbered = { editionNumbered: true };

  it('leaves a run alone when the batch fits inside it', () => {
    const result = reconcileRunSize({ current: 7_777, lastPosition: 5_000, ...numbered });
    expect(result).toEqual({ runSize: 7_777, move: null });
  });

  it('moves the run when a new size is declared, and says so', () => {
    const result = reconcileRunSize({
      current: 7_777,
      declared: 8_000,
      lastPosition: 8_000,
      ...numbered,
    });
    expect(result).toEqual({ runSize: 8_000, move: { from: 7_777, to: 8_000 } });
  });

  it('reports no move when the declared size is the one already stored', () => {
    const result = reconcileRunSize({
      current: 777,
      declared: 777,
      lastPosition: 777,
      ...numbered,
    });
    expect(result).toEqual({ runSize: 777, move: null });
  });

  /**
   * The case that matters. This is the Brainiac batch with the --run-size
   * flag forgotten: 223 pieces appended at position 7,778 onward, against a
   * product that still says the run is 7,777.
   */
  it('refuses a batch that would run past the declared size', () => {
    expect(() =>
      reconcileRunSize({ current: 7_777, lastPosition: 8_000, ...numbered }),
    ).toThrow(SerialRangeError);

    expect(() =>
      reconcileRunSize({ current: 7_777, lastPosition: 8_000, ...numbered }),
    ).toThrow(/run of 7,?777.*8,?000|--run-size/s);
  });

  it('refuses a declared size that is still too small for the batch', () => {
    // Asking for 7,900 while generating up to 8,000 is the same mistake with
    // an extra step, and it has to fail the same way.
    expect(() =>
      reconcileRunSize({ current: 7_777, declared: 7_900, lastPosition: 8_000, ...numbered }),
    ).toThrow(SerialRangeError);
  });

  it('refuses to shrink a run below pieces that already exist', () => {
    // Pieces are immutable. A run cannot be cut to a size that would orphan
    // numbers already minted and possibly already printed.
    expect(() =>
      reconcileRunSize({ current: 4_777, declared: 2_777, lastPosition: 2_777, ...numbered }),
    ).toThrow(SerialRangeError);
  });

  /**
   * Classic and Spare carry no edition position - there is no "45 of 30,000"
   * on a Classic sticker - so the run size is informational and a batch that
   * passes it is not a contradiction, just a bigger run.
   */
  it('does not police un-numbered editions', () => {
    const result = reconcileRunSize({
      current: 30_000,
      lastPosition: 31_000,
      editionNumbered: false,
    });
    expect(result).toEqual({ runSize: 30_000, move: null });
  });

  it('still moves an un-numbered run when one is declared', () => {
    const result = reconcileRunSize({
      current: 30_000,
      declared: 32_000,
      lastPosition: 31_000,
      editionNumbered: false,
    });
    expect(result).toEqual({ runSize: 32_000, move: { from: 30_000, to: 32_000 } });
  });
});

/**
 * The two additions the client confirmed on 8 November 2026, as the generator
 * will be asked for them. Written as a test so the numbers are checked rather
 * than retyped from memory at a terminal.
 */
describe('the November additions', () => {
  it('takes Brainiac from 7,777 to 8,000', () => {
    // 223 new pieces, positions 7,778 .. 8,000.
    expect(
      reconcileRunSize({
        current: 7_777,
        declared: 8_000,
        lastPosition: 7_777 + 223,
        editionNumbered: true,
      }),
    ).toEqual({ runSize: 8_000, move: { from: 7_777, to: 8_000 } });
  });

  it('takes Poison Ivy from 2,222 to 2,777', () => {
    // 555 new pieces, positions 2,223 .. 2,777.
    expect(
      reconcileRunSize({
        current: 2_222,
        declared: 2_777,
        lastPosition: 2_222 + 555,
        editionNumbered: true,
      }),
    ).toEqual({ runSize: 2_777, move: { from: 2_222, to: 2_777 } });
  });
});
