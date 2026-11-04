'use client';

import Image from 'next/image';
import BinkisTutorial from './binkis-tutorial/BinkisTutorial';
import type { Dictionary } from '@/lib/i18n';

/**
 * The way into the register tutorial.
 *
 * The package ships its own launcher: a 15px underlined link with a 30px
 * round crop of Aguila's face, meant to sit quietly under a form. On the
 * passport it sat too quietly. The client asked on 4 November 2026 for it to
 * be bigger, and sent a mockup of a full-width card above the register
 * button, which is what this is.
 *
 * Size is not the only reason. The person who needs a guide is the person who
 * has never done this before and does not yet know the word "tutorial" is
 * what they are looking for, so the card says what they get rather than what
 * it is: Aguila teaches you, step by step.
 *
 * It is deliberately NOT the same weight as the register button. That one is
 * solid accent on a dark page and is the single thing this screen exists for.
 * This is the same hue held back to a tinted panel with a hairline, so the
 * two read as a primary and a secondary rather than as two offers. The
 * tutorial is help, not the task.
 *
 * Styled here, in our own Tailwind, rather than by editing
 * binkis-tutorial.css. That file is the animator's and will be replaced
 * wholesale the next time he ships a version; anything we write into it is
 * lost silently. Passing `className` is the seam the package gives us for
 * exactly this, and it replaces `bkt-launch` outright.
 */

const AGUILA = 'aguila-saludo.webp';

export function ClaimGuideButton({ t }: { t: Dictionary }) {
  return (
    <BinkisTutorial
      locale={t.locale}
      // Off since 3 November 2026, with the client's agreement: a modal that
      // opens by itself stands between a collector and the one thing they
      // came to do. See ViewerActions for the longer note.
      autoOpen={false}
      className="group flex w-full items-center gap-3.5 rounded-2xl border border-accent-dim/45 bg-accent-dim/15 px-4 py-3.5 text-left transition hover:border-accent/60 hover:bg-accent-dim/25 sm:gap-4 sm:px-5 sm:py-4"
    >
      {/* Unoptimized, like the rest of this package: in production these
          files are served by Caddy from /opt/binkis-id/media and never pass
          through the Next image pipeline. */}
      <Image
        src={`/binkis-tutorial/img/${AGUILA}`}
        alt=""
        width={120}
        height={120}
        unoptimized
        className="size-12 shrink-0 rounded-xl bg-ink-950/40 object-cover object-[50%_10%] sm:size-14"
      />

      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold leading-snug text-ink-50 sm:text-base">
          {t.claim.guideTitle}
        </span>
        <span className="mt-1 flex items-center gap-1.5 text-[13px] font-medium leading-snug text-accent-bright">
          {t.claim.guideCta}
          {/* The arrow is drawn, not typed, so it cannot be dropped or
              turned around by whoever translates the line next. */}
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-3.5 shrink-0 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h13M12 5l7 7-7 7" />
          </svg>
        </span>
      </span>
    </BinkisTutorial>
  );
}
