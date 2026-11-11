/**
 * What goes into a chapter's PDF, and what the finished file is called.
 *
 * BUILD TIME ONLY. This lives under scripts/ rather than src/ so that it can
 * use node:crypto without any chance of being pulled into a browser bundle.
 * The app never calls this: it reads the finished name out of the catalog.
 *
 * THE NAME CARRIES A FINGERPRINT OF THE SOURCES, and that is the whole point.
 *
 * Comic art is served immutable for a year and uploaded by hand, separately
 * from the deploy. A PDF built from fourteen lettered pages and then served
 * under the same name after the fifteenth arrives would be a stale file that
 * no browser would ever re-request. So the file is named for what went into
 * it: change the inputs and the name changes, which makes the old cache entry
 * irrelevant instead of wrong.
 *
 * The fingerprint covers the PATHS, not the bytes, because this project's
 * standing rule is that changed art ships under a new file name - a
 * re-lettered page, a new cover, a redrawn plate. The paths therefore move
 * whenever the art moves, and unlike the bytes they are visible to CI, where
 * the artwork itself is not checked in. That is what lets
 * tests/unit/20-comics.test.ts fail the build when a page is added and the
 * download is not rebuilt.
 */

import { createHash } from 'node:crypto';

import type { Comic, ComicChapter, ComicLocale } from '../../src/lib/comics/catalog.ts';

/**
 * Every image in the PDF, in reading order: the cover, then the pages for
 * this language, then the closing plates.
 *
 * The cover leads because a downloaded file is a thing in a folder with a
 * thumbnail, and a comic that opens on its cover is a comic. The closing
 * plates follow the story for the same reason they do in the reader.
 */
export function downloadSources(comic: Comic, chapter: ComicChapter, locale: ComicLocale): string[] {
  const pages = chapter.pages?.[locale] ?? [];
  if (pages.length === 0) throw new Error(`${comic.slug} chapter ${chapter.number} has no ${locale} pages`);
  // The finished cover when there is one, the promo art when there is not.
  // A comic that opens on its own cover is the point; opening on nothing is
  // worse than opening on the bare illustration.
  const cover = comic.cover?.image ?? comic.hero;
  return [cover, ...pages.map((p) => p.image), ...(chapter.closing ?? []).map((p) => p.image)];
}

/** Eight hex characters of the ordered source list. */
export function downloadFingerprint(sources: readonly string[]): string {
  return createHash('sha256').update(sources.join('\n')).digest('hex').slice(0, 8);
}

/** What a reader sees in their downloads folder. ASCII, because a filename travels. */
const STEM: Record<ComicLocale, string> = { es: 'Capitulo', en: 'Chapter' };

export function downloadFileName(
  comic: Comic,
  chapter: ComicChapter,
  locale: ComicLocale,
  sources: readonly string[],
): string {
  const name = comic.title.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${name}-${STEM[locale]}-${chapter.number}-${downloadFingerprint(sources)}.pdf`;
}

/** The path the catalog declares and Caddy serves. */
export function downloadPath(
  comic: Comic,
  chapter: ComicChapter,
  locale: ComicLocale,
  sources: readonly string[],
): string {
  return `/comics/${comic.slug}/${chapter.number}/${downloadFileName(comic, chapter, locale, sources)}`;
}
