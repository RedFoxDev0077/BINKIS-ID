import { describe, it, expect } from 'vitest';
import {
  COMICS,
  chapterHref,
  findChapter,
  findComic,
  firstReadable,
  hasReadableComic,
  isReadable,
  mediaUrl,
  readableChapters,
  readingSet,
  type Comic,
  type ComicChapter,
} from '../../src/lib/comics/catalog.ts';
import { es } from '../../src/lib/i18n/es.ts';
import { en } from '../../src/lib/i18n/en.ts';
import { downloadFileName, downloadSources } from '../../scripts/lib/comic-download.ts';

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
    lettered: [],
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

  it('has something readable in either language', () => {
    // Published 6 November 2026 with the art unlettered, at the client's
    // request. This is the assertion that makes the promo block appear at
    // all, so if it ever goes false again the entry point has vanished from
    // the passport and from My Collection with no other test noticing.
    expect(hasReadableComic('es')).toBe(true);
    expect(hasReadableComic('en')).toBe(true);
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
  it('opens KROX chapter 1 in both languages', () => {
    for (const locale of ['es', 'en'] as const) {
      const opening = firstReadable(locale);
      expect(opening?.comic.slug, locale).toBe('krox');
      expect(opening?.chapter.number, locale).toBe(1);
      expect(findChapter('krox', 1, locale), locale).not.toBeNull();
    }
  });

  /*
   * The delivered chapter, asserted as delivered. Page numbers are printed on
   * the artwork, so a gap or a repeat here is a mistake a reader can see and
   * we cannot: it would mean a spread was dropped or declared twice.
   */
  it('covers pages 1 to 28 once each, in order, in both languages', () => {
    for (const locale of ['es', 'en'] as const) {
      const pages = findChapter('krox', 1, locale)!.chapter.pages![locale];
      expect(pages).toHaveLength(15);
      expect(pages.flatMap((p) => [...p.numbers])).toEqual(
        Array.from({ length: 28 }, (_, i) => i + 1),
      );
    }
  });

  /*
   * The Spanish set is assembled: lettered pages first, then whatever is still
   * silent. That join is the one place a page can go missing or appear twice,
   * and the test above would catch it. This one pins the seam itself, so that
   * when the next lettered spread arrives it is obvious whether it landed.
   */
  it('prefers the lettered page wherever one exists, in either language', () => {
    const es = findChapter('krox', 1, 'es')!.chapter.pages!.es;
    const en = findChapter('krox', 1, 'en')!.chapter.pages!.en;

    // All 28 as of 9 November 2026: Spanish is finished, so the fallback
    // below now matches nothing. It is still asserted, because English is
    // arriving the same way and goes through the same seam.
    const lettered = es.filter((p) => p.image.includes('/1/es/'));
    expect(lettered.flatMap((p) => [...p.numbers])).toEqual(
      Array.from({ length: 28 }, (_, i) => i + 1),
    );

    // Every page Spanish has not reached yet falls back to the delivered art.
    for (const page of es.filter((p) => !p.image.includes('/1/es/'))) {
      expect(page.image).toContain('/1/pages/');
    }

    // English began arriving 11 November 2026, spread by spread, and unlike
    // Spanish it did not start at page 1. Every page it serves is either the
    // English lettering or the silent delivery and never anything else; the
    // test above is what holds the join to 1..28 in order.
    for (const page of en) {
      expect(page.image, `en p${page.numbers.join('-')}`).toMatch(/\/1\/(?:en|pages)\//);
    }
  });

  /**
   * The guard on the switch itself.
   *
   * `lettered` is what makes the reader stop substituting the Spanish edition
   * and hand an English reader the English files, so flipping it one spread
   * early is the single edit that would ship a book which speaks for two
   * pages and then goes silent for twenty-six. That is worse than being told
   * plainly that the comic is only in Spanish today, and it is a one-word
   * change somebody will be tempted to make the moment the folder looks full.
   */
  it('never calls a language lettered while any of its pages are still silent', () => {
    for (const comic of COMICS) {
      for (const chapter of comic.chapters) {
        for (const locale of chapter.lettered) {
          const pages = chapter.pages?.[locale] ?? [];
          const where = `${comic.slug} ch${chapter.number} ${locale}`;
          expect(pages.length, `${where} is listed as lettered with no pages`).toBeGreaterThan(0);
          for (const page of pages) {
            expect(page.image, `${where} p${page.numbers.join('-')} is the silent delivery`).toContain(
              `/${locale}/`,
            );
          }
        }
      }
    }
  });

  /** Every image path the catalog declares, hero included. */
  function declaredPaths(): string[] {
    // Cover as well as hero. The cover is now the first thing in the reader
    // and the first page of the PDF, so a missing file is a hole at the very
    // top of the chapter rather than something noticed weeks later.
    const paths = new Set<string>(
      COMICS.flatMap((c) => [c.hero, ...(c.cover ? [c.cover.image] : [])]),
    );
    for (const comic of COMICS) {
      for (const ch of comic.chapters) {
        for (const plate of ch.closing ?? []) paths.add(plate.image);
        for (const locale of ['es', 'en'] as const) {
          for (const page of ch.pages?.[locale] ?? []) paths.add(page.image);
        }
      }
    }
    return [...paths];
  }

  it('declares every path in the one shape Caddy serves', () => {
    for (const path of declaredPaths()) {
      expect(path, path).toMatch(/^\/comics\/[a-z0-9-]+\/[^?#\s]+\.jpg$/);
    }
  });

  /**
   * The declared path is where the file lives; mediaUrl is what the browser
   * asks for. They have to stay different things.
   *
   * Caddy serves /comics/* with a one-year immutable Cache-Control, and until
   * 8 November 2026 it sent that on 404s too. Art is uploaded by hand after
   * the deploy, so every reader who opened the chapter before the upload
   * cached a 404 their browser would not revalidate until 2027. The version
   * is how those browsers are told to ask again.
   */
  it('requests every file at a versioned url, while declaring a real path', () => {
    for (const path of declaredPaths()) {
      const url = mediaUrl(path);
      expect(url, path).toMatch(/^\/comics\/[a-z0-9-]+\/[^?#\s]+\.jpg\?v=\d+$/);
      expect(url.split('?')[0], path).toBe(path);
    }
  });

  it('keeps the version out of the declared paths themselves', () => {
    // Otherwise the existence check below would look for a file called
    // "1.jpg?v=2", and the catalog would stop describing the disk.
    for (const path of declaredPaths()) expect(path).not.toContain('?');
  });

  /*
   * The catalog is hand-written, so a typo in a path is a broken image on
   * someone's phone rather than a build error, and worth catching.
   *
   * It can only be caught where the art is. Client artwork never enters the
   * repo - public/comics/ is gitignored and the files are served by Caddy off
   * the host - so on CI there is nothing to compare against and this check
   * reports what it did instead of failing. On a machine that has the art it
   * is a real assertion. Neither case says anything about whether the art was
   * deployed; that is a separate step with its own verification.
   */
  /*
   * The closing plates are artwork, not pages. If one ever leaked into `pages`
   * it would be counted through as page 29 and labelled with a number that is
   * printed nowhere on it.
   */
  it('keeps the closing plates out of the numbered run', () => {
    const chapter = findChapter('krox', 1, 'es')!.chapter;
    const closing = chapter.closing ?? [];
    expect(closing.length).toBeGreaterThan(0);

    for (const plate of closing) {
      for (const locale of ['es', 'en'] as const) {
        expect(chapter.pages![locale].map((p) => p.image)).not.toContain(plate.image);
      }
      // The same plates for both languages: they have no words in them.
      expect(plate.image).not.toContain('/es/');
    }
  });

  /*
   * Both versions of the group plate, ink then colour, "si porfa las dos" on
   * 8 November 2026. Distinct files and distinct captions, because two images
   * carrying the same caption is how a duplicate paste goes unnoticed.
   */
  it('shows the ink plate and the colour plate, each captioned as itself', () => {
    const closing = findChapter('krox', 1, 'es')!.chapter.closing ?? [];
    expect(closing.map((p) => p.label)).toEqual(['closingInk', 'closing', 'closingBinki']);
    expect(new Set(closing.map((p) => p.image)).size).toBe(closing.length);

    for (const d of [es, en]) {
      for (const plate of closing) {
        expect(d.comic[plate.label], plate.label).toBeTruthy();
      }
      // Distinct captions: two plates under one caption is how a duplicate
      // paste goes unnoticed.
      const captions = closing.map((plate) => d.comic[plate.label]);
      expect(new Set(captions).size).toBe(captions.length);
    }
  });

  it('points at files that are actually there, where the art is present', async () => {
    const { access } = await import('node:fs/promises');
    if (!(await access('public/comics').then(() => true, () => false))) {
      console.info('comics: no local artwork, path existence not checked');
      return;
    }
    for (const path of declaredPaths()) {
      await expect(access(`public${path}`), path).resolves.toBeUndefined();
    }
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
    expect(es.comic.teaser).toBe('La aventura apenas comienza.');
    expect(es.comic.teaserNext).toBe('Nuevas aventuras y héroes, próximamente.');
  });

  // He asked for Aguila and EVA to come out on 7 November 2026, because only
  // KROX has pages drawn. Naming a character the reader cannot reach is the
  // one failure this block exists to avoid, so it is worth a test.
  it('promises only the character that has pages', () => {
    for (const d of [es, en]) {
      expect(d.comic.blurb).toContain('KROX');
      expect(d.comic.blurb).not.toMatch(/\b(EVA|Águila|Aguila|Eagle)\b/iu);
    }
  });

  it('says the same things in English', () => {
    expect(en.comic.cta.length).toBeGreaterThan(0);
    expect(en.comic.teaser.length).toBeGreaterThan(0);
    expect(en.comic.teaserNext.length).toBeGreaterThan(0);
  });

  it('keeps the two dictionaries the same shape', () => {
    expect(Object.keys(es.comic).sort()).toEqual(Object.keys(en.comic).sort());
  });

  /**
   * The download has to be rebuilt whenever its pages change, and nothing
   * about a static file enforces that by itself.
   *
   * So the file name carries a fingerprint of the ordered list of images that
   * went into it. Change the cover, add the lettered page 28, redraw a plate -
   * all of which ship under new file names in this project - and the
   * fingerprint moves. This test recomputes it from the catalog and fails
   * until someone has re-run scripts/build-comic-pdf.ts and pasted in the
   * lines it prints.
   *
   * It works in CI, where the artwork itself is not checked in, precisely
   * because it fingerprints the declared paths rather than the bytes.
   */
  it('names every download after the exact art that went into it', () => {
    for (const comic of COMICS) {
      for (const chapter of comic.chapters) {
        if (!chapter.downloads) continue;
        for (const locale of ['es', 'en'] as const) {
          const declared = chapter.downloads[locale];
          const expected = downloadFileName(
            comic,
            chapter,
            locale,
            downloadSources(comic, chapter, locale),
          );
          expect(
            declared.file.endsWith('/' + expected),
            `${comic.slug} ch${chapter.number} ${locale}: declared ${declared.file}, but its ` +
              `pages fingerprint to ${expected}. Re-run scripts/build-comic-pdf.ts.`,
          ).toBe(true);
        }
      }
    }
  });

  it('declares a download size that could plausibly be the file', () => {
    for (const comic of COMICS) {
      for (const chapter of comic.chapters) {
        for (const locale of ['es', 'en'] as const) {
          const declared = chapter.downloads?.[locale];
          if (!declared) continue;
          // Nineteen full-page JPEGs is megabytes. Far outside that range and
          // someone hand-edited the number instead of pasting the build's.
          expect(declared.bytes, `${comic.slug} ${locale}`).toBeGreaterThan(1_000_000);
          expect(declared.bytes, `${comic.slug} ${locale}`).toBeLessThan(80_000_000);
        }
      }
    }
  });

  it('serves every download out of the comics tree, as a pdf', () => {
    for (const comic of COMICS) {
      for (const chapter of comic.chapters) {
        for (const download of Object.values(chapter.downloads ?? {})) {
          expect(download.file, download.file).toMatch(
            /^\/comics\/[a-z0-9-]+\/\d+\/[A-Za-z0-9.-]+\.pdf$/,
          );
        }
      }
    }
  });
});

/*
 * THE SITE OPENS IN ENGLISH AND THE COMIC IS LETTERED IN SPANISH.
 *
 * Those two facts arrived on the same day, 10 November 2026, from the same
 * client, and left alone they combine into the worst version of the site:
 * every visitor lands in English, taps the one button on the home page, and
 * gets twenty-eight pages with no words in them.
 *
 * readingSet is what keeps them apart. These tests pin the three cases,
 * because the moment English lettering arrives the right behaviour inverts
 * and nothing else in the file would notice.
 */
describe('readingSet', () => {
  const PAGES_ES = [{ ...PAGE, image: '/comics/x/es/1.jpg' }] as const;
  const PAGES_EN = [{ ...PAGE, image: '/comics/x/pages/1.jpg' }] as const;

  it('gives a reader their own language when it is lettered', () => {
    const ch = chapter({ pages: { es: PAGES_ES, en: PAGES_EN }, lettered: ['es', 'en'] });
    expect(readingSet(ch, 'en')).toEqual({ pages: PAGES_EN, shownIn: 'en', substituted: false });
    expect(readingSet(ch, 'es')).toEqual({ pages: PAGES_ES, shownIn: 'es', substituted: false });
  });

  it('substitutes the lettered edition, and says that it did', () => {
    const ch = chapter({ pages: { es: PAGES_ES, en: PAGES_EN }, lettered: ['es'] });
    expect(readingSet(ch, 'en')).toEqual({ pages: PAGES_ES, shownIn: 'es', substituted: true });
    // The Spanish reader is unaffected, and must not be told anything.
    expect(readingSet(ch, 'es')!.substituted).toBe(false);
  });

  it('shows the silent art when nothing is lettered anywhere', () => {
    // The client published chapter 1 unlettered on purpose on 6 November 2026.
    // That has to keep working, rather than becoming an empty reader.
    const ch = chapter({ pages: { es: PAGES_EN, en: PAGES_EN }, lettered: [] });
    expect(readingSet(ch, 'en')).toEqual({ pages: PAGES_EN, shownIn: 'en', substituted: false });
  });

  it('is null when there are no pages at all in that language', () => {
    expect(readingSet(chapter({ pages: null, lettered: [] }), 'en')).toBeNull();
  });

  // KROX chapter 1 is lettered in both languages as of 12 November 2026, so
  // neither reader is substituted any more and nobody sees the notice. The
  // mechanism itself is still covered by the synthetic cases above, which is
  // where it belongs: chapter 2 will arrive one language at a time.
  it.each(['es', 'en'] as const)('serves KROX chapter 1 in %s, all 28 pages, lettered', (locale) => {
    const krox = findChapter('krox', 1, locale)!.chapter;
    const reading = readingSet(krox, locale)!;
    expect(reading.substituted).toBe(false);
    expect(reading.shownIn).toBe(locale);
    // Every page it hands back is a lettered file, not the silent delivery.
    expect(reading.pages.every((p) => p.image.includes(`/1/${locale}/`))).toBe(true);
    expect(reading.pages.flatMap((p) => [...p.numbers])).toEqual(
      Array.from({ length: 28 }, (_, i) => i + 1),
    );
  });
});
