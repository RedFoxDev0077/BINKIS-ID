import { prisma } from '@/lib/db/client';
import { getTranslations } from '@/lib/i18n';
import { Card } from '@/components/ui/Card';

/**
 * The audit trail, newest first.
 *
 * Append only and read only. There is deliberately no delete, and no filter by
 * actor that would let an admin quietly narrow the view to exclude their own
 * actions. The point of the log is that it records everyone equally.
 */
export default async function AdminAudit() {
  const { t, locale } = await getTranslations();

  const entries = await prisma.auditLog.findMany({
    orderBy: { at: 'desc' },
    take: 100,
    select: { id: true, actor: true, action: true, entity: true, at: true },
  });

  const fmt = new Intl.DateTimeFormat(locale === 'es' ? 'es-MX' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const TONE: Record<string, string> = {
    CLAIM: 'text-[--color-verified]',
    CLAIM_FAILED: 'text-ink-500',
    TRANSFER_ACCEPTED: 'text-[--color-accent]',
    PIECE_VOIDED: 'text-[--color-danger]',
    PIECE_VERIFIED: 'text-[--color-verified]',
    PIECE_UNVERIFIED: 'text-[--color-warn]',
    PIECE_IMPORTED: 'text-ink-300',
    USER_ROLE_CHANGED: 'text-[--color-warn]',
    BATCH_EXPORTED: 'text-[--color-warn]',
  };

  if (entries.length === 0) {
    return (
      <Card className="p-10 text-center">
        <p className="relative text-sm text-ink-500">{t.admin.noResults}</p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <ul className="relative divide-y divide-ink-850">
        {entries.map((entry) => (
          <li key={entry.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-3.5">
            <span
              className={`mono text-xs font-semibold uppercase tracking-wider ${
                TONE[entry.action] ?? 'text-ink-400'
              }`}
            >
              {entry.action}
            </span>
            <span className="mono text-sm text-ink-200">{entry.entity}</span>
            <span className="text-xs text-ink-500">@{entry.actor}</span>
            <time dateTime={entry.at.toISOString()} className="ml-auto text-xs text-ink-600">
              {fmt.format(entry.at)}
            </time>
          </li>
        ))}
      </ul>
    </Card>
  );
}
