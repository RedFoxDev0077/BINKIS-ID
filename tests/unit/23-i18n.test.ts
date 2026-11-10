import { describe, it, expect } from 'vitest';
import { en } from '../../src/lib/i18n/en.ts';
import { es } from '../../src/lib/i18n/es.ts';
import { DEFAULT_LOCALE, LOCALES, isLocale } from '../../src/lib/i18n/index.ts';

/**
 * The two dictionaries have to stay the same shape, and that matters more
 * since 10 November 2026 than it did before.
 *
 * TypeScript types `es` against `typeof en`, which catches a key that is
 * missing outright. It does not catch the opposite drift, and it does not
 * catch a nested object that has gained a key on one side only, because a
 * wider object still satisfies the narrower type.
 *
 * Before today a gap like that would have shown an English string to the
 * minority of visitors who had switched to English. The site now opens in
 * English for everyone, so the same gap would be the first thing almost every
 * visitor reads. Worth a test rather than a habit.
 */

type Dict = Record<string, unknown>;

function keyPaths(value: Dict, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, child]) =>
    child !== null && typeof child === 'object' && !Array.isArray(child)
      ? keyPaths(child as Dict, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

describe('dictionaries', () => {
  it('cover exactly the same keys, nested ones included', () => {
    const inEnglish = keyPaths(en as unknown as Dict).sort();
    const inSpanish = keyPaths(es as unknown as Dict).sort();
    expect(inSpanish).toEqual(inEnglish);
  });

  it('has no empty string anywhere', () => {
    for (const [name, dict] of [
      ['en', en],
      ['es', es],
    ] as const) {
      const empty = keyPaths(dict as unknown as Dict).filter((path) => {
        const value = path.split('.').reduce<unknown>((o, k) => (o as Dict)?.[k], dict);
        return typeof value === 'string' && value.trim() === '';
      });
      expect(empty, `${name} has blank strings`).toEqual([]);
    }
  });

  /*
   * Every {placeholder} in one language must exist in the other.
   *
   * `fill` leaves an unmatched placeholder in the output verbatim, so a
   * Spanish string that forgot {size} prints the literal text "{size}" on
   * someone's phone rather than failing anywhere a test would see.
   */
  it('uses the same placeholders in both languages', () => {
    const placeholders = (s: string) => (s.match(/\{(\w+)\}/g) ?? []).sort();

    for (const path of keyPaths(en as unknown as Dict)) {
      const read = (d: unknown) => path.split('.').reduce<unknown>((o, k) => (o as Dict)?.[k], d);
      const a = read(en);
      const b = read(es);
      if (typeof a !== 'string' || typeof b !== 'string') continue;
      expect(placeholders(b), `${path} placeholders differ`).toEqual(placeholders(a));
    }
  });
});

describe('locale resolution', () => {
  /*
   * Pinned deliberately. The client asked for an English-first site on
   * 10 November 2026 for a branding reason, and this is the line that
   * delivers it. If it ever goes back to 'es' that should be a decision
   * someone made on purpose, not a merge.
   */
  it('defaults to English', () => {
    expect(DEFAULT_LOCALE).toBe('en');
  });

  it('knows both languages and nothing else', () => {
    expect([...LOCALES].sort()).toEqual(['en', 'es']);
    expect(isLocale('en')).toBe(true);
    expect(isLocale('es')).toBe(true);
    expect(isLocale('fr')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});
