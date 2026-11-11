import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations, fill } from '@/lib/i18n';
import { ShareButton } from '@/components/ShareButton';
import {
  chapterHref,
  findChapter,
  mediaUrl,
  readableChapters,
  readingSet,
  type ComicPlate,
} from '@/lib/comics/catalog';

/**
 * The reader.
 *
 * Public and cacheable, like the passport: "Gratis, sin registro" is a
 * promise printed on the button, so this route never touches auth and never
 * reads the database.
 *
 * ON SPREADS. The delivered art runs its panels straight through the gutter,
 * so a file holding pages 2 and 3 is one drawing and cannot be cut in half.
 * Each page is therefore shown whole, fitted to the width of the screen, and
 * enlarged by pinching. That is not a fallback for a viewer I did not build:
 * the layout already allows scaling up to 5x, so the gesture every reader
 * already knows does the job, keeps the browser's own smooth zoom, and costs
 * no JavaScript on a page whose entire weight should be artwork.
 */
export const revalidate = 3600;

type Params = { params: Promise<{ comic: string; chapter: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { comic: comicSlug, chapter: chapterParam } = await params;
  const { locale } = await getTranslations();
  const found = findChapter(comicSlug, Number(chapterParam), locale);
  if (!found) return { title: 'BINKIS ID' };

  const title = `${found.comic.title}: ${found.chapter.title[locale]} · UNIVERSALS`;
  const description = found.chapter.title[locale];

  return {
    title,
    description,
    // So the link previews with the cover when somebody pastes it into a
    // chat, which is how this comic is actually going to travel.
    openGraph: {
      type: 'article',
      title,
      description,
      images: [{ url: mediaUrl(found.comic.hero), alt: found.comic.title }],
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function ComicReaderPage({ params }: Params) {
  const { comic: comicSlug, chapter: chapterParam } = await params;
  const { t, locale } = await getTranslations();

  const chapterNumber = Number(chapterParam);
  if (!Number.isInteger(chapterNumber)) notFound();

  const found = findChapter(comicSlug, chapterNumber, locale);
  if (!found) notFound();

  const { comic, chapter } = found;
  // The lettered edition, which is not always the one the reader asked for.
  const reading = readingSet(chapter, locale)!;
  const pages = reading.pages;
  const siblings = readableChapters(comic, locale);
  const next = siblings.find((c) => c.number > chapter.number) ?? null;
  const hasSpread = pages.some((page) => page.numbers.length === 2);
  // The PDF follows the artwork on screen rather than the interface language.
  // Offering an English reader a download of the silent pages they were just
  // spared would undo the substitution one tap later.
  const download = chapter.downloads?.[reading.shownIn] ?? null;

  return (
    <main className="pb-20">
      {/* Deliberately NOT sticky.

          The site header already is, at z-40, and a second bar pinned under
          it ate the chapter title on a 390px screen. It would also be two
          bars of furniture over artwork on the one page of this site that
          should be almost entirely artwork. The site header carries the way
          home and the language switch and stays pinned; this one names the
          chapter and then gets out of the way. */}
      <header className="border-b border-ink-800 bg-ink-950/90">
        <div className="mx-auto flex w-full max-w-4xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link
            href="/"
            className="press inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm text-ink-300 transition hover:text-ink-50"
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 12H6M13 5l-7 7 7 7" />
            </svg>
            <span className="hidden sm:inline">{t.comic.back}</span>
          </Link>

          <div className="min-w-0 flex-1 text-center">
            <p className="font-display text-[11px] tracking-[0.28em] text-accent-bright">
              {comic.title}
            </p>
            <p className="truncate text-xs text-ink-400">{chapter.title[locale]}</p>
          </div>

          <span className="min-h-11 shrink-0 content-center px-2 text-xs text-ink-500">
            {fill(t.comic.chapter, { number: chapter.number })}
          </span>
        </div>
      </header>

      <div className="mx-auto w-full max-w-4xl px-0 sm:px-6">
        {/* Said once, at the top, before the first page rather than after it.
            A reader who meets an unexpected language three pages in has
            already decided the site is broken. */}
        {reading.substituted ? (
          <p className="mx-4 mt-3 rounded-lg border border-ink-800 bg-ink-900/60 px-4 py-3 text-center text-xs text-ink-400 sm:mx-0">
            {fill(t.comic.lettering, { language: t.comic.language[reading.shownIn] })}
          </p>
        ) : null}

        {hasSpread ? (
          <p className="px-4 py-3 text-center text-xs text-ink-500 sm:px-0">{t.comic.spreadHint}</p>
        ) : null}

        <div className="space-y-2 sm:space-y-4">
          {/* The cover, ahead of page 1 and outside the numbered run.

              It led the PDF from the day the client sent it, and did not
              lead the reader until he opened the reader and said so on
              11 November 2026. It carries no printed page number, so it is
              captioned by what it is, exactly like the closing plates, and
              it never enters the 1..28 count.

              It also takes the eager load off page 1: the cover is now the
              first thing on the screen, and the browser should be fetching
              what the reader is looking at. */}
          {comic.cover ? (
            <ComicPageImage page={comic.cover} label={t.comic.cover} priority />
          ) : null}

          {pages.map((page, index) => (
            <ComicPageImage
              key={page.image}
              page={page}
              label={fill(t.comic.page, { numbers: page.numbers.join('-') })}
              priority={!comic.cover && index === 0}
            />
          ))}

          {/* The closing plates, after the last numbered page. They are
              artwork rather than pages, so each is labelled by what it is and
              never given a page number it does not have. */}
          {(chapter.closing ?? []).map((plate) => (
            <ComicPageImage
              key={plate.image}
              page={plate}
              label={t.comic[plate.label]}
              priority={false}
            />
          ))}
        </div>

        <div className="space-y-3 px-4 pt-8 sm:px-0">
          {/* After the last page, which is where someone decides whether to
              pass it on. The client asked for this on 8 November 2026. */}
          <ShareButton
            title={`${comic.title}: ${chapter.title[locale]}`}
            label={t.comic.share}
            copiedLabel={t.comic.shareCopied}
          />

          {/* Quieter than share, and below it, because that is the order of
              what the client wants to happen: a link that travels costs him
              nothing, a file that travels leaves his hands for good. He was
              told that plainly on 9 November 2026 and asked for it anyway.

              A plain anchor, so this stays a server component and the file is
              fetched by the browser rather than assembled by JavaScript. */}
          {download ? (
            <a
              href={mediaUrl(download.file)}
              download={download.file.slice(download.file.lastIndexOf('/') + 1)}
              className="press flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-6 text-sm text-ink-400 transition hover:text-ink-100"
            >
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                className="size-4 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 4v11M12 15l-4-4M12 15l4-4" />
                <path d="M5 17v2a2 2 0 002 2h10a2 2 0 002-2v-2" />
              </svg>
              {fill(t.comic.download, { size: megabytes(download.bytes, locale) })}
            </a>
          ) : null}

          {next ? (
            <Link
              href={chapterHref(comic, next) as never}
              className="press flex min-h-14 w-full items-center justify-center rounded-xl bg-accent px-6 text-lg font-semibold text-ink-950 transition hover:bg-accent-bright"
            >
              {fill(t.comic.chapter, { number: next.number })}
            </Link>
          ) : (
            <Link
              href="/"
              className="press flex min-h-14 w-full items-center justify-center rounded-xl border border-ink-700 px-6 text-base font-semibold text-ink-100 transition hover:border-ink-600 hover:text-white"
            >
              {t.comic.back}
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}

/**
 * The download size, in the reader's own number format.
 *
 * Megabytes rather than anything cleverer: every one of these files is
 * several MB and none will ever be kilobytes, so a unit-picking helper would
 * be code for a case that cannot happen. Spanish writes 8,2 and English 8.2,
 * which Intl already knows.
 */
function megabytes(bytes: number, locale: string): string {
  const mb = bytes / 1024 / 1024;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(mb)} MB`;
}

/**
 * One delivered file, which is one page or one two-page spread.
 *
 * width and height are the intrinsic pixel size and they are declared so the
 * browser reserves the right box before the image arrives. Without them a
 * chapter of 14 tall images reflows under the reader's thumb all the way
 * down, which on a phone on mobile data is the difference between reading and
 * chasing the page.
 *
 * A plain img, not next/image: these files are served by Caddy straight off
 * the host, so the optimiser inside the app container cannot fetch them.
 */
function ComicPageImage({
  page,
  label,
  priority,
}: {
  page: ComicPlate;
  label: string;
  priority: boolean;
}) {
  return (
    <figure className="bg-ink-925">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={mediaUrl(page.image)}
        alt={label}
        width={page.width}
        height={page.height}
        loading={priority ? 'eager' : 'lazy'}
        decoding={priority ? 'sync' : 'async'}
        fetchPriority={priority ? 'high' : 'auto'}
        className="h-auto w-full sm:rounded-lg"
      />
      <figcaption className="sr-only">{label}</figcaption>
    </figure>
  );
}
