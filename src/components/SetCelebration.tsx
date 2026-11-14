'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { fill } from '@/lib/i18n/fill';
import { COMPLETE_SET_FILM, MATCHED_SET_FILM } from '@/lib/characters/media';
import { MatchedSetVideo } from '@/components/MatchedSetVideo';
import { ShareButton } from '@/components/ShareButton';

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
  filmMatched: string;
  filmComplete: string;
  share: string;
  sharePreparing: string;
  shareCopied: string;
}

/**
 * The film itself, as a file the OS share sheet can send.
 *
 * WHAT THE CLIENT ASKED FOR ON 14 NOVEMBER 2026 WAS A SHARE BUTTON HERE, and
 * the obvious implementation is the wrong one: this page is /collection, it
 * redirects to the login screen for anyone not signed in, and a link to it
 * would reach a friend as a password prompt. There is no public collection
 * page to point at yet.
 *
 * So what gets shared is the clip, with a link to the site under it. That is
 * also the thing a collector wants to send: the twenty-four seconds with
 * their own number on the end of it, in WhatsApp, where this audience lives.
 *
 * Fetched only when the button is pressed. It is under two megabytes, but
 * this is a phone on mobile data and nobody should pay for a file they did
 * not ask to send.
 */
async function filmFile(src: string, name: string): Promise<File | null> {
  try {
    // The raw path, exactly as the player above requests it. Adding a cache
    // key here would make the share download the file a second time.
    const response = await fetch(src);
    if (!response.ok) return null;
    const blob = await response.blob();
    return new File([blob], name, { type: blob.type || 'video/mp4' });
  } catch {
    return null;
  }
}

/** One earned ending: its film, its words, and the number drawn over it. */
interface Film {
  key: 'matched' | 'complete';
  src: string;
  /** Already padded, or null for the film that has no single number. */
  number: string | null;
  tab: string;
  title: string;
  body: string;
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

  /*
   * EVERY ENDING THIS COLLECTION HAS EARNED, not just the rarest one.
   *
   * Until 14 November 2026 this picked one film and threw the other away:
   * matched ? MATCHED_SET_FILM : COMPLETE_SET_FILM. Lining the eight numbers
   * up means you completed the set as well, so that `:` was quietly spending
   * one of the client's two animations to show the other. He caught it on his
   * own collection: "que se vean ambos videos".
   *
   * Rarest first, because that is the one the moment is about. The ordinary
   * completion still gets its own film when the numbers do not line up, which
   * is the only case this list has ever had one entry.
   */
  const films: Film[] = [];
  if (matched && MATCHED_SET_FILM) {
    films.push({
      key: 'matched',
      src: MATCHED_SET_FILM,
      number: pad(headline!),
      tab: t.filmMatched,
      title: t.matchedTitle,
      body: fill(t.matchedBody, { number: pad(headline!) }),
    });
  }
  if (COMPLETE_SET_FILM) {
    films.push({
      key: 'complete',
      src: COMPLETE_SET_FILM,
      number: null,
      tab: t.filmComplete,
      title: t.completeTitle,
      body: t.completeBody,
    });
  }
  const hasFilm = films.length > 0;
  const [playing, setPlaying] = useState<'matched' | 'complete'>('matched');
  const current = films.find((f) => f.key === playing) ?? films[0] ?? null;
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
    if (!hasFilm) return;
    try {
      if (window.localStorage.getItem(seenKey)) return;
      window.localStorage.setItem(seenKey, String(Date.now()));
    } catch {
      // Private window, blocked storage: show it. Twice is better than never.
    }
    setShowing(true);
    // hasFilm rather than the film itself: `films` is rebuilt on every render,
    // so depending on an object out of it would re-run this effect forever.
  }, [hasFilm, seenKey]);

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
          {hasFilm && !showing ? (
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
              /* Scrolls on the backdrop, centres on the track inside it.
                 Centring directly on a scroll container is the old trap: once
                 the card is taller than the viewport, `items-center` pushes
                 its top above the scrollable area and that part can never be
                 reached. `min-h-full` on the inner track centres while there
                 is room and grows when there is not. Only a 320px phone gets
                 there, and on that one it scrolls instead of being cut. */
              className="fixed inset-0 z-50 overflow-y-auto bg-ink-950/90 px-6 py-6 backdrop-blur-sm"
              role="dialog"
              aria-modal="true"
              onClick={() => setShowing(false)}
            >
              <div className="flex min-h-full items-center justify-center">
              <div
                className={`holo-border w-full max-w-sm rounded-3xl p-[1px] ${
                  reduced ? '' : 'animate-[pop-in_.5s_cubic-bezier(.2,.8,.2,1)]'
                }`}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="rounded-3xl bg-ink-925 px-5 py-6 text-center sm:px-7 sm:py-7">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-ink-400">
                    {current!.title}
                  </p>

                  {/* The film is 9:16, which is taller than a phone once the
                      text and the button are counted. Capping the WIDTH caps
                      the height through the aspect ratio, so the whole dialog
                      fits without the film being cropped or letterboxed.

                      52vh until 14 November 2026, when the selector and the
                      share button were added underneath and a 360x640 phone
                      started losing 26px off both ends of the card. Measured
                      back down to 44, which leaves that screen 24px of margin
                      and still fills a tall one. The scroll on the backdrop
                      is the net for whatever viewport neither of us tested. */}
                  <div
                    className="mx-auto mt-4 w-full"
                    style={{ maxWidth: 'min(100%, calc(44vh * 9 / 16))' }}
                  >
                    {/* Keyed, so switching films mounts a fresh player and the
                        new one starts from its first frame. Without it React
                        keeps the element and only swaps the src, which leaves
                        the second film starting wherever the first one was. */}
                    <MatchedSetVideo
                      key={current!.key}
                      src={current!.src}
                      number={current!.number}
                      label={current!.body}
                    />
                  </div>

                  {/* Only when there are two. One film with a selector above
                      it that cannot select anything is furniture. */}
                  {films.length > 1 ? (
                    <div
                      role="group"
                      aria-label={t.celebrate}
                      className="mx-auto mt-4 flex items-center rounded-xl bg-ink-950 p-0.5 ring-1 ring-ink-800"
                    >
                      {films.map((f) => (
                        <button
                          key={f.key}
                          type="button"
                          aria-pressed={f.key === current!.key}
                          onClick={() => setPlaying(f.key)}
                          className={`press flex-1 rounded-[10px] px-2 py-2 text-xs font-semibold transition ${
                            f.key === current!.key
                              ? 'bg-accent text-ink-950'
                              : 'text-ink-400 hover:bg-ink-900 hover:text-ink-100'
                          }`}
                        >
                          {f.tab}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  <p className="mt-5 text-sm leading-relaxed text-ink-300">{current!.body}</p>

                  <ShareButton
                    className="mt-5"
                    title={current!.title}
                    text={current!.body}
                    /* The site, not this page. /collection redirects to the
                       login screen for anyone who is not signed in, so the
                       address in the bar is the one link that must not be
                       sent. Read off the window rather than hard-coded, so a
                       staging host shares itself. */
                    url={window.location.origin}
                    label={t.share}
                    busyLabel={t.sharePreparing}
                    copiedLabel={t.shareCopied}
                    file={() =>
                      filmFile(
                        current!.src,
                        current!.number
                          ? `binkis-${current!.number}.mp4`
                          : 'binkis-coleccion-completa.mp4',
                      )
                    }
                  />

                  <button
                    type="button"
                    onClick={() => setShowing(false)}
                    /* Quieter than it was, now that Share sits above it and
                       two identical outlined buttons would make the collector
                       pick between them. Closing is not an achievement. */
                    className="mt-3 w-full rounded-xl py-3 text-sm font-medium text-ink-400 hover:bg-ink-900 hover:text-ink-100"
                  >
                    {t.dismiss}
                  </button>
                </div>
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
