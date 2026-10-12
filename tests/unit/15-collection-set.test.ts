import { describe, it, expect } from 'vitest';
import { SERIES_1_CLASSIC, classicSetProgress } from '../../src/lib/collection-set.ts';

/**
 * The Classic set board, approved by the client on 11 October 2026.
 *
 * Eight fixed slots, one per Classic character of Series 1. A slot fills when
 * the collector owns any piece of that character, so the board answers "what
 * am I missing" rather than "how many do I have" - which is the question that
 * brings someone back to a shop.
 *
 * Two completions, and they are not the same thing. Owning all eight is the
 * ordinary one. Owning all eight with the SAME printed number, a full 777
 * across every character, is the rare one, and it has to survive the collector
 * also owning a pile of other pieces.
 */

const piece = (serial: string, series = 'Series 1') => ({ serial, series });

/** One of each character, all at the given number. */
const fullSetAt = (n: number) =>
  SERIES_1_CLASSIC.map((code) => piece(`${code}-${String(n).padStart(6, '0')}`));

describe('an empty collection', () => {
  it('shows eight slots, none of them filled', () => {
    const progress = classicSetProgress([]);
    expect(progress.slots).toHaveLength(8);
    expect(progress.slots.every((s) => !s.owned)).toBe(true);
    expect(progress.owned).toBe(0);
    expect(progress.total).toBe(8);
    expect(progress.complete).toBe(false);
    expect(progress.matchingNumbers).toEqual([]);
  });

  it('keeps the slots in registry order, so the board never reshuffles', () => {
    const codes = classicSetProgress([]).slots.map((s) => s.characterCode);
    expect(codes).toEqual([...SERIES_1_CLASSIC]);
  });
});

describe('progress counts characters, not pieces', () => {
  it('a duplicate does not move the counter', () => {
    const progress = classicSetProgress([piece('SP-000001'), piece('SP-029999')]);
    expect(progress.owned).toBe(1);
    expect(progress.slots.filter((s) => s.owned)).toHaveLength(1);
  });

  it('counts each distinct character once', () => {
    const progress = classicSetProgress([
      piece('SP-000001'),
      piece('SP-000002'),
      piece('BM-000500'),
      piece('HQ-000003'),
    ]);
    expect(progress.owned).toBe(3);
  });

  it('fills the slot it should, and no other', () => {
    const progress = classicSetProgress([piece('HQ-000829')]);
    const filled = progress.slots.filter((s) => s.owned).map((s) => s.characterCode);
    expect(filled).toEqual(['HQ']);
  });

  it('remembers one serial per slot, for the link to that piece', () => {
    const progress = classicSetProgress([piece('WW-012000'), piece('WW-000007')]);
    const slot = progress.slots.find((s) => s.characterCode === 'WW')!;
    // The lowest number is the better piece to show: a collector shows off
    // their lowest, never their highest.
    expect(slot.serial).toBe('WW-000007');
  });
});

describe('the complete set', () => {
  it('is complete at eight distinct characters', () => {
    const progress = classicSetProgress(fullSetAt(123));
    expect(progress.owned).toBe(8);
    expect(progress.complete).toBe(true);
  });

  it('is not complete at seven, however many pieces those are', () => {
    const seven = SERIES_1_CLASSIC.slice(0, 7).flatMap((code) => [
      piece(`${code}-000001`),
      piece(`${code}-000002`),
    ]);
    const progress = classicSetProgress(seven);
    expect(progress.owned).toBe(7);
    expect(progress.complete).toBe(false);
  });
});

describe('the same number across all eight', () => {
  it('finds the number when every character carries it', () => {
    expect(classicSetProgress(fullSetAt(777)).matchingNumbers).toEqual([777]);
  });

  it('survives the collector owning other pieces too', () => {
    const pieces = [
      ...fullSetAt(777),
      piece('SP-012345'),
      piece('BM-000002'),
      piece('CY-008000'),
    ];
    expect(classicSetProgress(pieces).matchingNumbers).toEqual([777]);
  });

  it('finds nothing when one character breaks the run', () => {
    const pieces = fullSetAt(777).slice(0, 7).concat(piece('CY-000778'));
    const progress = classicSetProgress(pieces);
    expect(progress.complete).toBe(true);
    expect(progress.matchingNumbers).toEqual([]);
  });

  it('reports every matching number, lowest first', () => {
    const progress = classicSetProgress([...fullSetAt(777), ...fullSetAt(123)]);
    expect(progress.matchingNumbers).toEqual([123, 777]);
  });

  it('does not invent a match from duplicates of one character', () => {
    // Eight SP pieces numbered 1..8 is not a set, however it is counted.
    const pieces = Array.from({ length: 8 }, (_, i) =>
      piece(`SP-${String(i + 1).padStart(6, '0')}`),
    );
    const progress = classicSetProgress(pieces);
    expect(progress.owned).toBe(1);
    expect(progress.matchingNumbers).toEqual([]);
  });
});

describe('what does not belong to this board', () => {
  it('ignores a Limited piece, even of a Classic character', () => {
    // RF is not a Classic character, and a letter serial is not a Classic
    // piece. Neither may fill a slot.
    const progress = classicSetProgress([piece('RF-L00045')]);
    expect(progress.owned).toBe(0);
  });

  it('ignores pieces from another series', () => {
    const progress = classicSetProgress([piece('SP-000001', 'Series 2')]);
    expect(progress.owned).toBe(0);
  });

  it('ignores a serial it cannot read', () => {
    const progress = classicSetProgress([piece('nonsense'), piece('ZZ-000001')]);
    expect(progress.owned).toBe(0);
    expect(progress.matchingNumbers).toEqual([]);
  });

  it('the eight are the eight Classics of the production run', () => {
    expect([...SERIES_1_CLASSIC]).toEqual(['SP', 'BM', 'HQ', 'FL', 'WW', 'JK', 'SG', 'CY']);
  });
});
