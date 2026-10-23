import Link from 'next/link';
import { printedSerial } from '@/lib/serial';
import { NICHES, STAGE, VITRINA_BASE, type Box } from '@/lib/characters/vitrina';
import type { SetProgress } from '@/lib/collection-set';
import type { Dictionary } from '@/lib/i18n';
import { fill } from '@/lib/i18n';
import { Card, SectionTitle } from '@/components/ui/Card';
import { SetCelebration } from '@/components/SetCelebration';
import { VitrinaStage } from '@/components/VitrinaStage';

/**
 * The eight Classic slots of Series 1, as the display case.
 *
 * A collection page can only show what someone already has, which is the
 * wrong half of the question. The case shows the whole set at once, so the
 * gaps are the point: eight dark niches that light up one at a time.
 *
 * Rendered on the server, fully. The lit state is known from the ledger, so
 * there is nothing to decide in the browser and nothing to wait for: the case
 * arrives in its finished state, and a collector with JavaScript off sees the
 * same thing as everyone else, minus the moment a niche switches on.
 *
 * Only the silhouettes are fetched for niches nobody owns yet. The lit niche,
 * its plate and its figure are not rendered at all, which is most of the
 * weight of a case that is mostly empty, and every case starts out empty.
 */
export function Vitrina({ progress, t }: { progress: SetProgress; t: Dictionary }) {
  const owned = new Map(progress.slots.filter((s) => s.owned).map((s) => [s.characterCode, s]));

  return (
    <section className="mb-9">
      <SectionTitle hint={fill(t.set.progress, { owned: progress.owned, total: progress.total })}>
        {t.set.title}
      </SectionTitle>

      <Card className="p-4 sm:p-6">
        <div className="relative">
          {/* The case is a tall 9:16. On a wide screen it would otherwise run
              the full width of the card and push everything else off the
              page, so it is capped and centred. */}
          <div className="mx-auto w-full max-w-[22rem]">
            <VitrinaStage
              owned={[...owned.keys()]}
              label={caseLabel(progress, t)}
              t={{
                missing: t.set.missing,
                viewPassport: t.set.viewPassport,
                dismiss: t.set.dismiss,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- served by the proxy */}
              <img className="vt-fondo" src={`${VITRINA_BASE}/fondo.webp`} alt="" />

              {NICHES.map((niche) => {
                const held = owned.get(niche.characterCode) ?? null;
                const serial = held?.serial ?? null;
                const isOwned = held !== null;

                return (
                  <div
                    key={niche.key}
                    className="vt-slot"
                    data-key={niche.key}
                    data-owned={isOwned ? '1' : '0'}
                    style={{ '--vt-color': niche.color } as React.CSSProperties}
                  >
                    {isOwned ? (
                      <>
                        <Layer cls="vt-espacio" file={`espacio-${niche.key}.webp`} box={niche.espacio} />
                        <Layer cls="vt-placa" file={`placa-${niche.key}.webp`} box={niche.placa} />
                      </>
                    ) : null}

                    {/* The silhouette loads either way: it is what the empty
                        niche shows, and it is what the reveal fades out of. */}
                    <Layer cls="vt-silueta" file={`silueta-${niche.key}.webp`} box={niche.silueta} />

                    {isOwned ? (
                      <Layer cls="vt-pieza" file={`pieza-${niche.key}.webp`} box={niche.pieza} />
                    ) : null}

                    {/* The brass plates are painted into the case, so their
                        names are pixels. This is where the names actually
                        exist for a screen reader, and where a niche you own
                        becomes a way into the piece. */}
                    {isOwned && serial && held?.qrToken ? (
                      // A real link, not a button: without JavaScript this
                      // still reaches the passport. The case intercepts the
                      // click and opens the figure in place instead.
                      <Link
                        href={`/p/${held.qrToken}` as never}
                        className="vt-hit"
                        style={boxStyle(niche.espacio)}
                        title={`${niche.name} · ${printedSerial(serial)}`}
                        data-niche={niche.characterCode}
                        data-printed={printedSerial(serial)}
                        data-token={held.qrToken}
                        data-held="1"
                      >
                        <span className="sr-only">
                          {niche.name} · {printedSerial(serial)}
                        </span>
                      </Link>
                    ) : (
                      <button
                        type="button"
                        className="vt-hit"
                        style={boxStyle(niche.espacio)}
                        title={`${niche.name} — ${t.set.missing}`}
                        data-niche={niche.characterCode}
                        data-held="0"
                      >
                        <span className="sr-only">
                          {niche.name} — {t.set.missing}
                        </span>
                      </button>
                    )}
                  </div>
                );
              })}
            </VitrinaStage>
          </div>

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

function Layer({ cls, file, box }: { cls: string; file: string; box: Box }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- served by the proxy
    <img className={cls} src={`${VITRINA_BASE}/${file}`} alt="" decoding="async" style={boxStyle(box)} />
  );
}

/** A box of the render, as per cent of the case: it scales with the page. */
function boxStyle(box: Box): React.CSSProperties {
  return {
    left: `${(box.x / STAGE.w) * 100}%`,
    top: `${(box.y / STAGE.h) * 100}%`,
    width: `${(box.w / STAGE.w) * 100}%`,
    height: `${(box.h / STAGE.h) * 100}%`,
  };
}

/** What the case says when it is read aloud rather than looked at. */
function caseLabel(progress: SetProgress, t: Dictionary): string {
  return `${t.set.title} — ${fill(t.set.progress, {
    owned: progress.owned,
    total: progress.total,
  })}`;
}
