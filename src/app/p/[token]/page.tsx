import type { Metadata } from 'next';
import { getPassportByToken } from '@/lib/passport';
import { getTranslations, fill } from '@/lib/i18n';
import { getCurrentUser } from '@/lib/auth/current';
import { Serial } from '@/components/Serial';
import { RarityChip } from '@/components/RarityChip';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { Timeline } from '@/components/Timeline';
import { ClaimForm } from '@/components/ClaimForm';

/**
 * The public passport page.
 *
 * Server rendered and cacheable, opened by scanning the QR. No auth required:
 * a scan in a shop must work for anyone, instantly. This is the read-heavy
 * surface, and the fact that it is nearly static between scans is what makes
 * a million pieces cost about what a thousand do.
 */
export const revalidate = 60;

type Params = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { token } = await params;
  const passport = await getPassportByToken(token);
  if (!passport) return { title: 'BINKIS ID' };

  return {
    title: `${passport.character} ${passport.serial} · BINKIS ID`,
    description: `${passport.character}, ${passport.series}, ${passport.editionLabel}. Verified identity and ownership history.`,
    openGraph: {
      title: `${passport.character} ${passport.serial}`,
      description: `${passport.editionLabel} · ${passport.rarity}`,
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
        <div className="py-24 text-center">
          <h1 className="font-display text-3xl tracking-wide text-ink-50">
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
  const voided = passport.status === 'VOID';
  const claimable = passport.status === 'UNCLAIMED';

  return (
    <Shell>
      <article className="stagger space-y-8 py-8">
        {/* Hero. The serial is the piece's name, so it is set large. */}
        <header className="grain relative overflow-hidden rounded-2xl border border-ink-800 bg-ink-900/70 p-6 sm:p-8">
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ink-500">
                {passport.series} · {passport.editionLabel}
              </p>
              <h1 className="mt-2 font-display text-4xl leading-none tracking-wide text-ink-50 sm:text-5xl">
                {passport.character}
              </h1>
              <Serial value={passport.serial} className="mt-4 text-3xl sm:text-4xl" />
            </div>

            <div className="flex shrink-0 flex-col items-end gap-2">
              <VerifiedBadge
                verified={passport.verified}
                label={passport.verified ? t.passport.verified : t.passport.unverified}
              />
              <RarityChip rarity={passport.rarity} />
            </div>
          </div>

          {passport.editionNumber !== null ? (
            <p className="relative mt-6 font-display text-2xl tracking-wide text-ink-300">
              {fill(t.passport.editionPosition, {
                number: passport.editionNumber,
                total: passport.runSize,
              })}
            </p>
          ) : null}
        </header>

        {voided ? (
          <section className="rounded-2xl border border-[--color-danger]/40 bg-[--color-danger]/8 p-6">
            <h2 className="text-lg font-semibold text-ink-50">{t.passport.voidTitle}</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-300">{t.passport.voidBody}</p>
          </section>
        ) : claimable ? (
          <section className="space-y-6">
            <div className="rounded-2xl border border-[--color-accent]/25 bg-[--color-accent]/6 p-6">
              <h2 className="font-display text-2xl tracking-wide text-ink-50">
                {t.passport.unclaimedTitle}
              </h2>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink-300">
                {t.passport.unclaimedBody}
              </p>
            </div>
            <ClaimForm qrToken={passport.qrToken} signedIn={Boolean(user?.collectorId)} t={t} />
          </section>
        ) : passport.owner ? (
          <section className="rounded-2xl border border-ink-800 bg-ink-900/50 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-500">
              {t.passport.ownedBy}
            </p>
            {/* Handle only. Never an email, never a real name. */}
            <p className="mt-2 text-xl font-semibold text-ink-50">
              {passport.owner.displayName}
            </p>
            <p className="mono mt-0.5 text-sm text-ink-500">@{passport.owner.handle}</p>
          </section>
        ) : null}

        <section className="rounded-2xl border border-ink-800 bg-ink-900/50 p-6">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
            <Field label={t.passport.character} value={passport.character} />
            <Field label={t.passport.series} value={passport.series} />
            <Field label={t.passport.edition} value={passport.editionLabel} />
            <Field label={t.passport.rarity} value={passport.rarity} />
            <Field label={t.passport.year} value={String(passport.productionYear)} />
            <Field label={t.passport.country} value={passport.country} />
            <Field label={t.passport.pieceNumber} value={passport.serial} mono />
            <Field label={t.passport.batch} value={passport.batchCode} mono />
          </dl>
        </section>

        <section>
          <h2 className="mb-5 font-display text-2xl tracking-wide text-ink-50">
            {t.passport.history}
          </h2>
          <Timeline events={passport.events} t={t} locale={locale} />
        </section>
      </article>
    </Shell>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-600">
        {label}
      </dt>
      <dd className={`mt-1 text-sm text-ink-100 ${mono ? 'mono' : ''}`}>{value}</dd>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto w-full max-w-2xl px-4 pb-20 sm:px-6">{children}</main>;
}
