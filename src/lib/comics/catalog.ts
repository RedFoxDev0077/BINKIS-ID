/**
 * UNIVERSALS: the comics BINKIS owns, and what is readable today.
 *
 * Declared here rather than read off disk or out of the database, for the
 * same reason `characters/media.ts` is: a chapter that points at a file that
 * is not there should be a build-time mistake in one obvious place, not an
 * empty reader on someone's phone.
 *
 * The client's framing, 6 November 2026: UNIVERSALS is the imprint, and
 * Aguila, KROX and EVA are its characters. Only KROX has pages drawn, so only
 * KROX is declared. The promo block hides itself when nothing is published,
 * which is what keeps the button from ever being a promise the site cannot
 * keep.
 *
 * ART LIVES OUTSIDE THE REPO. Comic pages are served by Caddy from
 * /srv/media, exactly like character art, so these paths resolve to files in
 * /opt/binkis-id/media/comics on the server and public/comics locally. The
 * repo never carries the client's artwork.
 */

export type ComicLocale = 'es' | 'en';
export type Localised<T> = Record<ComicLocale, T>;

export interface ComicPage {
  /** Served path, e.g. /comics/krox/1/es/02-03.jpg */
  image: string;
  /** Intrinsic size, so the reader reserves the box and the page never jumps
   *  under a thumb while the image is still arriving. */
  width: number;
  height: number;
  /**
   * The printed page numbers this one file carries.
   *
   * Two numbers means a TRUE double-page spread: the delivered art runs the
   * panels straight through the gutter, so the file cannot be cut in half
   * without cutting the drawing. The reader has to show it whole and let the
   * reader move around inside it.
   */
  numbers: readonly [number] | readonly [number, number];
}

export interface ComicChapter {
  number: number;
  title: Localised<string>;
  /**
   * Lettered pages, one complete set per language.
   *
   * Null until the lettered art arrives. The script exists in both languages
   * (client, 6 November 2026) but the text is burned into the image by the
   * letterer, so Spanish and English are two different sets of files, not one
   * set with a text layer over it.
   */
  pages: Localised<readonly ComicPage[]> | null;
  /** ISO date. Null means written but not released. */
  publishedAt: string | null;
}

export interface Comic {
  slug: string;
  /** The wordmark. Not translated: it is a name. */
  title: string;
  /** One strong illustration for the promo block. Never a logo. */
  hero: string;
  chapters: readonly ComicChapter[];
}

/**
 * KROX: The Last Warrior of Athos.
 *
 * 28 pages drawn by Jon Malin, hand-coloured, delivered 5 November 2026. The
 * script in both languages arrived 6 November 2026. What is still missing is
 * the lettering, and the Athos/StarDoom sequence the client says needs its
 * own art, so chapter 1 is declared and unpublished.
 */
const KROX: Comic = {
  slug: 'krox',
  title: 'KROX',
  hero: '/comics/krox/hero.jpg',
  chapters: [
    {
      number: 1,
      title: {
        es: 'El último guerrero de Athos',
        en: 'The Last Warrior of Athos',
      },
      pages: null,
      publishedAt: null,
    },
  ],
};

export const COMICS: readonly Comic[] = [KROX];

export function findComic(slug: string): Comic | null {
  return COMICS.find((comic) => comic.slug === slug) ?? null;
}

/**
 * A chapter counts as readable only when it is published AND has pages in the
 * language being asked for. Both halves matter: a chapter published with only
 * a Spanish set would otherwise hand an English reader an empty page.
 */
export function isReadable(chapter: ComicChapter, locale: ComicLocale): boolean {
  if (!chapter.publishedAt) return false;
  const pages = chapter.pages?.[locale];
  return Array.isArray(pages) && pages.length > 0;
}

export function readableChapters(comic: Comic, locale: ComicLocale): ComicChapter[] {
  return comic.chapters.filter((chapter) => isReadable(chapter, locale));
}

export function findChapter(
  comicSlug: string,
  chapterNumber: number,
  locale: ComicLocale,
): { comic: Comic; chapter: ComicChapter } | null {
  const comic = findComic(comicSlug);
  if (!comic) return null;
  const chapter = comic.chapters.find((c) => c.number === chapterNumber);
  if (!chapter || !isReadable(chapter, locale)) return null;
  return { comic, chapter };
}

/**
 * Where "Leer el cómic" goes.
 *
 * Straight into the first readable chapter, never to a landing page that asks
 * for a second tap. The client was explicit about that on 6 November 2026,
 * and he is right: one tap to reading is the whole point of the button.
 */
export function firstReadable(locale: ComicLocale): { comic: Comic; chapter: ComicChapter } | null {
  for (const comic of COMICS) {
    const chapter = readableChapters(comic, locale)[0];
    if (chapter) return { comic, chapter };
  }
  return null;
}

export function chapterHref(comic: Comic, chapter: ComicChapter): string {
  return `/comic/${comic.slug}/${chapter.number}`;
}

/** True when there is anything at all to read, in this language. */
export function hasReadableComic(locale: ComicLocale): boolean {
  return firstReadable(locale) !== null;
}
