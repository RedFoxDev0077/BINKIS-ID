import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/auth/current';
import { getTranslations, fill } from '@/lib/i18n';
import { normaliseRarity } from '@/lib/passport';
import { RarityChip } from '@/components/RarityChip';
import { Serial } from '@/components/Serial';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { HoloCard } from '@/components/ui/HoloCard';
import { Reveal } from '@/components/ui/Reveal';
import { CountUp } from '@/components/ui/CountUp';
import { Progress } from '@/components/ui/Progress';
import { Card, SectionTitle } from '@/components/ui/Card';
import { ButtonLink } from '@/components/ui/Button';

/**
 * My Collection.
 *
 * Ownership is read from the ledger, never from a column on the piece, so a
 * transferred piece leaves this page the moment its new owner accepts.
 *
 * The progress bars are the reason a collector comes back. Seeing "14 / 20" on
 * a series is what turns a pile of objects into a set worth completing, so
 * they sit above the grid rather than below it.
 */
export default async function CollectionPage() {
  const user = await getCurrentUser();
  if (!user?.collectorId) redirect('/login?next=/collection');

  const { t } = await getTranslations();

  const owned = await prisma.ownershipEvent.findMany({
    where: { toCollectorId: user.collectorId },
    orderBy: { occurredAt: 'desc' },
    select: {
      pieceId: true,
      occurredAt: true,
      piece: {
        select: {
          serial: true,
          qrToken: true,
          verified: true,
          status: true,
          editionNumber: true,
          product: {
            select: { character: true, series: true, rarity: true, runSize: true },
          },
        },
      },
    },
  });

  // A transfer appends a row, so the same piece can appear more than once.
  // Only the latest row per piece is current ownership, and only if that row
  // is still the newest one in the whole ledger for that piece.
  const seen = new Set<string>();
  const mine = owned.filter((row) => {
    if (seen.has(row.pieceId)) return false;
    seen.add(row.pieceId);
    return true;
  });

  const stillOwned = await prisma.ownershipEvent.findMany({
    where: { pieceId: { in: mine.map((m) => m.pieceId) } },
    orderBy: [{ pieceId: 'asc' }, { seq: 'desc' }],
    distinct: ['pieceId'],
    select: { pieceId: true, toCollectorId: true },
  });
  const currentlyMine = new Set(
    stillOwned.filter((row) => row.toCollectorId === user.collectorId).map((r) => r.pieceId),
  );
  const pieces = mine.filter((row) => currentlyMine.has(row.pieceId));

  const verifiedCount = pieces.filter((p) => p.piece.verified).length;
  const seriesNames = [...new Set(pieces.map((p) => p.piece.product.series))];

  // Progress per series, against the true size of each series in the registry
  // rather than against what the collector already has.
  const seriesTotals = await prisma.product.groupBy({
    by: ['series'],
    where: { series: { in: seriesNames } },
    _sum: { runSize: true },
  });
  const totalFor = new Map(seriesTotals.map((row) => [row.series, row._sum.runSize ?? 0]));

  const bySeries = seriesNames
    .map((series) => {
      const held = pieces.filter((p) => p.piece.product.series === series);
      const best = held
        .map((p) => normaliseRarity(p.piece.product.rarity))
        .sort()
        .at(-1);
      return {
        series,
        owned: held.length,
        total: totalFor.get(series) ?? held.length,
        tone: `rarity-${(best ?? 'Common').toLowerCase()}`,
      };
    })
    .sort((a, b) => b.owned - a.owned);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      {/* Gradient status card. The headline number is the collection size,
          because that is the thing a collector opens this page to see. */}
      <header className="grain relative mb-8 overflow-hidden rounded-3xl border border-ink-800 p-7 sm:p-9"
        style={{
          background:
            'linear-gradient(135deg, oklch(0.30 0.11 250) 0%, oklch(0.22 0.07 275) 45%, oklch(0.17 0.02 265) 100%)',
        }}
      >
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/55">
              {t.nav.collection}
            </p>
            <p className="mono mt-3 text-6xl leading-none text-white">
              <CountUp value={pieces.length} />
            </p>
            <p className="mono mt-2 text-sm text-white/60">@{user.handle}</p>
          </div>

          <dl className="flex gap-7">
            <div>
              <dt className="text-[10px] uppercase tracking-[0.16em] text-white/45">
                {t.passport.verified}
              </dt>
              <dd className="mono mt-1 text-2xl text-white">
                <CountUp value={verifiedCount} />
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-[0.16em] text-white/45">
                {t.passport.series}
              </dt>
              <dd className="mono mt-1 text-2xl text-white">
                <CountUp value={seriesNames.length} />
              </dd>
            </div>
          </dl>
        </div>
      </header>

      {pieces.length === 0 ? (
        /* The empty state is an invitation, not a blank page. */
        <Card className="px-6 py-16 text-center">
          <div className="relative">
            <div className="mx-auto flex size-16 items-center justify-center rounded-2xl border border-dashed border-ink-700 bg-ink-925">
              <svg viewBox="0 0 24 24" className="size-7 text-ink-600" fill="currentColor">
                <path d="M12 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 14.4 7.2 16.9l.9-5.4L4.2 7.7l5.4-.8L12 2z" />
              </svg>
            </div>
            <p className="mt-6 font-display text-2xl tracking-wide text-ink-100">
              {t.passport.unclaimedTitle}
            </p>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-ink-400">
              {t.passport.unclaimedBody}
            </p>
            <div className="mt-7">
              <ButtonLink href="/" size="lg">
                {t.passport.claimAction}
              </ButtonLink>
            </div>
          </div>
        </Card>
      ) : (
        <>
          {bySeries.length > 0 ? (
            <Reveal>
              <Card className="mb-9 p-6">
                <div className="relative space-y-5">
                  {bySeries.map((row) => (
                    <Progress
                      key={row.series}
                      label={row.series}
                      value={row.owned}
                      total={row.total}
                      tone={row.tone}
                    />
                  ))}
                </div>
              </Card>
            </Reveal>
          ) : null}

          <SectionTitle hint={`${pieces.length}`}>{t.nav.collection}</SectionTitle>

          <ul className="grid gap-4 sm:grid-cols-2">
            {pieces.map((row, index) => (
              <li key={row.pieceId}>
                <Reveal delay={Math.min(index, 8) * 50}>
                  <HoloCard
                    as="div"
                    intensity={7}
                    className="h-full rounded-2xl border border-ink-800 bg-gradient-to-b from-ink-900/80 to-ink-925/60"
                  >
                    <Link
                      href={`/p/${row.piece.qrToken}` as never}
                      className="tilt-layer block p-5 focus-visible:outline-none"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-display text-2xl leading-tight tracking-wide text-ink-50">
                            {row.piece.product.character}
                          </p>
                          <p className="text-[11px] uppercase tracking-[0.16em] text-ink-500">
                            {row.piece.product.series}
                          </p>
                        </div>
                        <RarityChip rarity={row.piece.product.rarity} size="sm" />
                      </div>

                      <Serial value={row.piece.serial} className="mt-5 text-xl" />

                      <div className="mt-4 flex items-center justify-between gap-2">
                        {row.piece.editionNumber !== null ? (
                          <span className="text-xs text-ink-500">
                            {fill(t.passport.editionPosition, {
                              number: row.piece.editionNumber,
                              total: row.piece.product.runSize,
                            })}
                          </span>
                        ) : (
                          <span />
                        )}
                        <VerifiedBadge
                          size="sm"
                          verified={row.piece.verified}
                          label={
                            row.piece.verified ? t.passport.verified : t.passport.unverified
                          }
                        />
                      </div>
                    </Link>
                  </HoloCard>
                </Reveal>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
