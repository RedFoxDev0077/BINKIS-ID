'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { fill } from '@/lib/i18n/fill';
import { COMPLETE_SET_FILM, MATCHED_SET_FILM } from '@/lib/characters/media';
import { MatchedSetVideo } from '@/components/MatchedSetVideo';

/**
 * What happens when the board fills.
 *
 * Two different moments. Completing the eight is the one most collectors
 * reach, and it earns a banner that stays: it is a standing fact about the
 * collection, not a popup. Completing the eight all at the same printed
 * number is rare enough that it earns the full-screen moment, once, the first
 * time it becomes true.
 *
 * "Once" is held in this browser, not in the database. Being told you
 * completed your set is not a fact about the piece, and the ledger only
 * carries facts about pieces. The cost of getting it wrong is a collector
 * seeing a celebration twice, or not seeing it on a second device, and
 * neither is worth a row that would outlive the collection itself.
 */

interface Strings {
  completeTitle: string;
  completeBody: string;
  matchedTitle: string;
  matchedBody: string;
  matchedExtra: string;
  celebrate: string;
  dismiss: string;
}

export function SetCelebration({
  matchingNumbers,
  t,
}: {
  matchingNumbers: number[];
  t: Strings;
}) {
  const matched = matchingNumbers.length > 0;
  const headline = matched ? matchingNumbers[0]! : null;

  // Which film this completion earns, if any. The matched set has always had
  // one; the ordinary completion gets one the moment its file exists, and
  // until then it keeps the banner it has always had.
  const film = matched ? MATCHED_SET_FILM : COMPLETE_SET_FILM;
  const [showing, setShowing] = useState(false);
  const [reduced, setReduced] = useState(false);
  // The portal below needs a document, which the server does not have.
  const [mounted, setMounted] = useState(false);

  // The key carries the number, so a collector who later completes a second
  // matched set gets that moment too.
  const seenKey = matched ? `binkis:set:matched:${headline}` : 'binkis:set:complete';

  useEffect(() => {
    setMounted(true);
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    // A completion only interrupts if there is something to interrupt with.
    // Without a film the banner says it, and a modal holding a line of text
    // the page is already showing is just something to dismiss.
    if (!film) return;
    try {
      if (window.localStorage.getItem(seenKey)) return;
      window.localStorage.setItem(seenKey, String(Date.now()));
    } catch {
      // Private window, blocked storage: show it. Twice is better than never.
    }
    setShowing(true);
  }, [film, seenKey]);

  return (
    <>
      <div
        className="holo-border mt-5 rounded-2xl p-[1px]"
        role="status"
        aria-live="polite"
      >
        <div className="rounded-2xl bg-ink-950/90 px-5 py-4">
          <p className="font-display text-lg tracking-wide text-white">
            {matched ? t.matchedTitle : t.completeTitle}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-ink-300">
            {matched ? fill(t.matchedBody, { number: pad(headline!) }) : t.completeBody}
          </p>
          {matchingNumbers.length > 1 ? (
            <p className="mt-1 text-sm text-ink-400">
              {matchingNumbers
                .slice(1)
                .map((n) => fill(t.matchedExtra, { number: pad(n) }))
                .join(', ')}
            </p>
          ) : null}
          {film && !showing ? (
            <button
              type="button"
              onClick={() => setShowing(true)}
              className="mt-3 text-sm font-medium text-accent hover:underline"
            >
              {t.celebrate}
            </button>
          ) : null}
        </div>
      </div>

      {/* Through a portal onto the body, because `position: fixed` is only
          relative to the viewport while no ancestor has a transform or a
          filter. Card has a backdrop-blur, which is enough to capture it, and
          a full-screen moment pinned inside a card is not a moment. */}
      {showing && mounted
        ? createPortal(
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/90 px-6 backdrop-blur-sm"
              role="dialog"
              aria-modal="true"
              onClick={() => setShowing(false)}
            >
              <div
                className={`holo-border w-full max-w-sm rounded-3xl p-[1px] ${
                  reduced ? '' : 'animate-[pop-in_.5s_cubic-bezier(.2,.8,.2,1)]'
                }`}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="rounded-3xl bg-ink-925 px-5 py-6 text-center sm:px-7 sm:py-7">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-ink-400">
                    {matched ? t.matchedTitle : t.completeTitle}
                  </p>

                  {/* The film is 9:16, which is taller than a phone once the
                      text and the button are counted. Capping the WIDTH caps
                      the height through the aspect ratio, so the whole dialog
                      fits without the film being cropped or letterboxed. */}
                  <div
                    className="mx-auto mt-4 w-full"
                    style={{ maxWidth: 'min(100%, calc(52vh * 9 / 16))' }}
                  >
                    <MatchedSetVideo
                      src={film!}
                      number={matched ? pad(headline!) : null}
                      label={matched ? fill(t.matchedBody, { number: pad(headline!) }) : t.completeBody}
                    />
                  </div>

                  <p className="mt-5 text-sm leading-relaxed text-ink-300">
                    {matched ? fill(t.matchedBody, { number: pad(headline!) }) : t.completeBody}
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowing(false)}
                    className="mt-5 w-full rounded-xl border border-ink-700 py-3 text-sm font-medium text-ink-200 hover:bg-ink-900"
                  >
                    {t.dismiss}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

/** The number as it is printed on the piece: six digits. */
function pad(n: number): string {
  return String(n).padStart(6, '0');
}
