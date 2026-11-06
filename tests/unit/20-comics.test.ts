import { describe, it, expect } from 'vitest';
import {
  COMICS,
  chapterHref,
  findChapter,
  findComic,
  firstReadable,
  hasReadableComic,
  isReadable,
  readableChapters,
  type Comic,
  type ComicChapter,
} from '../../src/lib/comics/catalog.ts';
import { es } from '../../src/lib/i18n/es.ts';
import { en } from '../../src/lib/i18n/en.ts';

/**
 * The UNIVERSALS catalogue and the rule that keeps the button honest.
 *
 * The promo block links to a chapter. If the catalogue ever says a chapter is
 * readable when it has no pages in that language, the button becomes a
 * promise the site cannot keep, which is precisely what the client asked us
 * to avoid: "El misterio debe estar en la historia, no en adivinar qué hace
 * el botón."
 */

function chapter(overrides: Partial<ComicChapter> = {}): ComicChapter {
  return {
    number: 1,
    title: { es: 'Uno', en: 'One' },
    pages: null,
    publishedAt: null,
    ...overrides,
  };
}

const PAGE = { image: '/comics/x/1.jpg', width: 6050, height: 9094, numbers: [1] } as const;
const SPREAD = {
  image: '/comics/x/2-3.jpg',
  width: 12100,
  height: 9094,
  numbers: [2, 3],
} as const;

describe('readability', () => {
  it('is false while a chapter is unpublished, even with pages', () => {
    const c = chapter({ pages: { es: [PAGE], en: [PAGE] }, publishedAt: null });
    expect(isReadable(c, 'es')).toBe(false);
  });

  it('is false while a published chapter has no pages at all', () => {
    const c = chapter({ pages: null, publishedAt: '2026-11-06' });
    expect(isReadable(c, 'es')).toBe(false);
  });

  it('is false for the language that is missing, true for the one that is not', () => {
    // The half-delivered case: the letterer finished Spanish first. An
    // English reader must not be handed an empty chapter.
    const c = chapter({ pages: { es: [PAGE], en: [] }, publishedAt: '2026-11-06' });
    expect(isReadable(c, 'es')).toBe(true);
    expect(isReadable(c, 'en')).toBe(false);
  });

  it('is true once published with pages in that language', () => {
    const c = chapter({ pages: { es: [PAGE, SPREAD], en: [PAGE, SPREAD] }, publishedAt: '2026-11-06' });
    expect(isReadable(c, 'en')).toBe(true);
  });
});

describe('the catalogue as it stands today', () => {
  it('declares KROX', () => {
    const krox = findComic('krox');
    expect(krox).not.toBeNull();
    expect(krox!.title).toBe('KROX');
  });

  it('returns null for a comic that does not exist', () => {
    expect(findComic('eva')).toBeNull();
    expect(findComic('../../etc/passwd')).toBeNull();
  });

  it('has nothing readable yet, in either language', () => {
    // The lettered pages had not arrived on 6 November 2026. When they do,
    // this test is the one that should fail and be updated, deliberately.
    expect(hasReadableComic('es')).toBe(false);
    expect(hasReadableComic('en')).toBe(false);
  });

  it('every declared chapter carries a title in both languages', () => {
    for (const comic of COMICS) {
      for (const c of comic.chapters) {
        expect(c.title.es.length, `${comic.slug} ch.${c.number} es`).toBeGreaterThan(0);
        expect(c.title.en.length, `${comic.slug} ch.${c.number} en`).toBeGreaterThan(0);
      }
    }
  });

  it('serves its art from the media mount, never from the repo', () => {
    for (const comic of COMICS) {
      expect(comic.hero.startsWith('/comics/'), comic.slug).toBe(true);
      for (const c of comic.chapters) {
        for (const locale of ['es', 'en'] as const) {
          for (const page of c.pages?.[locale] ?? []) {
            expect(page.image.startsWith('/comics/')).toBe(true);
          }
        }
      }
    }
  });
});

describe('where the button goes', () => {
  it('points at nothing while nothing is readable', () => {
    expect(firstReadable('es')).toBeNull();
    expect(findChapter('krox', 1, 'es')).toBeNull();
  });

  it('builds the href from the comic and the chapter number', () => {
    const comic = { slug: 'krox', title: 'KROX', hero: '/comics/krox/hero.jpg', chapters: [] } as Comic;
    expect(chapterHref(comic, chapter({ number: 3 }))).toBe('/comic/krox/3');
  });

  it('skips an unpublished chapter and opens the next readable one', () => {
    const comic: Comic = {
      slug: 'krox',
      title: 'KROX',
      hero: '/comics/krox/hero.jpg',
      chapters: [
        chapter({ number: 1, publishedAt: null, pages: { es: [PAGE], en: [PAGE] } }),
        chapter({ number: 2, publishedAt: '2026-11-06', pages: { es: [PAGE], en: [PAGE] } }),
      ],
    };
    expect(readableChapters(comic, 'es').map((c) => c.number)).toEqual([2]);
  });
});

describe('copy', () => {
  it('carries the client wording in Spanish, exactly as he wrote it', () => {
    expect(es.comic.tagline).toBe('Los héroes originales de Binkis.');
    expect(es.comic.cta).toBe('Leer el cómic');
    expect(es.comic.free).toBe('Gratis · Sin registro');
  });

  it('says the same things in English', () => {
    expect(en.comic.cta.length).toBeGreaterThan(0);
    expect(en.comic.free).toContain('Free');
  });

  it('keeps the two dictionaries the same shape', () => {
    expect(Object.keys(es.comic).sort()).toEqual(Object.keys(en.comic).sort());
  });
});
