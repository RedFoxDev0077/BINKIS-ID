import { getTranslations } from '@/lib/i18n';
import { getCurrentUser } from '@/lib/auth/current';
import { ButtonLink } from '@/components/ui/Button';
import { Reveal } from '@/components/ui/Reveal';
import { HoloCard } from '@/components/ui/HoloCard';

export default async function Home() {
  const { t } = await getTranslations();
  const user = await getCurrentUser();

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 sm:px-6">
      <section className="stagger py-20 text-center sm:py-28">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-ink-500">
          {t.brand.name}
        </p>
        <h1 className="mt-5 font-display text-6xl leading-[0.88] tracking-wide text-ink-50 sm:text-8xl">
          <span className="holo-text">BINKIS</span> ID
        </h1>
        <p className="mx-auto mt-6 max-w-md text-base leading-relaxed text-ink-400">
          {t.brand.tagline}
        </p>

        <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
          {user ? (
            <ButtonLink href="/collection" size="lg">
              {t.nav.collection}
            </ButtonLink>
          ) : (
            <>
              <ButtonLink href="/signup" size="lg">
                {t.nav.signUp}
              </ButtonLink>
              <ButtonLink href="/login" size="lg" variant="secondary">
                {t.nav.signIn}
              </ButtonLink>
            </>
          )}
        </div>
      </section>

      <Reveal>
        <HoloCard className="rounded-3xl border border-ink-800 bg-gradient-to-b from-ink-900/80 to-ink-925/60 p-8 sm:p-10">
          <div className="tilt-layer relative text-center">
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="mx-auto size-9 text-ink-600"
              fill="currentColor"
            >
              <path d="M3 3h8v8H3V3zm2 2v4h4V5H5zm8-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm14-2h2v2h-2v-2zm-6 0h4v2h-4v-2zm4 4h4v4h-4v-4zm-4 0h2v4h-2v-4z" />
            </svg>
            <p className="mt-5 text-sm leading-relaxed text-ink-400">
              {t.passport.unclaimedBody}
            </p>
            <p className="mono mt-4 text-xs text-ink-600">id.binkis.com/p/••••••••••••</p>
          </div>
        </HoloCard>
      </Reveal>
    </main>
  );
}
