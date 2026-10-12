import Link from 'next/link';
import { characterName } from '@/lib/serial';
import { characterMedia } from '@/lib/characters/media';
import type { SetProgress } from '@/lib/collection-set';
import type { Dictionary } from '@/lib/i18n';
import { fill } from '@/lib/i18n';
import { Card, SectionTitle } from '@/components/ui/Card';
import { SetCelebration } from '@/components/SetCelebration';

/**
 * The eight Classic slots of Series 1.
 *
 * A collection page can only ever show what someone already has, which is the
 * wrong half of the question. The board shows the whole set at once, so the
 * gaps are the point: eight silhouettes that fill in one at a time.
 *
 * The silhouette is the character's own art with the colour taken out of it,
 * not separate artwork. Same file, same pose, so the moment a slot fills, the
 * shape the collector has been looking at turns into the character. Nothing to
 * draw twice and nothing to keep in sync.
 */
export function CollectionBoard({ progress, t }: { progress: SetProgress; t: Dictionary }) {
  return (
    <section className="mb-9">
      <SectionTitle hint={fill(t.set.progress, { owned: progress.owned, total: progress.total })}>
        {t.set.title}
      </SectionTitle>

      <Card className="p-5 sm:p-6">
        <div className="relative">
          <ol className="grid grid-cols-4 gap-3 sm:gap-4">
            {progress.slots.map((slot) => {
              const media = characterMedia(slot.characterCode);
              const name = characterName(slot.characterCode);

              const art = media ? (
                // eslint-disable-next-line @next/next/no-img-element -- served by the proxy
                <img
                  src={media.image}
                  alt={slot.owned ? name : ''}
                  className={
                    slot.owned
                      ? 'h-full w-full object-contain p-2'
                      : // The silhouette: same art, no colour, barely there.
                        'h-full w-full object-contain p-2 brightness-0 invert-[.28] saturate-0'
                  }
                />
              ) : (
                <span className="mono text-sm text-ink-600">{slot.characterCode}</span>
              );

              const tile = (
                <>
                  <span
                    className={`flex aspect-square items-center justify-center rounded-xl border ${
                      slot.owned
                        ? 'border-ink-700 bg-ink-900'
                        : 'border-dashed border-ink-800 bg-ink-950'
                    }`}
                  >
                    {art}
                  </span>
                  {/* The name shows either way. A silhouette with no label
                      is a riddle; a silhouette with a name is a shopping list,
                      and the second one brings people back. */}
                  <span
                    className={`mt-2 block text-balance text-center text-[10px] leading-tight sm:text-[11px] ${
                      slot.owned ? 'text-ink-200' : 'text-ink-600'
                    }`}
                  >
                    {name}
                  </span>
                </>
              );

              return (
                <li key={slot.characterCode}>
                  {slot.owned && slot.serial ? (
                    <Link
                      href={`/collection#${slot.serial}`}
                      className="block rounded-xl outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent"
                      title={`${name} · ${slot.serial}`}
                    >
                      {tile}
                    </Link>
                  ) : (
                    <div title={`${name} — ${t.set.missing}`}>{tile}</div>
                  )}
                </li>
              );
            })}
          </ol>

          {progress.complete ? (
            <SetCelebration
              matchingNumbers={progress.matchingNumbers}
              t={{
                completeTitle: t.set.completeTitle,
                completeBody: t.set.completeBody,
                matchedTitle: t.set.matchedTitle,
                matchedBody: t.set.matchedBody,
                matchedExtra: t.set.matchedExtra,
                celebrate: t.set.celebrate,
                dismiss: t.set.dismiss,
              }}
            />
          ) : null}
        </div>
      </Card>
    </section>
  );
}
