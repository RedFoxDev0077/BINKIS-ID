import { getTranslations } from '@/lib/i18n';
import { getCurrentUser } from '@/lib/auth/current';
import { ButtonLink } from '@/components/ui/Button';
import { Reveal } from '@/components/ui/Reveal';
import { Hero } from '@/components/ui/Hero';
import { PieceLookup } from '@/components/PieceLookup';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ notfound?: string }>;
}) {
  const { t } = await getTranslations();
  const user = await getCurrentUser();
  const { notfound } = await searchParams;

  return (
    <main>
      <Hero
        eyebrow={t.brand.name}
        title="BINKIS"
        accent="ID"
        subtitle={t.brand.tagline}
      >
        <div className="flex flex-col justify-center gap-3 sm:flex-row">
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
      </Hero>

      <div className="mx-auto w-full max-w-3xl px-4 pb-24 sm:px-6">
        {/* Scan is the primary path. This is the fallback for when the camera
            will not read the QR off reflective foil, which is common enough to
            deserve a place on the front page rather than a help article. */}
        <Reveal>
          <div className="-mt-8 rounded-2xl border border-ink-800 bg-ink-900/70 p-6 backdrop-blur-sm sm:p-7">
            <PieceLookup t={t} notFound={notfound} />
          </div>
        </Reveal>

        <div className="mt-14 grid gap-4 sm:grid-cols-3">
          {[
            {
              title: t.home.identityTitle,
              body: t.home.identityBody,
              icon: 'M12 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 14.4 7.2 16.9l.9-5.4L4.2 7.7l5.4-.8L12 2z',
            },
            {
              title: t.home.proofTitle,
              body: t.home.proofBody,
              icon: 'M12 1l9 4v6c0 5-3.8 9.7-9 11-5.2-1.3-9-6-9-11V5l9-4zm-1 14l6-6-1.4-1.4L11 12.2 8.4 9.6 7 11l4 4z',
            },
            {
              title: t.home.historyTitle,
              body: t.home.historyBody,
              icon: 'M4 9h12l-3.3-3.3L14.1 4.3 19.8 10l-5.7 5.7-1.4-1.4L16 11H4V9z',
            },
          ].map((card, i) => (
            <Reveal key={card.title} delay={i * 70}>
              {/* Left accent border and a leading icon: the card reads as a
                  labelled fact rather than a paragraph in a box. */}
              <div className="lift grain relative h-full overflow-hidden rounded-2xl border border-ink-800 border-l-2 border-l-accent/70 bg-ink-900/55 p-6">
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  className="relative size-6 text-accent"
                  fill="currentColor"
                >
                  <path d={card.icon} />
                </svg>
                <h2 className="relative mt-4 font-display text-xl leading-tight tracking-wide text-ink-50">
                  {card.title}
                </h2>
                <p className="relative mt-2 text-sm leading-relaxed text-ink-400">{card.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </main>
  );
}
