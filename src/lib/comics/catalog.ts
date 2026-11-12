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
   * The languages whose page set is lettered all the way through.
   *
   * Declared rather than inferred from the file paths, because "has words in
   * it" is a fact about the artwork that only the person holding the art
   * knows. A half-lettered set is not listed here: a chapter that goes silent
   * at page 18 is not readable in that language.
   *
   * This exists because the site now opens in English (see i18n/DEFAULT_LOCALE)
   * while English lettering has not started, so without it the default
   * experience of the whole site would be 28 wordless pages.
   */
  lettered: readonly ComicLocale[];
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
   * The finished cover, with its trade dress. The first page of the reader
   * and the first page of the PDF.
   *
   * Separate from `hero` because the two are cropped by different things. The
   * promo block is a wide, short panel that cuts a portrait hard, so it wants
   * bare art; a comic opened as a comic is a whole page and wants the logo,
   * the issue number and the credits that say who drew it.
   *
   * Sent 9 November 2026 ("portada para acompañar historia que se descarga")
   * and led the PDF alone until 11 November, when the client opened the
   * reader and found the chapter starting on page 1: "aún no salió la portada
   * al abrirlo... solo falta la portada porfa". A file that opens on the
   * cover and a reader that does not are the same comic told two ways.
   *
   * A ComicPlate rather than a bare path, because the reader has to reserve
   * the box before the file lands or page 1 jumps under the reader's thumb.
   * The PDF still falls back to `hero` when a comic has no finished cover;
   * the reader simply opens on page 1.
   */
  cover?: ComicPlate;
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
 * files arrived on 7 November covering pages 1 to 17, five more on 8 November
 * taking it to page 27, and page 28 on 9 November.
 *
 * SPANISH IS NOW COMPLETE, 28 of 28, so `withLettered` contributes nothing to
 * the Spanish set any more. It stays because English is still entirely
 * unlettered and will arrive the same way, page by page.
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
  { image: '/comics/krox/1/es/28.jpg', width: 1024, height: 1536, numbers: [28] },
];

/**
 * English, lettered, as far as the letterer has reached.
 *
 * Started 11 November 2026: "ire compartiendo las paginas en ingles zip poco
 * a poco ... tal vez me tarde unos dias". Same delivery shape as the Spanish
 * set, so it grows the same way and the silent tail shrinks behind it.
 *
 * 25 of 28. PAGE 1 AND THE 10-11 SPREAD ARE STILL MISSING, and the client
 * believes the set is finished ("listo Goodman, todas en ingles", 11 November
 * 2026). It is not: both of those pages carry Spanish captions today, so they
 * would open and close the chapter in the wrong language.
 *
 * THE CHAPTER IS THEREFORE NOT LISTED AS LETTERED IN ENGLISH, and must not be
 * until all 28 are here: a reader who opens a comic that speaks for
 * twenty-five pages and goes quiet on the first one has been handed a broken
 * book, which is worse than being told plainly that it is only in Spanish
 * today. Until then this list reaches only the English PDF, where the
 * alternative is a page with no words on it at all.
 *
 * WHICH LETTERING, WHERE, WAS NOT GUESSED. His second archive of the day,
 * "KROX_Origin_All_Versions_English", holds eleven plates whose own read-me
 * says the numbers "identify the order of files in the supplied package, not
 * story page numbers", and four of the eleven are alternate dialogue takes of
 * a spread that already had one. Pages were matched by comparing the artwork
 * itself against the Spanish set, which is unambiguous because the English is
 * lettered over the same files; where two takes competed, the one chosen is
 * the one whose words are the Spanish edition's words. The Spanish is the
 * edition the client approved and shipped, so an English page that says
 * something else is not a translation of this comic.
 *
 * Rejected on those grounds, and still in his archive if he wants them:
 * plate 02 for 12-13 (drops "don't let them take them back"), plate 08 for
 * 14-15 ("let me go" for "cowards"), plate 01 for 16-17 (Mara sends him
 * rather than Silus recognising his army), plate 11 for 18-19 (the rescue,
 * where the Spanish has the bounty hunting that page 20-21 then follows from
 * with "la recompensa pagaba el viaje"). Pages 6-7 also exist as an earlier
 * English translation under Previous_editable; the plate used is the newer
 * one he lettered today.
 *
 * SIZES COME FROM HIS FILES, and they are the Spanish sizes to the pixel,
 * because he lettered the English over the same WhatsApp-resampled art. The
 * 2-3 spread is the exception at 1600, delivered as its own 12100x9094
 * master, which is exactly how the Spanish 2-3 arrived too.
 */
const KROX_EN_LETTERED: readonly ComicPage[] = [
  { image: '/comics/krox/1/en/2-3.jpg', width: 1600, height: 1203, numbers: [2, 3] },
  { image: '/comics/krox/1/en/4-5.jpg', width: 1447, height: 1087, numbers: [4, 5] },
  { image: '/comics/krox/1/en/6-7.jpg', width: 1447, height: 1087, numbers: [6, 7] },
  { image: '/comics/krox/1/en/8-9.jpg', width: 1427, height: 1102, numbers: [8, 9] },
  { image: '/comics/krox/1/en/12-13.jpg', width: 1446, height: 1088, numbers: [12, 13] },
  { image: '/comics/krox/1/en/14-15.jpg', width: 1447, height: 1087, numbers: [14, 15] },
  { image: '/comics/krox/1/en/16-17.jpg', width: 1446, height: 1087, numbers: [16, 17] },
  { image: '/comics/krox/1/en/18-19.jpg', width: 1426, height: 1103, numbers: [18, 19] },
  { image: '/comics/krox/1/en/20-21.jpg', width: 1447, height: 1087, numbers: [20, 21] },
  { image: '/comics/krox/1/en/22-23.jpg', width: 1447, height: 1087, numbers: [22, 23] },
  { image: '/comics/krox/1/en/24-25.jpg', width: 1446, height: 1087, numbers: [24, 25] },
  { image: '/comics/krox/1/en/26-27.jpg', width: 1446, height: 1087, numbers: [26, 27] },
  { image: '/comics/krox/1/en/28.jpg', width: 1024, height: 1536, numbers: [28] },
];

/**
 * One chapter, assembled: the lettered file wherever one exists, the silent
 * delivery everywhere else, always in reading order.
 *
 * WALKS THE DELIVERY AND SUBSTITUTES, rather than putting the lettered pages
 * first and the rest behind them. Until 11 November 2026 it did the latter,
 * which was correct only by luck: Spanish lettering arrived from page 1
 * forwards, so lettered-then-silent happened to be 1..28 in order. English
 * started at the 2-3 spread, and the old form would have opened the chapter
 * on page 2 and put page 1 after it.
 *
 * Keyed by the first printed number, so adding the next spread to a lettered
 * list above stays the only edit required.
 */
function withLettered(lettered: readonly ComicPage[]): readonly ComicPage[] {
  const byFirstNumber = new Map(lettered.map((page) => [page.numbers[0], page]));
  return KROX_RAW.map((page) => byFirstNumber.get(page.numbers[0]) ?? page);
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
  // The same illustration with the finished cover treatment: the imprint
  // wordmark, the issue number, the KROX logo, the credits, the barcode.
  //
  // It leads the reader and the PDF, but never the promo panel, because
  // every one of those elements sits at the top or bottom edge and the panel
  // crops both away. It also carries roughly four times the pixels of
  // portada.jpg, which matters at full width and not at all in a 358px panel.
  cover: { image: '/comics/krox/portada-01.jpg', width: 1004, height: 1567 },
  chapters: [
    {
      number: 1,
      title: {
        es: 'El último guerrero de Athos',
        en: 'The Last Warrior of Athos',
      },
      pages: { es: withLettered(KROX_ES_LETTERED), en: withLettered(KROX_EN_LETTERED) },
      // Spanish only, 28 of 28 since 9 November 2026. English started arriving
      // 11 November 2026 and stands at 25 of 28: add 'en' here the day the
      // last two land, and the reader switches by itself. Still missing:
      // page 1 and the 10-11 spread, both of which still carry Spanish.
      lettered: ['es'],
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
        es: { file: '/comics/krox/1/KROX-Capitulo-1-1544310f.pdf', bytes: 8710214 },
        en: { file: '/comics/krox/1/KROX-Chapter-1-049caf33.pdf', bytes: 9791329 },
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

/**
 * Which artwork a reader actually gets, and in which language it is lettered.
 *
 * The two can differ, and the gap is the point. The site opens in English for
 * a branding reason that has nothing to do with the comic, while the comic is
 * lettered only in Spanish. Serving the English reader the unlettered delivery
 * would mean the default experience of the whole site is a silent comic, so
 * the lettered edition is shown instead and the page says so.
 *
 * Deliberately NOT a silent swap. A reader who opens a comic and finds another
 * language has to be told why, or the site just looks broken in a new way.
 */
export interface ReadingSet {
  pages: readonly ComicPage[];
  /** The language the words in the artwork are in. */
  shownIn: ComicLocale;
  /** True when that is not the language the reader asked for. */
  substituted: boolean;
}

export function readingSet(chapter: ComicChapter, locale: ComicLocale): ReadingSet | null {
  const asked = chapter.pages?.[locale];
  if (!asked || asked.length === 0) return null;
  if (chapter.lettered.includes(locale)) return { pages: asked, shownIn: locale, substituted: false };

  // Nothing is lettered anywhere, so the silent art is the only edition there
  // is. That was the client's own choice on 6 November 2026 and it stands.
  const instead = chapter.lettered.find((l) => (chapter.pages?.[l]?.length ?? 0) > 0);
  if (!instead) return { pages: asked, shownIn: locale, substituted: false };

  return { pages: chapter.pages![instead], shownIn: instead, substituted: true };
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
