import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/auth/current';
import { getTranslations, fill } from '@/lib/i18n';
import { RarityChip } from '@/components/RarityChip';
import { Serial } from '@/components/Serial';

/**
 * My Collection.
 *
 * Build step 4 fills this in properly with progress bars per series and
 * milestone recognition. This is the honest minimum: the claim flow has to
 * land somewhere, and a collector who has just claimed their first piece
 * should see it immediately rather than a placeholder.
 *
 * Ownership is read from the ledger, not from a column on the piece.
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
          editionNumber: true,
          product: { select: { character: true, series: true, rarity: true, runSize: true } },
        },
      },
    },
  });

  // A transfer appends a new row, so the same piece can appear more than once.
  // Only the latest row per piece represents current ownership.
  const seen = new Set<string>();
  const pieces = owned.filter((row) => {
    if (seen.has(row.pieceId)) return false;
    seen.add(row.pieceId);
    return true;
  });

  const verifiedCount = pieces.filter((p) => p.piece.verified).length;
  const seriesCount = new Set(pieces.map((p) => p.piece.product.series)).size;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <header className="mb-8">
        <h1 className="font-display text-4xl tracking-wide text-ink-50">{t.nav.collection}</h1>
        <p className="mono mt-1 text-sm text-ink-500">@{user.handle}</p>
      </header>

      {pieces.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink-700 bg-ink-900/40 p-10 text-center">
          <p className="font-display text-2xl tracking-wide text-ink-200">
            {t.passport.unclaimedTitle}
          </p>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-ink-400">
            {t.passport.unclaimedBody}
          </p>
        </div>
      ) : (
        <>
          <div className="mb-8 grid grid-cols-3 gap-3">
            <Stat value={pieces.length} label={t.nav.collection} />
            <Stat value={verifiedCount} label={t.passport.verified} />
            <Stat value={seriesCount} label={t.passport.series} />
          </div>

          <ul className="stagger grid gap-4 sm:grid-cols-2">
            {pieces.map((row, index) => (
              <li key={row.pieceId} style={{ animationDelay: `${Math.min(index, 10) * 45}ms` }}>
                <Link
                  href={`/p/${row.piece.qrToken}`}
                  className="grain relative block overflow-hidden rounded-2xl border border-ink-800 bg-ink-900/60 p-5 transition hover:border-ink-600"
                >
                  <div className="relative flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-display text-2xl leading-tight tracking-wide text-ink-50">
                        {row.piece.product.character}
                      </p>
                      <p className="text-xs uppercase tracking-[0.16em] text-ink-500">
                        {row.piece.product.series}
                      </p>
                    </div>
                    <RarityChip rarity={row.piece.product.rarity} />
                  </div>
                  <Serial value={row.piece.serial} className="relative mt-4 text-xl" />
                  {row.piece.editionNumber !== null ? (
                    <p className="relative mt-1 text-xs text-ink-500">
                      {fill(t.passport.editionPosition, {
                        number: row.piece.editionNumber,
                        total: row.piece.product.runSize,
                      })}
                    </p>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl border border-ink-800 bg-ink-900/50 p-4 text-center">
      <p className="mono text-2xl text-ink-50">{value}</p>
      <p className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-ink-600">{label}</p>
    </div>
  );
}
