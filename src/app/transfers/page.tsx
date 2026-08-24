import { redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/auth/current';
import { getTranslations } from '@/lib/i18n';
import { expireStaleTransfers } from '@/lib/db/transfer';
import {
  acceptTransferAction,
  declineTransferAction,
  cancelTransferAction,
} from '@/app/actions/transfer';
import { Button } from '@/components/ui/Button';
import { Card, SectionTitle } from '@/components/ui/Card';
import { Reveal } from '@/components/ui/Reveal';
import { RarityChip } from '@/components/RarityChip';

/**
 * Transfers in flight, both directions.
 *
 * Incoming first: a transfer waiting on you is the only thing here that needs
 * a decision, and burying it under your own outgoing requests would be the
 * wrong order.
 */
export default async function TransfersPage() {
  const user = await getCurrentUser();
  if (!user?.collectorId) redirect('/login?next=/transfers');

  const { t, locale } = await getTranslations();

  // Sweep on read. A transfer that has quietly passed its expiry should not
  // still be presented as actionable.
  await expireStaleTransfers(prisma);

  const select = {
    id: true,
    message: true,
    createdAt: true,
    expiresAt: true,
    toEmail: true,
    piece: {
      select: {
        serial: true,
        qrToken: true,
        editionNumber: true,
        product: { select: { character: true, series: true, rarity: true, runSize: true } },
      },
    },
    fromCollector: { select: { displayName: true, user: { select: { handle: true } } } },
    toCollector: { select: { displayName: true, user: { select: { handle: true } } } },
  } as const;

  const [incoming, outgoing] = await Promise.all([
    prisma.transfer.findMany({
      where: { toCollectorId: user.collectorId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      select,
    }),
    prisma.transfer.findMany({
      where: { fromCollectorId: user.collectorId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      select,
    }),
  ]);

  const dateFmt = new Intl.DateTimeFormat(locale === 'es' ? 'es-MX' : 'en-GB', {
    day: 'numeric',
    month: 'short',
  });

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <header className="mb-9">
        <h1 className="font-display text-4xl tracking-wide text-ink-50">{t.admin.transfers}</h1>
        <p className="mt-1.5 text-sm text-ink-500">{t.transfer.subtitle}</p>
      </header>

      {incoming.length === 0 && outgoing.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="relative text-sm text-ink-500">{t.transfer.none}</p>
        </Card>
      ) : null}

      {incoming.length > 0 ? (
        <section className="mb-10">
          <SectionTitle hint={`${incoming.length}`}>{t.transfer.incoming}</SectionTitle>
          <ul className="space-y-3">
            {incoming.map((transfer, i) => (
              <li key={transfer.id}>
                <Reveal delay={i * 55}>
                  <Card tone="accent" className="p-5">
                    <div className="relative">
                      <PieceLine transfer={transfer} />
                      <p className="mt-3 text-sm text-ink-400">
                        {t.transfer.from}{' '}
                        <span className="font-semibold text-ink-100">
                          {transfer.fromCollector.displayName}
                        </span>{' '}
                        <span className="mono text-ink-600">
                          @{transfer.fromCollector.user.handle}
                        </span>
                      </p>
                      {transfer.message ? (
                        <p className="mt-2 border-l-2 border-ink-700 pl-3 text-sm italic text-ink-400">
                          {transfer.message}
                        </p>
                      ) : null}

                      <div className="mt-4 flex flex-wrap gap-2">
                        <form action={acceptTransferAction}>
                          <input type="hidden" name="transferId" value={transfer.id} />
                          <Button type="submit">{t.transfer.accept}</Button>
                        </form>
                        <form action={declineTransferAction}>
                          <input type="hidden" name="transferId" value={transfer.id} />
                          <Button type="submit" variant="ghost">
                            {t.transfer.decline}
                          </Button>
                        </form>
                        <span className="ml-auto self-center text-xs text-ink-600">
                          {t.transfer.expires} {dateFmt.format(transfer.expiresAt)}
                        </span>
                      </div>
                    </div>
                  </Card>
                </Reveal>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {outgoing.length > 0 ? (
        <section>
          <SectionTitle hint={`${outgoing.length}`}>{t.transfer.outgoing}</SectionTitle>
          <ul className="space-y-3">
            {outgoing.map((transfer, i) => (
              <li key={transfer.id}>
                <Reveal delay={i * 55}>
                  <Card className="p-5">
                    <div className="relative">
                      <PieceLine transfer={transfer} />
                      <p className="mt-3 text-sm text-ink-400">
                        {t.transfer.to}{' '}
                        <span className="font-semibold text-ink-100">
                          {transfer.toCollector
                            ? transfer.toCollector.displayName
                            : transfer.toEmail}
                        </span>
                        {!transfer.toCollector ? (
                          <span className="ml-2 rounded-full bg-ink-850 px-2 py-0.5 text-[10px] uppercase tracking-wider text-ink-500">
                            {t.transfer.expires} {dateFmt.format(transfer.expiresAt)}
                          </span>
                        ) : null}
                      </p>

                      <form action={cancelTransferAction} className="mt-4">
                        <input type="hidden" name="transferId" value={transfer.id} />
                        <Button type="submit" variant="ghost" size="sm">
                          {t.transfer.cancel}
                        </Button>
                      </form>
                    </div>
                  </Card>
                </Reveal>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}

function PieceLine({
  transfer,
}: {
  transfer: {
    piece: {
      serial: string;
      qrToken: string;
      editionNumber: number | null;
      product: { character: string; series: string; rarity: string; runSize: number };
    };
  };
}) {
  const { piece } = transfer;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Link href={`/p/${piece.qrToken}` as never} className="group min-w-0">
        <p className="font-display text-2xl leading-tight tracking-wide text-ink-50 transition group-hover:text-white">
          {piece.product.character}
        </p>
        <p className="mono text-sm text-ink-400">
          {piece.serial}
          {piece.editionNumber !== null ? (
            <span className="text-ink-600">
              {' '}
              · {piece.editionNumber}/{piece.product.runSize}
            </span>
          ) : null}
        </p>
      </Link>
      <RarityChip rarity={piece.product.rarity} size="sm" />
    </div>
  );
}
