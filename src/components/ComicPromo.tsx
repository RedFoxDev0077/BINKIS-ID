import { ButtonLink } from './ui/Button';
import { chapterHref, firstReadable, type ComicLocale } from '@/lib/comics/catalog';
import type { Dictionary } from '@/lib/i18n';

/**
 * UNIVERSALS. The way into the comic.
 *
 * Specified by the client on 6 November 2026, and built to his copy and his
 * measurements: wordmark, one line of explanation, a solid button, and the
 * two facts a reader weighs before tapping ("free, no sign-up"). His own
 * summary was the brief worth keeping: the mystery belongs in the story, not
 * in guessing what the button does.
 *
 * Three decisions behind the layout:
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
 * IT HIDES ITSELF. Rendering nothing when no chapter is readable is what
 * stops the button from ever being a promise the site cannot keep. The day
 * the lettered pages are declared in the catalogue, this appears on its own,
 * in both places, with no deploy and no edit here.
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

  return (
    <section
      className={`grain relative overflow-hidden rounded-2xl border border-ink-800 bg-ink-900/70 ${className}`}
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
        className="relative h-36 bg-gradient-to-br from-ink-850 via-ink-900 to-ink-925 bg-cover bg-[50%_32%] sm:h-44"
        style={{ backgroundImage: `url('${comic.hero}')` }}
      >
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-ink-900/95 to-transparent" />
      </div>

      <div className="relative p-5 pt-4 sm:p-6 sm:pt-5">
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

        {/* min-h-14 is 56px and text-lg is 18px: the client's own figures. */}
        <ButtonLink
          href={chapterHref(comic, chapter)}
          size="lg"
          full
          className="mt-5 min-h-14 text-lg"
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
        </ButtonLink>

        {/* ink-300 rather than the ink-500 this size of caption usually gets:
            it is a reason to tap, so it has to clear 4.5:1 like body copy. */}
        <p className="mt-2.5 text-center text-[13px] text-ink-300">{t.comic.free}</p>
      </div>
    </section>
  );
}
