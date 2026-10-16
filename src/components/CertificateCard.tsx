import type { ReactNode } from 'react';

/**
 * Certificate and details, as the thing you open.
 *
 * The client's design puts this behind a button rather than leaving the
 * fields on the page: the piece's number and its registration are what a
 * collector came for, and eight rows of production data under them is a wall
 * to scroll past on a phone.
 *
 * A <details> rather than state: it opens without JavaScript, the keyboard
 * gets it for free, and the browser handles the accessibility that a div with
 * an onClick would have to reimplement badly.
 */
export function CertificateCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <details className="group overflow-hidden rounded-2xl border border-[oklch(0.42_0.14_300)] bg-[oklch(0.26_0.09_300)]">
      <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-4 transition hover:bg-white/5 [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/10"
        >
          <svg viewBox="0 0 24 24" className="size-5 text-white" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M8 3h8a2 2 0 012 2v14a2 2 0 01-2 2H8a2 2 0 01-2-2V5a2 2 0 012-2z" />
            <path d="M9.5 8h5M9.5 12h5M9.5 16h3" strokeLinecap="round" />
          </svg>
        </span>

        <span className="min-w-0 flex-1">
          <span className="block font-display text-lg leading-tight tracking-wide text-white">
            {title}
          </span>
          <span className="mt-0.5 block text-xs text-white/70">{subtitle}</span>
        </span>

        {/* Turns to point down once the card is open. */}
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="size-5 shrink-0 text-white/70 transition-transform group-open:rotate-90"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      </summary>

      <div className="border-t border-white/10 bg-ink-950/40 px-5 py-6 sm:px-6">{children}</div>
    </details>
  );
}
