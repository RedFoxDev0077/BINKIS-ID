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
 * script in both languages arrived 6 November 2026. The lettering and the Athos/StarDoom
 * sequence are still outstanding; see KROX_PAGES below.
 */

/**
 * Chapter 1, all 28 pages, as delivered: hand-coloured and WITHOUT LETTERING.
 *
 * Publishing art with no dialogue was the client's explicit decision on
 * 6 November 2026 ("puedes subirlo aun que no tenga aun dialogos"). He wanted
 * the entry point live and tappable now; the words follow. It is not rework:
 * when the lettered sets arrive they replace these files, and only the two
 * locale arrays below split apart. Every path, size and page number stays.
 *
 * ONE SET SERVES BOTH LANGUAGES. Unlettered art has no language, so es and en
 * deliberately point at the same files rather than at two identical copies.
 * The moment lettering exists this is where the two sets diverge, and the
 * readability rule below already handles a half-finished translation.
 */
const KROX_PAGES: readonly ComicPage[] = [
  { image: '/comics/krox/1/pages/1.jpg', width: 1600, height: 2473, numbers: [1] },
  { image: '/comics/krox/1/pages/2-3.jpg', width: 1600, height: 1203, numbers: [2, 3] },
  { image: '/comics/krox/1/pages/4-5.jpg', width: 1600, height: 1203, numbers: [4, 5] },
  { image: '/comics/krox/1/pages/6-7.jpg', width: 1600, height: 1203, numbers: [6, 7] },
  { image: '/comics/krox/1/pages/8-9.jpg', width: 1600, height: 1236, numbers: [8, 9] },
  { image: '/comics/krox/1/pages/10-11.jpg', width: 1600, height: 1203, numbers: [10, 11] },
  { image: '/comics/krox/1/pages/12-13.jpg', width: 1600, height: 1203, numbers: [12, 13] },
  { image: '/comics/krox/1/pages/14-15.jpg', width: 1600, height: 1203, numbers: [14, 15] },
  { image: '/comics/krox/1/pages/16-17.jpg', width: 1600, height: 1203, numbers: [16, 17] },
  { image: '/comics/krox/1/pages/18-19.jpg', width: 1600, height: 1236, numbers: [18, 19] },
  { image: '/comics/krox/1/pages/20-21.jpg', width: 1600, height: 1203, numbers: [20, 21] },
  { image: '/comics/krox/1/pages/22-23.jpg', width: 1600, height: 1203, numbers: [22, 23] },
  { image: '/comics/krox/1/pages/24-25.jpg', width: 1600, height: 1203, numbers: [24, 25] },
  { image: '/comics/krox/1/pages/26-27.jpg', width: 1600, height: 1203, numbers: [26, 27] },
  { image: '/comics/krox/1/pages/28.jpg', width: 1600, height: 2405, numbers: [28] },
];

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
      pages: { es: KROX_PAGES, en: KROX_PAGES },
      publishedAt: '2026-11-06',
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
