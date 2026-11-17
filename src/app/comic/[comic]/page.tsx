import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations, fill } from '@/lib/i18n';
import { ComicPlateImage } from '@/components/ComicPlateImage';
import {
  chapterHref,
  findComic,
  findUpcoming,
  firstReadable,
  mediaUrl,
  previewSet,
  readableChapters,
  releaseMonth,
} from '@/lib/comics/catalog';

/**
 * The announcement page: a comic that exists but is not out.
 *
 * Asked for by the client on 17 November 2026 for AGUILA, as "un boton ... de
 * proximamente ... por lo pronto queria solo la portada y dos paginas. tipo
 * tiser."
 *
 * Public and cacheable like the reader, and deliberately NOT a chapter route.
 * Everything here is reached through UPCOMING, which `firstReadable` and
 * `hasReadableComic` cannot see, so no amount of editing this page can make
 * the headline button open a comic that has not been drawn.
 *
 * It also gives /comic/{slug} a meaning for a comic that IS out, which until
 * today was a 404: it gets out of the way to chapter one, on the same
 * principle as /comic itself. One tap should land on the reading.
 */
export const revalidate = 3600;

type Params = { params: Promise<{ comic: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { comic: slug } = await params;
  const { t, locale } = await getTranslations();
  const upcoming = findUpcoming(slug);
  if (!upcoming) return { title: 'BINKIS ID' };

  const title = `${upcoming.title}: ${upcoming.subtitle[locale]} · UNIVERSALS`;
  const description = fill(t.comic.upcoming.firstLookBody, {
    month: releaseMonth(upcoming, locale),
  });

  return {
    title,
    description,
    // The dated poster, so a link pasted into a chat previews as the
    // announcement it is.
    openGraph: {
      type: 'article',
      title,
      description,
      images: [{ url: mediaUrl(upcoming.poster.image), alt: upcoming.title }],
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function ComicLandingPage({ params }: Params) {
  const { comic: slug } = await params;
  const { t, locale } = await getTranslations();

  const upcoming = findUpcoming(slug);
  if (!upcoming) {
    // Not announced. Either it is a comic that is actually out, in which case
    // this URL should land on the reading, or it is nothing.
    const comic = findComic(slug);
    const chapter = comic ? readableChapters(comic, locale)[0] : null;
    if (comic && chapter) redirect(chapterHref(comic, chapter) as never);
    notFound();
  }

  const month = releaseMonth(upcoming, locale);
  const preview = previewSet(upcoming, locale);
  // Where "meanwhile, read KROX" goes. Resolved rather than hard-coded, so
  // the button cannot outlive the chapter it points at.
  const meanwhile = firstReadable(locale);

  return (
    <main className="pb-20">
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
              {upcoming.title}
            </p>
            <p className="truncate text-xs text-ink-400">{upcoming.subtitle[locale]}</p>
          </div>

          {/* The date, in the artwork's own lime. Tabular figures so it sits
              still beside the title rather than shifting with the month. */}
          <span className="min-h-11 shrink-0 content-center px-2 text-xs font-semibold uppercase tracking-wide text-[#B8F808] tabular-nums">
            {month}
          </span>
        </div>
      </header>

      <div className="mx-auto w-full max-w-4xl px-0 sm:px-6">
        {/* The announcement poster first, at full width. It carries the date
            inside the artwork, which is why it leads: the page says what it
            is before a single word of interface is read. */}
        <div className="pt-2 sm:pt-4">
          <ComicPlateImage
            page={upcoming.poster}
            label={fill(t.comic.upcoming.poster, { title: upcoming.title })}
            priority
          />
        </div>

        <div className="px-4 pt-6 text-center sm:px-0">
          <span className="inline-flex items-center rounded-full border border-[#B8F808]/40 px-3 py-1 text-[11px] font-bold tracking-[0.18em] text-[#B8F808]">
            {t.comic.upcoming.badge}
          </span>
          <h1 className="mt-3 font-display text-2xl tracking-wide text-white sm:text-3xl">
            {upcoming.title}
            <span className="text-ink-400"> · </span>
            {upcoming.subtitle[locale]}
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-300">
            {fill(t.comic.upcoming.firstLookBody, { month })}
          </p>
        </div>

        {preview ? (
          <>
            {/* Said before the first page, never after it. A reader who meets
                an unexpected language three pages in has already decided the
                site is broken. */}
            {preview.substituted ? (
              <p className="mx-4 mt-6 rounded-lg border border-ink-800 bg-ink-900/60 px-4 py-3 text-center text-xs text-ink-400 sm:mx-0">
                {fill(t.comic.lettering, { language: t.comic.language[preview.shownIn] })}
              </p>
            ) : null}

            <p className="px-4 pb-3 pt-6 text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-500 sm:px-0">
              {t.comic.upcoming.firstLook}
            </p>

            <div className="space-y-2 sm:space-y-4">
              {/* The cover, then the pages. The same order the reader uses,
                  so the taste is shaped like the thing it is a taste of. */}
              <ComicPlateImage page={upcoming.cover} label={t.comic.cover} priority={false} />
              {preview.pages.map((page) => (
                <ComicPlateImage
                  key={page.image}
                  page={page}
                  label={fill(t.comic.page, { numbers: page.numbers.join('-') })}
                  priority={false}
                />
              ))}
            </div>
          </>
        ) : null}

        <div className="space-y-3 px-4 pt-8 sm:px-0">
          {/* Never a dead end. Someone who reached the bottom of an
              announcement for January is exactly the person who would read
              the comic that is finished today. */}
          {meanwhile ? (
            <Link
              href={chapterHref(meanwhile.comic, meanwhile.chapter) as never}
              className="press flex min-h-14 w-full items-center justify-center rounded-xl bg-accent px-6 text-base font-semibold text-ink-950 transition hover:bg-accent-bright"
            >
              {t.comic.upcoming.meanwhile}
            </Link>
          ) : null}

          <Link
            href="/"
            className="press flex min-h-14 w-full items-center justify-center rounded-xl border border-ink-700 px-6 text-base font-semibold text-ink-100 transition hover:border-ink-600 hover:text-white"
          >
            {t.comic.back}
          </Link>
        </div>
      </div>
    </main>
  );
}
