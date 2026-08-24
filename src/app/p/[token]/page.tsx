import type { Metadata } from 'next';
import { getPassportByToken, provenanceStatement, ownerCountForToken } from '@/lib/passport';
import { getTranslations, fill } from '@/lib/i18n';
import { getCurrentUser } from '@/lib/auth/current';
import { prisma } from '@/lib/db/client';
import { currentOwnerId } from '@/lib/db/transfer';
import { Serial } from '@/components/Serial';
import { RarityChip } from '@/components/RarityChip';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { Timeline } from '@/components/Timeline';
import { ClaimForm } from '@/components/ClaimForm';
import { PieceArtwork } from '@/components/PieceArtwork';
import { TransferPanel } from '@/components/TransferPanel';
import { HoloCard } from '@/components/ui/HoloCard';
import { Reveal } from '@/components/ui/Reveal';
import { Card, SectionTitle, Field } from '@/components/ui/Card';

/**
 * The public passport page.
 *
 * Server rendered and cacheable, opened by scanning the QR. No auth required:
 * a scan in a shop must work for anyone, instantly. This is the read-heavy
 * surface, and the fact that it is nearly identical between scans is what
 * makes a million pieces cost about what a thousand do.
 *
 * It reads top to bottom as a certificate: what this object is, that it is
 * genuine, where it sits in its edition, then the facts, then its history.
 */
export const revalidate = 60;

type Params = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { token } = await params;
  const passport = await getPassportByToken(token);
  if (!passport) return { title: 'BINKIS ID' };

  const position =
    passport.editionNumber !== null ? ` · ${passport.editionNumber}/${passport.runSize}` : '';

  return {
    title: `${passport.character} ${passport.serial} · BINKIS ID`,
    description: `${passport.character}, ${passport.series}, ${passport.editionLabel}${position}. Verified identity and complete ownership history.`,
    openGraph: {
      title: `${passport.character} ${passport.serial}`,
      description: `${passport.editionLabel} · ${passport.rarity}${position}`,
    },
  };
}

export default async function PassportPage({ params }: Params) {
  const { token } = await params;
  const { t, locale } = await getTranslations();
  const passport = await getPassportByToken(token);

  if (!passport) {
    return (
      <Shell>
        <div className="stagger py-28 text-center">
          <div className="mx-auto flex size-16 items-center justify-center rounded-2xl border border-ink-800 bg-ink-900">
            <svg viewBox="0 0 24 24" className="size-7 text-ink-600" fill="currentColor">
              <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
            </svg>
          </div>
          <h1 className="mt-6 font-display text-3xl tracking-wide text-ink-50">
            {t.passport.notFoundTitle}
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-ink-400">
            {t.passport.notFoundBody}
          </p>
        </div>
      </Shell>
    );
  }

  const user = await getCurrentUser();
  const ownerCount = await ownerCountForToken(passport.qrToken);
  const voided = passport.status === 'VOID';
  const claimable = passport.status === 'UNCLAIMED';

  // Is the signed-in collector the current owner? Only then do they get the
  // transfer panel. Checked against the ledger, not against the rendered page.
  let isOwner = false;
  let pendingTransfer = false;
  if (user?.collectorId && passport.status === 'CLAIMED') {
    const piece = await prisma.piece.findUnique({
      where: { qrToken: passport.qrToken },
      select: { id: true },
    });
    if (piece) {
      isOwner = (await currentOwnerId(prisma, piece.id)) === user.collectorId;
      if (isOwner) {
        pendingTransfer =
          (await prisma.transfer.count({
            where: { pieceId: piece.id, status: 'PENDING' },
          })) > 0;
      }
    }
  }

  return (
    <Shell>
      <article className="space-y-6 py-6 sm:py-10">
        {/* ---- hero: the piece's identity ---------------------------------- */}
        <HoloCard className="rounded-3xl border border-ink-800 bg-gradient-to-b from-ink-900/90 to-ink-925/70 p-6 sm:p-9">
          <div className="tilt-layer relative sm:flex sm:items-start sm:gap-7">
            <PieceArtwork
              characterCode={passport.characterCode}
              character={passport.character}
              rarity={passport.rarity}
              artworkUrl={passport.artworkUrl}
              className="mb-6 aspect-[4/5] w-full sm:mb-0 sm:w-44 sm:shrink-0"
            />

            <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-ink-500">
                  {passport.series} · {passport.editionLabel}
                </p>
                <h1 className="mt-2.5 font-display text-5xl leading-[0.9] tracking-wide text-ink-50 sm:text-6xl">
                  {passport.character}
                </h1>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-2">
                <VerifiedBadge
                  verified={passport.verified}
                  label={passport.verified ? t.passport.verified : t.passport.unverified}
                />
                <RarityChip rarity={passport.rarity} />
              </div>
            </div>

            {/* The serial is the piece's name, so it is the largest thing here
                after the character, and always selectable for comparison
                against the printed hologram. */}
            <Serial value={passport.serial} className="mt-7 text-4xl sm:text-5xl" />

            {passport.editionNumber !== null ? (
              <div className="mt-6 flex items-end gap-3 border-t border-ink-800/70 pt-5">
                <span className="font-display text-4xl leading-none text-ink-50">
                  {passport.editionNumber}
                </span>
                <span className="pb-0.5 text-sm text-ink-500">
                  {fill(t.passport.editionPosition, {
                    number: passport.editionNumber,
                    total: passport.runSize,
                  })}
                </span>
              </div>
            ) : null}
            </div>
          </div>
        </HoloCard>

        {/* ---- state: void, claimable, or owned ---------------------------- */}
        {voided ? (
          <Reveal>
            <Card tone="danger" className="p-6">
              <h2 className="text-lg font-semibold text-ink-50">{t.passport.voidTitle}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-300">{t.passport.voidBody}</p>
            </Card>
          </Reveal>
        ) : claimable ? (
          <Reveal>
            <div className="space-y-6">
              <Card tone="accent" className="p-6 sm:p-7">
                <div className="relative flex items-start gap-4">
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent/15">
                    <svg viewBox="0 0 24 24" className="size-5 text-accent" fill="currentColor">
                      <path d="M12 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 14.4 7.2 16.9l.9-5.4L4.2 7.7l5.4-.8L12 2z" />
                    </svg>
                  </span>
                  <div>
                    <h2 className="font-display text-2xl tracking-wide text-ink-50">
                      {t.passport.unclaimedTitle}
                    </h2>
                    <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink-300">
                      {t.passport.unclaimedBody}
                    </p>
                  </div>
                </div>
              </Card>
              <ClaimForm qrToken={passport.qrToken} signedIn={Boolean(user?.collectorId)} t={t} />
            </div>
          </Reveal>
        ) : passport.owner ? (
          <Reveal>
            <Card tone="verified" className="p-6">
              <div className="relative flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-500">
                    {t.passport.ownedBy}
                  </p>
                  {/* Handle and display name only. Never an email, never a
                      real name. */}
                  <p className="mt-1.5 text-xl font-semibold text-ink-50">
                    {passport.owner.displayName}
                  </p>
                  <p className="mono mt-0.5 text-sm text-ink-500">@{passport.owner.handle}</p>
                </div>
                <span className="flex size-11 items-center justify-center rounded-full border border-verified/30 bg-verified/10 font-display text-lg text-verified">
                  {passport.owner.displayName.slice(0, 1).toUpperCase()}
                </span>
              </div>
            </Card>
          </Reveal>
        ) : null}

        {isOwner ? (
          <Reveal>
            <TransferPanel serial={passport.serial} hasPending={pendingTransfer} t={t} />
          </Reveal>
        ) : null}

        {/* ---- provenance, as a sentence ----------------------------------- */}
        <Reveal>
          <Card className="p-6 sm:p-7">
            <h2 className="relative text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-500">
              {t.passport.provenance}
            </h2>
            <p className="relative mt-3 text-[15px] leading-relaxed text-ink-200">
              {provenanceStatement(passport, ownerCount, locale)}
            </p>
          </Card>
        </Reveal>

        {/* ---- the facts --------------------------------------------------- */}
        <Reveal>
          <Card className="p-6 sm:p-7">
            <dl className="relative grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
              <Field label={t.passport.character} value={passport.character} />
              <Field label={t.passport.series} value={passport.series} />
              <Field label={t.passport.edition} value={passport.editionLabel} />
              <Field label={t.passport.rarity} value={passport.rarity} />
              <Field label={t.passport.year} value={String(passport.productionYear)} />
              <Field label={t.passport.country} value={passport.country} />
              <Field label={t.passport.pieceNumber} value={passport.serial} mono />
              <Field label={t.passport.batch} value={passport.batchCode} mono />
            </dl>
          </Card>
        </Reveal>

        {/* ---- provenance -------------------------------------------------- */}
        <Reveal>
          <div className="pt-2">
            <SectionTitle hint={`${passport.events.length}`}>{t.passport.history}</SectionTitle>
            <Timeline events={passport.events} t={t} locale={locale} />
          </div>
        </Reveal>
      </article>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto w-full max-w-2xl px-4 pb-24 sm:px-6">{children}</main>;
}
