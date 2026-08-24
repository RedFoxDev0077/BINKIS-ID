import { prisma } from '@/lib/db/client';
import { getTranslations } from '@/lib/i18n';
import { Card } from '@/components/ui/Card';
import { ImportPanel } from '@/components/admin/ImportPanel';

/**
 * Batches, and the bulk import.
 *
 * A batch with a checksum is frozen: its serials, tokens and hashes have been
 * exported for printing and are immutable. That state is shown, never offered
 * as editable, because the physical stock already exists.
 */
export default async function AdminBatches() {
  const { t, locale } = await getTranslations();

  const batches = await prisma.batch.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      code: true,
      quantity: true,
      status: true,
      exportedAt: true,
      checksum: true,
      product: { select: { character: true, characterCode: true, editionType: true } },
      _count: { select: { pieces: true } },
    },
  });

  const fmt = new Intl.DateTimeFormat(locale === 'es' ? 'es-MX' : 'en-GB', {
    dateStyle: 'medium',
  });

  return (
    <div className="space-y-8">
      <section>
        {batches.length === 0 ? (
          <Card className="p-10 text-center">
            <p className="relative text-sm text-ink-500">{t.admin.noResults}</p>
          </Card>
        ) : (
          <ul className="space-y-3">
            {batches.map((batch) => (
              <li key={batch.id}>
                <Card className="p-5">
                  <div className="relative flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="mono text-lg text-ink-50">{batch.code}</span>
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-wider ${
                            batch.checksum
                              ? 'border-warn/40 text-warn'
                              : 'border-ink-700 text-ink-400'
                          }`}
                        >
                          {batch.status}
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm text-ink-400">
                        {batch.product.character} · {batch.product.editionType} ·{' '}
                        <span className="mono">
                          {batch._count.pieces} / {batch.quantity}
                        </span>
                      </p>
                      {batch.checksum ? (
                        <p className="mono mt-2 break-all text-[11px] text-ink-600">
                          sha256 {batch.checksum.slice(0, 24)}…
                          {batch.exportedAt ? ` · ${fmt.format(batch.exportedAt)}` : ''}
                        </p>
                      ) : null}
                    </div>

                    {batch.checksum ? (
                      <span className="shrink-0 rounded-lg border border-ink-800 bg-ink-925 px-3 py-1.5 text-[11px] text-ink-500">
                        frozen
                      </span>
                    ) : null}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ImportPanel t={t} />
    </div>
  );
}
