import Link from 'next/link';
import { prisma } from '@/lib/db/client';
import { getTranslations } from '@/lib/i18n';
import { voidPiece, setVerified } from '@/app/actions/admin';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { RarityChip } from '@/components/RarityChip';

/**
 * Piece search, and the two manual controls: verification and voiding.
 *
 * Search covers serial, QR token and owner handle, because those are the three
 * things support is ever handed. Results are capped at 40: an unbounded query
 * over 134,399 rows behind a text box is how an admin page takes a site down.
 */
export default async function AdminPieces({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { t } = await getTranslations();
  const { q } = await searchParams;
  const query = (q ?? '').trim();

  const pieces = query
    ? await prisma.piece.findMany({
        where: {
          OR: [
            { serial: { contains: query.toUpperCase() } },
            { qrToken: { contains: query.toUpperCase() } },
            {
              ownershipEvents: {
                some: { toCollector: { user: { handle: { contains: query.toLowerCase() } } } },
              },
            },
          ],
        },
        take: 40,
        orderBy: { serial: 'asc' },
        select: {
          serial: true,
          qrToken: true,
          status: true,
          verified: true,
          editionNumber: true,
          product: { select: { character: true, rarity: true, runSize: true } },
          batch: { select: { code: true } },
          ownershipEvents: {
            orderBy: { seq: 'desc' },
            take: 1,
            select: { toCollector: { select: { user: { select: { handle: true } } } } },
          },
        },
      })
    : [];

  return (
    <div className="space-y-5">
      <form method="get" className="flex gap-2">
        <input
          name="q"
          defaultValue={query}
          placeholder={t.admin.search}
          autoComplete="off"
          spellCheck={false}
          className="mono min-h-11 flex-1 rounded-xl border border-ink-700 bg-ink-950/60 px-4 text-sm text-ink-50 outline-none transition focus:border-[--color-accent]"
        />
        <Button type="submit" variant="secondary">
          {t.admin.search}
        </Button>
      </form>

      <div className="flex flex-wrap gap-2">
        <a
          href="/api/admin/export?format=csv"
          className="press inline-flex min-h-9 items-center rounded-lg border border-ink-700 px-3.5 text-sm text-ink-200 hover:border-ink-600"
        >
          {t.admin.exportCsv}
        </a>
        <a
          href="/api/admin/export?format=xlsx"
          className="press inline-flex min-h-9 items-center rounded-lg border border-ink-700 px-3.5 text-sm text-ink-200 hover:border-ink-600"
        >
          {t.admin.exportXlsx}
        </a>
      </div>

      {query && pieces.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="relative text-sm text-ink-500">{t.admin.noResults}</p>
        </Card>
      ) : null}

      <ul className="space-y-3">
        {pieces.map((piece) => {
          const owner = piece.ownershipEvents[0]?.toCollector.user.handle;
          return (
            <li key={piece.serial}>
              <Card className="p-5">
                <div className="relative flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/p/${piece.qrToken}` as never}
                        className="mono text-lg text-ink-50 hover:text-white"
                      >
                        {piece.serial}
                      </Link>
                      <RarityChip rarity={piece.product.rarity} size="sm" />
                      <StatusPill status={piece.status} />
                      {piece.verified ? (
                        <span className="rounded-full border border-[--color-verified]/40 bg-[--color-verified]/10 px-2.5 py-0.5 text-[10px] uppercase tracking-wider text-[--color-verified]">
                          {t.passport.verified}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1.5 text-sm text-ink-400">
                      {piece.product.character}
                      {piece.editionNumber !== null
                        ? ` · ${piece.editionNumber}/${piece.product.runSize}`
                        : ''}
                      {' · '}
                      <span className="mono text-ink-600">{piece.batch.code}</span>
                      {owner ? <span className="mono text-ink-600"> · @{owner}</span> : null}
                    </p>
                  </div>

                  {piece.status !== 'VOID' ? (
                    <div className="flex flex-wrap gap-2">
                      <form action={setVerified}>
                        <input type="hidden" name="serial" value={piece.serial} />
                        <input
                          type="hidden"
                          name="verified"
                          value={piece.verified ? 'false' : 'true'}
                        />
                        <Button type="submit" variant="secondary" size="sm">
                          {piece.verified ? t.admin.unverify : t.admin.verify}
                        </Button>
                      </form>
                      <form action={voidPiece}>
                        <input type="hidden" name="serial" value={piece.serial} />
                        <Button type="submit" variant="danger" size="sm">
                          {t.admin.void}
                        </Button>
                      </form>
                    </div>
                  ) : null}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const TONE: Record<string, string> = {
    CLAIMED: 'border-[--color-verified]/40 text-[--color-verified]',
    UNCLAIMED: 'border-[--color-accent]/40 text-[--color-accent]',
    VOID: 'border-[--color-danger]/45 text-[--color-danger]',
    RESERVED: 'border-ink-700 text-ink-400',
  };
  return (
    <span
      className={`rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-wider ${
        TONE[status] ?? TONE.RESERVED
      }`}
    >
      {status}
    </span>
  );
}
