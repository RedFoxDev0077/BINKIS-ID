import { prisma } from '@/lib/db/client';
import { getTranslations } from '@/lib/i18n';
import { Card } from '@/components/ui/Card';
import { CountUp } from '@/components/ui/CountUp';
import { Reveal } from '@/components/ui/Reveal';

export default async function AdminOverview() {
  const { t } = await getTranslations();

  const [total, claimed, unclaimed, voided, collectors, pendingTransfers, failedClaims, batches] =
    await Promise.all([
      prisma.piece.count(),
      prisma.piece.count({ where: { status: 'CLAIMED' } }),
      prisma.piece.count({ where: { status: 'UNCLAIMED' } }),
      prisma.piece.count({ where: { status: 'VOID' } }),
      prisma.collectorId.count(),
      prisma.transfer.count({ where: { status: 'PENDING' } }),
      prisma.claimAttempt.count({ where: { succeeded: false } }),
      prisma.batch.count(),
    ]);

  const stats = [
    { label: t.admin.totalPieces, value: total, tone: 'text-ink-50' },
    { label: t.admin.claimedPieces, value: claimed, tone: 'text-[--color-verified]' },
    { label: t.admin.unclaimedPieces, value: unclaimed, tone: 'text-[--color-accent]' },
    { label: t.admin.voidPieces, value: voided, tone: 'text-[--color-danger]' },
    { label: t.admin.users, value: collectors, tone: 'text-ink-50' },
    { label: t.admin.transfers, value: pendingTransfers, tone: 'text-[--color-warn]' },
    { label: t.admin.claims, value: failedClaims, tone: 'text-ink-400' },
    { label: t.admin.batches, value: batches, tone: 'text-ink-50' },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((stat, i) => (
        <Reveal key={stat.label} delay={i * 40}>
          <Card className="p-5">
            <p className={`mono relative text-3xl leading-none ${stat.tone}`}>
              <CountUp value={stat.value} />
            </p>
            <p className="relative mt-2 text-[10px] uppercase tracking-[0.14em] text-ink-600">
              {stat.label}
            </p>
          </Card>
        </Reveal>
      ))}
    </div>
  );
}
