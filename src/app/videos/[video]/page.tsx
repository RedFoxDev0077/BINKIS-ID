import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations, fill } from '@/lib/i18n';
import { ShareButton } from '@/components/ShareButton';
import { chapterHref, firstReadable, mediaUrl } from '@/lib/comics/catalog';
import { findAnimation, megabytes, runtime, watchable } from '@/lib/videos/catalog';

/**
 * One UNIVERSALS short.
 *
 * A PLAIN <video controls>, AND THAT IS THE WHOLE PLAYER. No client
 * component, no custom chrome, no tap-to-reveal. The prize reveal over on the
 * BinKis hologram app needs JavaScript because it has to call play() inside
 * the gesture to be allowed sound, and because a form sits behind it. Nothing
 * sits behind this. Somebody arrived here to watch a video, so the browser's
 * own controls - which they already know, which are keyboard reachable,
 * which hand them fullscreen and captions and speed for free - are better
 * than anything worth writing, and this page stays a server component.
 *
 * It does not autoplay. On a phone on mobile data, five megabytes should
 * start downloading because somebody asked for it.
 *
 * `preload="none"` with a poster, so the page costs one 45 KB still until
 * then; `playsInline` so iOS plays it in the page rather than throwing it
 * into its own fullscreen player, which is what makes the Share button under
 * it reachable.
 */
export const revalidate = 3600;

type Params = { params: Promise<{ video: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { video } = await params;
  const { locale } = await getTranslations();
  const clip = findAnimation(video);
  if (!clip) return { title: 'BINKIS ID' };

  const title = `${clip.title[locale]} · UNIVERSALS`;
  return {
    title,
    description: clip.blurb[locale],
    openGraph: {
      type: 'video.other',
      title,
      description: clip.blurb[locale],
      images: [{ url: mediaUrl(clip.poster), alt: clip.title[locale] }],
    },
    twitter: { card: 'summary_large_image', title, description: clip.blurb[locale] },
  };
}

/** Pre-rendered, because the list is short and declared at build time. */
export function generateStaticParams() {
  return watchable().map((clip) => ({ video: clip.slug }));
}

export default async function VideoPage({ params }: Params) {
  const { video } = await params;
  const { t, locale } = await getTranslations();

  const clip = findAnimation(video);
  if (!clip) notFound();

  // The chapter to send someone to once the short is over, when this clip
  // belongs to a comic that is actually readable in their language.
  const opening = clip.comic ? firstReadable(locale) : null;
  const chapter = opening && opening.comic.slug === clip.comic ? opening : null;

  return (
    <main className="mx-auto w-full max-w-4xl px-0 pb-20 pt-4 sm:px-6">
      <header className="px-4 sm:px-0">
        <Link
          href={'/videos' as never}
          className="press inline-flex min-h-11 items-center gap-1.5 rounded-lg text-sm text-ink-300 transition hover:text-ink-50"
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
          {t.videos.back}
        </Link>
      </header>

      <div className="mt-3 bg-black sm:rounded-xl sm:bg-transparent">
        {/* width and height are the intrinsic size, so the box is reserved
            before anything is fetched and the page does not jump. */}
        <video
          controls
          playsInline
          preload="none"
          poster={mediaUrl(clip.poster)}
          width={clip.source.width}
          height={clip.source.height}
          className="h-auto w-full bg-black sm:rounded-xl"
        >
          <source src={mediaUrl(clip.source.file)} type="video/mp4" />
        </video>
      </div>

      <div className="px-4 pt-5 sm:px-0">
        <h1 className="font-display text-xl leading-tight text-ink-50 sm:text-2xl">
          {clip.title[locale]}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-300">{clip.blurb[locale]}</p>
        <p className="mt-3 font-mono text-xs tabular-nums text-ink-400">
          {fill(t.videos.meta, {
            runtime: runtime(clip.seconds),
            size: megabytes(clip.source.bytes, locale),
          })}
        </p>

        {/* Only when the clip has words AND they are not the viewer's
            language. A clip declared with no words says nothing, which is
            why the unset value is null rather than a guess. */}
        {clip.spokenIn && clip.spokenIn !== locale ? (
          <p className="mt-3 rounded-lg border border-ink-800 bg-ink-900/60 px-4 py-3 text-xs text-ink-400">
            {fill(t.videos.spoken, { language: t.comic.language[clip.spokenIn] })}
          </p>
        ) : null}

        <div className="space-y-3 pt-6">
          <ShareButton
            title={`${clip.title[locale]} · UNIVERSALS`}
            label={t.videos.share}
            copiedLabel={t.videos.shareCopied}
          />

          {chapter ? (
            <Link
              href={chapterHref(chapter.comic, chapter.chapter) as never}
              className="press flex min-h-14 w-full items-center justify-center rounded-xl bg-accent px-6 text-base font-semibold text-ink-950 transition hover:bg-accent-bright"
            >
              {t.videos.backToComic}
            </Link>
          ) : null}
        </div>
      </div>
    </main>
  );
}
