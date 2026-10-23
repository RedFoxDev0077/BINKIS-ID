'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { characterMedia } from '@/lib/characters/media';

/**
 * What opens when a collector taps a figure in the case.
 *
 * The client's ask, 22 October 2026: tapping a character should open that
 * character rather than scroll the page. His larger idea is a gallery of
 * official artwork, Superman 1938 through to today, which waits on what DC
 * lets him publish. His own fallback was "then put the 3D render so you can
 * at least see it", and that render already exists: it is the clip the
 * passport plays, one per Classic character.
 *
 * So this is built as a gallery with exactly one item in it. When the
 * artwork is cleared, the extra frames go in beside the render and nothing
 * here has to change shape.
 */

export interface NicheView {
  characterCode: string;
  name: string;
  /** Already in printed form. Null when the character is not owned. */
  serial: string | null;
  qrToken: string | null;
  owned: boolean;
}

interface Strings {
  missing: string;
  viewPassport: string;
  dismiss: string;
}

export function NicheDetail({
  view,
  t,
  onClose,
}: {
  view: NicheView | null;
  t: Strings;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Escape closes it. A tap target this large on a phone is easy to open by
  // accident, so getting out has to be easy too.
  useEffect(() => {
    if (!view) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, onClose]);

  if (!view || !mounted) return null;

  const media = characterMedia(view.characterCode);

  return createPortal(
    // Same portal lesson as the matched-set moment: Card carries a
    // backdrop-blur, which would otherwise make it the containing block for
    // anything fixed inside it.
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/90 px-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={view.name}
      onClick={onClose}
    >
      <div
        className="holo-border w-full max-w-sm rounded-3xl p-[1px] animate-[pop-in_.4s_cubic-bezier(.2,.8,.2,1)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="overflow-hidden rounded-3xl bg-ink-925">
          <div className="relative aspect-square w-full bg-ink-950">
            {media?.video && view.owned ? (
              // The figure's own render, silent and looping. Only for a
              // character they hold: an unclaimed character shows the still,
              // which is the difference between a collection and a catalogue.
              <video
                src={media.video}
                poster={media.poster}
                autoPlay
                muted
                loop
                playsInline
                className="h-full w-full object-contain"
              />
            ) : media ? (
              // eslint-disable-next-line @next/next/no-img-element -- served by the proxy
              <img
                src={media.image}
                alt={view.name}
                className={
                  view.owned
                    ? 'h-full w-full object-contain'
                    : 'h-full w-full object-contain brightness-0 invert-[.28] saturate-0'
                }
              />
            ) : null}
          </div>

          <div className="px-6 py-5 text-center">
            <p className="font-display text-3xl leading-tight tracking-wide text-ink-50">
              {view.name}
            </p>

            {view.owned && view.serial ? (
              <p className="mono mt-2 text-lg text-accent">{view.serial}</p>
            ) : (
              <p className="mt-2 text-sm text-ink-400">{t.missing}</p>
            )}

            <div className="mt-5 flex gap-3">
              {view.owned && view.qrToken ? (
                <a
                  href={`/p/${view.qrToken}`}
                  className="flex-1 rounded-xl bg-accent py-3 text-sm font-semibold text-ink-950 transition hover:bg-accent-bright"
                >
                  {t.viewPassport}
                </a>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl border border-ink-700 py-3 text-sm font-medium text-ink-200 hover:bg-ink-900"
              >
                {t.dismiss}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
