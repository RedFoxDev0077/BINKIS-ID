import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, fill } from '@/lib/i18n';
import { mediaUrl } from '@/lib/comics/catalog';
import { megabytes, runtime, watchable } from '@/lib/videos/catalog';

/**
 * UNIVERSALS animation: the index.
 *
 * Unlike /comic, which redirects straight into the reading because the client
 * did not want a second tap before the first page, this one is a real list
 * and stays one. The clips are short, they are not a sequence, and the whole
 * point of what he asked for on 10 November 2026 is a place that grows: "un
 * boton donde podamos ir implementando mas videos posteriores". A list of one
 * today is a list of six later without a second route being invented.
 *
 * Public and cacheable. No auth, no database, nothing but declared files.
 */
export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslations();
  const clips = watchable();
  return {
    title: `${t.videos.title} · BINKIS ID`,
    description: t.videos.intro,
    openGraph: {
      type: 'website',
      title: t.videos.title,
      description: t.videos.intro,
      images: clips[0] ? [{ url: mediaUrl(clips[0].poster), alt: t.videos.title }] : undefined,
    },
  };
}

export default async function VideosPage() {
  const { t, locale } = await getTranslations();
  const clips = watchable();

  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-20 pt-6 sm:px-6">
      <header className="mb-6">
        <h1 className="font-display text-sm tracking-[0.3em] text-accent-bright">
          {t.videos.title}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-300">{t.videos.intro}</p>
      </header>

      {clips.length === 0 ? (
        /* Should be unreachable: the entry points hide themselves when
           nothing is watchable, exactly like the comic promo block. It is
           here so that if one of them ever gets it wrong, the page says so
           plainly instead of rendering an empty grid. */
        <p className="rounded-xl border border-ink-800 bg-ink-900/60 px-4 py-6 text-center text-sm text-ink-400">
          {t.videos.empty}
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {clips.map((clip) => (
            <li key={clip.slug}>
              <Link
                href={`/video/${clip.slug}` as never}
                className="press group block overflow-hidden rounded-xl border border-ink-800 bg-ink-900 transition hover:border-ink-600"
              >
                <div className="relative">
                  {/* A plain img, like every other media file here: these are
                      served by Caddy off the host, so the optimiser inside the
                      app container cannot fetch them. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={mediaUrl(clip.poster)}
                    alt=""
                    width={clip.source.width}
                    height={clip.source.height}
                    loading="lazy"
                    decoding="async"
                    className="aspect-video h-auto w-full object-cover"
                  />
                  {/* The play mark sits on the poster so a still frame cannot
                      be mistaken for a photograph. Decorative: the link text
                      underneath already says what this is. */}
                  <span
                    aria-hidden
                    className="absolute inset-0 flex items-center justify-center"
                  >
                    <span className="flex size-14 items-center justify-center rounded-full bg-ink-950/60 ring-1 ring-white/30 backdrop-blur-sm transition group-hover:bg-ink-950/75">
                      <svg viewBox="0 0 24 24" className="ml-0.5 size-6 fill-white">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </span>
                  </span>
                </div>

                <div className="p-4">
                  <p className="text-base font-semibold leading-snug text-ink-50">
                    {clip.title[locale]}
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-300">
                    {clip.blurb[locale]}
                  </p>
                  <p className="mt-2.5 font-mono text-xs tabular-nums text-ink-400">
                    {fill(t.videos.meta, {
                      runtime: runtime(clip.seconds),
                      size: megabytes(clip.source.bytes, locale),
                    })}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="pt-8">
        <Link
          href="/"
          className="press flex min-h-14 w-full items-center justify-center rounded-xl border border-ink-700 px-6 text-base font-semibold text-ink-100 transition hover:border-ink-600 hover:text-white"
        >
          {t.comic.back}
        </Link>
      </div>
    </main>
  );
}
