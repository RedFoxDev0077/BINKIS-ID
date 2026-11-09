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

/**
 * Bumped whenever a comic file has to be re-fetched by browsers that already
 * asked for it.
 *
 * Caddy serves /comics/* with a one-year immutable Cache-Control, which is
 * right for the files themselves - a re-lettered page ships under a new name -
 * but until 8 November 2026 that header went out on 404s as well. The art is
 * uploaded by hand, separately from the deploy, so there is always a window
 * where the page names a file that is not on disk yet. Anyone who loaded the
 * reader during that window was told the URL would still be empty in a year
 * and not to revalidate, and their browser believed it.
 *
 * That is why the client reported "aun no se cargan las imagenes" three times
 * while every check from a fresh client returned 200: a fresh client had no
 * poisoned entry, and his phone would not re-request until November 2027.
 *
 * The Caddyfile now sends no-store on errors, so this cannot happen again.
 * This constant repairs the browsers that were already told the lie, by
 * changing the URL out from under the cache entry. Bump it only for that: it
 * costs every reader a full re-download of the chapter.
 */
const MEDIA_VERSION = '2';

/**
 * The URL to request a comic file at, as opposed to where it lives.
 *
 * Kept separate from the declared path so the catalog stays a list of real
 * files - which is what makes the existence check in the tests meaningful -
 * and so the version lives in exactly one place instead of in 32 strings.
 */
export function mediaUrl(path: string): string {
  return `${path}?v=${MEDIA_VERSION}`;
}

export type ComicLocale = 'es' | 'en';
export type Localised<T> = Record<ComicLocale, T>;

/** One image the reader shows whole, fitted to the width of the screen. */
export interface ComicPlate {
  /** Served path, e.g. /comics/krox/1/es/02-03.jpg */
  image: string;
  /** Intrinsic size, so the reader reserves the box and the page never jumps
   *  under a thumb while the image is still arriving. */
  width: number;
  height: number;
}

/**
 * Which caption the reader sets under a closing plate.
 *
 * A key of the dictionary rather than a string, so a plate can never be
 * declared with a caption that was never translated.
 */
export type ClosingLabel = 'closing' | 'closingInk' | 'closingBinki';

export interface ClosingPlate extends ComicPlate {
  label: ClosingLabel;
}

export interface ComicPage extends ComicPlate {
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

/**
 * A finished PDF of one chapter, for readers who want it off the web.
 *
 * Added 9 November 2026: the client asked whether the comic could be
 * downloaded as well as shared, and was told plainly that a downloadable file
 * can be re-uploaded anywhere by anyone and that there is no taking it back.
 * He asked for it anyway, which is his call to make about his own art.
 */
export interface ComicDownload {
  /**
   * Served path. The name carries a fingerprint of every image that went into
   * the file, so a chapter that gains a lettered page cannot keep serving the
   * PDF built before it. See scripts/lib/comic-download.ts.
   */
  file: string;
  /**
   * Size in bytes, printed on the button.
   *
   * Nearly every reader here is on a phone, often on mobile data, and this is
   * several megabytes of artwork. Telling someone what a tap will cost them
   * before they spend it is the difference between a download and an ambush.
   */
  bytes: number;
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
  /**
   * Full-page plates after the last numbered page, in the order they are shown.
   *
   * Not part of `pages`, because they carry no printed page number and must
   * not disturb the 1..28 run the reader counts through. Not localised
   * either: these are the UNIVERSALS team and have no words in them.
   */
  closing?: readonly ClosingPlate[];
  /**
   * The built PDF for each language, once one exists.
   *
   * Declared rather than discovered, like every other file here, so that a
   * missing build is a visible gap in this file instead of a dead button on
   * someone's phone. Written by scripts/build-comic-pdf.ts, which prints the
   * exact lines to paste.
   */
  downloads?: Localised<ComicDownload>;
  /** ISO date. Null means written but not released. */
  publishedAt: string | null;
}

export interface Comic {
  slug: string;
  /** The wordmark. Not translated: it is a name. */
  title: string;
  /** One strong illustration for the promo block. Never a logo. */
  hero: string;
  /**
   * Where to anchor the hero inside the promo panel, as a CSS
   * background-position. Defaults to '50% 32%'.
   *
   * It belongs to the image, not to the component. The panel is wide and
   * short, so a portrait cover is cropped hard: KROX's own cover at the old
   * default showed his chest and cut his head off entirely. Any future comic
   * delivering a differently composed cover needs its own value rather than a
   * change to a shared class.
   */
  heroFocus?: string;
  chapters: readonly ComicChapter[];
}

/**
 * KROX: The Last Warrior of Athos.
 *
 * 28 pages drawn by Jon Malin, hand-coloured, delivered 5 November 2026. The
 * script in both languages arrived 6 November 2026, and Spanish lettering
 * started arriving page by page on 7 November. English lettering has not
 * started.
 */

/**
 * Chapter 1 as delivered: 15 files, 28 pages, hand-coloured.
 *
 * This is the art with NO LETTERING. Publishing it that way was the client's
 * explicit decision on 6 November 2026 ("puedes subirlo aun que no tenga aun
 * dialogos"): he wanted the entry point live and tappable while the words were
 * still being written.
 *
 * It is still the English set, and it is still the tail of the Spanish one, so
 * it stays declared in one place rather than being copied per locale.
 */
const KROX_RAW: readonly ComicPage[] = [
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

/**
 * Spanish, lettered, as far as the letterer has reached.
 *
 * The client is delivering these page by page rather than as a finished
 * chapter ("te ire pasando las paginas con forme las avanzo con texto",
 * 6 November 2026), so this list grows and the unlettered tail shrinks. Nine
 * files arrived on 7 November covering pages 1 to 17, and five more on
 * 8 November taking it to page 27. Only page 28 is still silent.
 *
 * Pages 18-19 exist in two letterings. The one here is the file he named for
 * its own pages, and page 20-21 opens on "la recompensa pagaba el viaje",
 * which follows from it and not from the other. The alternate sits in his
 * "todas las versiones" archive as a draft.
 *
 * SIZES VARY ON PURPOSE. Pages 2-3 came as a 12100x9094 master and were
 * reduced to the usual 1600. The rest arrived over WhatsApp, which had already
 * resampled them to about 1447 wide, and upscaling to match would have added
 * bytes without adding a single pixel of detail. The reader fits every page to
 * the width of the screen, so a reader never sees the difference; someone
 * pinching all the way in on an older page will.
 */
const KROX_ES_LETTERED: readonly ComicPage[] = [
  { image: '/comics/krox/1/es/1.jpg', width: 1009, height: 1558, numbers: [1] },
  { image: '/comics/krox/1/es/2-3.jpg', width: 1600, height: 1203, numbers: [2, 3] },
  { image: '/comics/krox/1/es/4-5.jpg', width: 1447, height: 1087, numbers: [4, 5] },
  { image: '/comics/krox/1/es/6-7.jpg', width: 1447, height: 1087, numbers: [6, 7] },
  { image: '/comics/krox/1/es/8-9.jpg', width: 1427, height: 1102, numbers: [8, 9] },
  { image: '/comics/krox/1/es/10-11.jpg', width: 1447, height: 1087, numbers: [10, 11] },
  { image: '/comics/krox/1/es/12-13.jpg', width: 1446, height: 1088, numbers: [12, 13] },
  { image: '/comics/krox/1/es/14-15.jpg', width: 1447, height: 1087, numbers: [14, 15] },
  { image: '/comics/krox/1/es/16-17.jpg', width: 1446, height: 1087, numbers: [16, 17] },
  { image: '/comics/krox/1/es/18-19.jpg', width: 1426, height: 1103, numbers: [18, 19] },
  { image: '/comics/krox/1/es/20-21.jpg', width: 1447, height: 1087, numbers: [20, 21] },
  { image: '/comics/krox/1/es/22-23.jpg', width: 1447, height: 1087, numbers: [22, 23] },
  { image: '/comics/krox/1/es/24-25.jpg', width: 1446, height: 1087, numbers: [24, 25] },
  { image: '/comics/krox/1/es/26-27.jpg', width: 1446, height: 1087, numbers: [26, 27] },
];

/**
 * One chapter, assembled: every lettered page, then the silent remainder.
 *
 * Selected by page number rather than by position so that adding the next
 * lettered spread to the list above is the only edit required. Taking a slice
 * at a fixed index would have worked today and quietly dropped or duplicated a
 * page the first time either list changed.
 */
function withLettered(lettered: readonly ComicPage[]): readonly ComicPage[] {
  const done = new Set(lettered.flatMap((page) => page.numbers));
  return [...lettered, ...KROX_RAW.filter((page) => !page.numbers.some((n) => done.has(n)))];
}

const KROX: Comic = {
  slug: 'krox',
  title: 'KROX',
  // "Foto portada", 8 November 2026. His own cover art, replacing the panel
  // crop that stood in for it, and the answer to "solo es otra imagen en lugar
  // de la portada".
  //
  // A NEW FILE NAME rather than overwriting hero.jpg. Caddy serves this path
  // immutable for a year, so a browser holding the old cover would never see
  // the new one. Shipping a new cut under a new name is how that is handled
  // everywhere else here, and it beats bumping MEDIA_VERSION, which would make
  // every reader re-download all 32 pages to change one image.
  hero: '/comics/krox/portada.jpg',
  // His cover is a full-body portrait, so the face sits high. Checked against
  // the real panel at 358px: the old default cropped to the torso.
  heroFocus: '50% 18%',
  chapters: [
    {
      number: 1,
      title: {
        es: 'El último guerrero de Athos',
        en: 'The Last Warrior of Athos',
      },
      pages: { es: withLettered(KROX_ES_LETTERED), en: KROX_RAW },
      // "si puedes poner esta al mero final del comic. y luego a color",
      // 8 November 2026, and "si porfa las dos" when he was asked whether he
      // wanted the ink plate as well as the colour one.
      //
      // Ink first, then colour, which is the order he described and the order
      // the work happened in. It also ends the book on the stronger image.
      //
      // The ink plate is 1000px against the colour one's 1600 because that is
      // the size it was delivered at. Upscaling it to match would add bytes
      // and not one pixel of detail, and the reader fits every plate to the
      // width of the screen, so nobody sees the difference until they pinch.
      closing: [
        { image: '/comics/krox/1/closing-ink.jpg', width: 1000, height: 773, label: 'closingInk' },
        { image: '/comics/krox/1/closing.jpg', width: 1600, height: 1237, label: 'closing' },
        // "Podemos ponerlo al final de las imagenes? ... Como que el que ve el
        // comic entienda que tiene su version binki", 8 November 2026.
        //
        // Last, after the story art, because it is the bridge out of the comic
        // and into the thing the reader can actually hold.
        //
        // The plate as the client designed it, sent 9 November 2026. It
        // replaces the bare line-up that stood here under a caption of mine:
        // his headline, his layout, his KROX art behind it. So the page no
        // longer explains the line-up in words underneath, because the plate
        // says it itself. It carries its own near-black ground, which is why
        // this one is not flattened onto white the way the bare line-up was.
        //
        // A NEW FILE NAME, NOT A BUMPED MEDIA_VERSION. binki.jpg is cached in
        // readers' browsers for a year, so a different plate at that URL would
        // reach nobody who had already opened the chapter. Shipping it under
        // its own name is the rule a re-lettered page already follows, and it
        // costs no reader a re-download of the other 28 files.
        //
        // THE TYPE IS SPANISH AND IT IS BAKED INTO THE ARTWORK. An English
        // reader sees Spanish here and the caption is the only part that can
        // translate, so closingBinki now carries the meaning instead of
        // describing the picture. Making it genuinely bilingual needs an
        // English plate from the client; it cannot be fixed on this side.
        { image: '/comics/krox/1/binki-krox.jpg', width: 1448, height: 1086, label: 'closingBinki' },
      ],
      /**
       * Built by scripts/build-comic-pdf.ts and uploaded beside the artwork.
       *
       * The name ends in a fingerprint of everything that went into the file,
       * so the day page 28 arrives in Spanish these names change and the old
       * PDF stops being served. Rebuild, paste the new lines, upload, deploy.
       *
       * English is larger than Spanish because the English set is still the
       * unlettered 1600px delivery, while most Spanish pages came back from
       * the letterer at about 1447.
       */
      downloads: {
        es: { file: '/comics/krox/1/KROX-Capitulo-1-41bb71f0.pdf', bytes: 8590212 },
        en: { file: '/comics/krox/1/KROX-Chapter-1-f97b424e.pdf', bytes: 10721600 },
      },
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
