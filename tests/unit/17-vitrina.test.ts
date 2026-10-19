import { describe, it, expect } from 'vitest';
import { NICHES, STAGE, nicheFor } from '../../src/lib/characters/vitrina.ts';
import { SERIES_1_CLASSIC } from '../../src/lib/collection-set.ts';
import { CHARACTER_CODES } from '../../src/lib/serial.ts';

/**
 * The display case, delivered by the client's animator on 18 October 2026.
 *
 * Almost nothing here can go wrong at runtime in a way anyone would notice:
 * a layer in the wrong place is obvious the moment the page is opened. One
 * thing can, and silently. The case is addressed by the character code on a
 * serial, the files are named by the animator's own keys, and the two do not
 * agree: Harley Quinn is `HQ` on every piece ever printed and `harleyqueen`
 * in the render. Get that mapping wrong for one character and that collector
 * owns a figure the case will never light, with nothing in the logs.
 *
 * So the mapping is what is tested, against both sides of it.
 */

describe('every Classic has a niche', () => {
  it('covers the eight characters of the Series 1 board, and only those', () => {
    const inCase = NICHES.map((n) => n.characterCode).sort();
    expect(inCase).toEqual([...SERIES_1_CLASSIC].sort());
  });

  it('finds a niche for every code the board asks about', () => {
    for (const code of SERIES_1_CLASSIC) {
      expect(nicheFor(code), code).not.toBeNull();
    }
  });

  it('uses codes the registry actually knows', () => {
    for (const niche of NICHES) {
      expect(CHARACTER_CODES, niche.characterCode).toHaveProperty(niche.characterCode);
    }
  });

  it('names each niche the way the registry names the character', () => {
    for (const niche of NICHES) {
      const known = CHARACTER_CODES as Record<string, string>;
      expect(niche.name, niche.characterCode).toBe(known[niche.characterCode]);
    }
  });

  it('has nothing for a character that is not in the case', () => {
    // Deathstroke is Legendary and Bizarro is Limited: neither is on this
    // board, and asking for them must be a null rather than a wrong niche.
    expect(nicheFor('DS')).toBeNull();
    expect(nicheFor('BIZ')).toBeNull();
  });

  it('does not care about case', () => {
    expect(nicheFor('sp')?.key).toBe('superman');
  });
});

describe('the file keys are the animator\'s, not ours', () => {
  it('keeps the eight key spellings the delivered files use', () => {
    // Taken from the file names in the 18 October delivery. `harleyqueen` is
    // theirs and is deliberately not corrected: renaming it here would point
    // at files that do not exist.
    expect(NICHES.map((n) => n.key)).toEqual([
      'superman',
      'supergirl',
      'wonderwoman',
      'batman',
      'flash',
      'cyborg',
      'joker',
      'harleyqueen',
    ]);
  });

  it('gives every niche a distinct key and a distinct code', () => {
    expect(new Set(NICHES.map((n) => n.key)).size).toBe(NICHES.length);
    expect(new Set(NICHES.map((n) => n.characterCode)).size).toBe(NICHES.length);
  });
});

describe('the geometry', () => {
  it('keeps every layer inside the render it was cut from', () => {
    for (const niche of NICHES) {
      for (const [name, box] of Object.entries({
        espacio: niche.espacio,
        placa: niche.placa,
        silueta: niche.silueta,
        pieza: niche.pieza,
      })) {
        const where = `${niche.key}.${name}`;
        expect(box.w, where).toBeGreaterThan(0);
        expect(box.h, where).toBeGreaterThan(0);
        expect(box.x, where).toBeGreaterThanOrEqual(0);
        expect(box.y, where).toBeGreaterThanOrEqual(0);
        expect(box.x + box.w, where).toBeLessThanOrEqual(STAGE.w);
        expect(box.y + box.h, where).toBeLessThanOrEqual(STAGE.h);
      }
    }
  });

  it('puts the figure and its silhouette in exactly the same place', () => {
    // They are the same render: the silhouette has to sit under the figure
    // to the pixel, or the niche shifts as it lights up.
    for (const niche of NICHES) {
      expect(niche.pieza, niche.key).toEqual(niche.silueta);
    }
  });

  it('puts the plate below its own niche', () => {
    for (const niche of NICHES) {
      expect(niche.placa.y, niche.key).toBeGreaterThan(niche.espacio.y);
    }
  });

  it('gives every niche a colour for its halo', () => {
    for (const niche of NICHES) {
      expect(niche.color, niche.key).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
