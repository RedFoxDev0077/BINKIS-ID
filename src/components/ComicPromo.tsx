import Link from 'next/link';
import { chapterHref, firstReadable, mediaUrl, type ComicLocale } from '@/lib/comics/catalog';
import { watchable } from '@/lib/videos/catalog';
import type { Dictionary } from '@/lib/i18n';

/**
 * UNIVERSALS. The way into the comic.
 *
 * Specified by the client on 6 November 2026, and built to his copy and his
 * measurements: wordmark, one line of explanation, a solid button, and the
 * two facts a reader weighs before tapping ("free, no sign-up").
 *
 * Four decisions behind the layout:
 *
 * ART ABOVE, WORDS BELOW. The client asked not to set text over a scene full
 * of faces and explosions, which is the right call and also the accessible
 * one: copy over artwork cannot hold a contrast ratio, because the artwork
 * changes per chapter. So the illustration gets its own panel and the words
 * sit on flat ink underneath, where 4.5:1 is a property of the theme rather
 * than of whichever page we happen to be showing.
 *
 * THE BUTTON IS 56px AND 18px. His numbers, taken as given. They are also
 * what this site needed anyway: the previous comic entry point was a text
 * link that he could barely read on his own phone.
 *
 * IT IS MEANT TO BE UNMISSABLE. He came back on 6 November asking for an
 * entry "notorio ... que invite a picarlo", so the block now carries the
 * holographic edge, a badge over the art, and a gradient on the button. The
 * iridescence is not ornament borrowed from somewhere: the physical product
 * is a hologram sticker, so it is this brand's own way of saying that a thing
 * is worth looking at. All of it is static. A looping shimmer would have read
 * as louder still and would have been the one kind of motion this project
 * does not allow.
 *
 * IT HIDES ITSELF. Rendering nothing when no chapter is readable is what
 * stops the button from ever being a promise the site cannot keep.
 */
export function ComicPromo({
  locale,
  t,
  className = '',
}: {
  locale: ComicLocale;
  t: Dictionary;
  className?: string;
}) {
  const opening = firstReadable(locale);
  if (!opening) return null;

  const { comic, chapter } = opening;
  // Hidden until a clip is actually watchable, on the same principle as the
  // block itself: a button is never a promise the site cannot keep.
  const hasAnimation = watchable().length > 0;

  return (
    <section
      className={`grain holo-border relative overflow-hidden rounded-2xl ${className}`}
      aria-labelledby="universals-heading"
    >
      {/*
        A plain background-image, not next/image, for the same reason the
        character stills are a plain img: these files are served by Caddy off
        the host, so the optimiser inside the app container cannot fetch them.
        The gradient underneath is not decoration, it is the fallback: if the
        art has not been deployed yet the panel reads as a dark field rather
        than as a broken image icon.
      */}
      <div
        aria-hidden
        className="relative h-44 bg-gradient-to-br from-ink-850 via-ink-900 to-ink-925 bg-cover sm:h-56"
        style={{
          backgroundImage: `url('${mediaUrl(comic.hero)}')`,
          // Inline rather than a Tailwind class: the anchor is a property of
          // whichever cover this comic ships, not of the panel.
          backgroundPosition: comic.heroFocus ?? '50% 32%',
        }}
      >
        <span className="absolute left-4 top-4 rounded-full bg-accent px-3 py-1 text-[11px] font-bold tracking-[0.18em] text-ink-950 shadow-[0_4px_16px_-2px_oklch(0.76_0.17_195/0.65)]">
          {t.comic.badge}
        </span>
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-ink-900 via-ink-900/80 to-transparent" />
      </div>

      <div className="relative bg-ink-900 p-5 pt-4 sm:p-6 sm:pt-5">
        <p
          id="universals-heading"
          className="font-display text-sm tracking-[0.3em] text-accent-bright"
        >
          UNIVERSALS
        </p>
        <p className="mt-1.5 text-[15px] font-semibold leading-snug text-ink-50 sm:text-base">
          {t.comic.tagline}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-ink-300">{t.comic.blurb}</p>

        {/* How much there is to read. A reason to tap, and an honest one. */}
        <p className="mt-3 font-mono text-xs tracking-wide text-ink-400 tabular-nums">
          {t.comic.count}
        </p>

        {/* Not ButtonLink: the gradient and the glow would collide with the
            primary variant's own background utility, and which of two
            conflicting Tailwind classes wins is not something to leave to
            build order on the client's headline call to action.
            min-h-14 is 56px and text-lg is 18px, both his figures. */}
        <Link
          href={chapterHref(comic, chapter) as never}
          className="press mt-4 inline-flex min-h-14 w-full items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-accent via-accent-bright to-accent px-7 text-lg font-semibold text-ink-950 shadow-[0_10px_34px_-8px_oklch(0.76_0.17_195/0.75)] ring-1 ring-accent-bright/60 transition hover:brightness-110"
        >
          {t.comic.cta}
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-4 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h13M12 5l7 7-7 7" />
          </svg>
        </Link>

        {/* The animation, under the comic rather than beside it.

            The client asked on 10 November 2026 to reach the shorts from
            "el mismo boton del comic". Two buttons of equal weight would make
            the reader choose before they know what either is, and the comic
            is the finished work with 28 pages behind it, so this one is
            quieter: outline, not gradient, and second. It is still 48px and
            full width, because this is a phone in bad light. */}
        {hasAnimation ? (
          <Link
            href={'/videos' as never}
            className="press mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-ink-600 px-6 text-[15px] font-semibold text-ink-100 transition hover:border-accent hover:text-white"
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="size-4 shrink-0 fill-current"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
            {t.videos.cta}
          </Link>
        ) : null}

        {/* The client's closing line, 7 November 2026, in place of the old
            "Gratis / Sin registro". That one answered a question about this
            chapter; this one is about the series, so it is set as a short
            two-line sign-off rather than as a caption. The first line carries
            the promise and gets the brighter ink; the second dates it and
            steps back. Both clear 4.5:1. */}
        <p className="mt-4 text-center text-sm font-medium leading-snug text-ink-100">
          {t.comic.teaser}
        </p>
        <p className="mt-1 text-center text-[13px] leading-snug text-ink-400">
          {t.comic.teaserNext}
        </p>
      </div>
    </section>
  );
}
