import Link from 'next/link';
import { getTranslations } from '@/lib/i18n';

export default async function Home() {
  const { t } = await getTranslations();

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-24 text-center sm:px-6">
      <h1 className="font-display text-6xl leading-none tracking-wide text-ink-50 sm:text-7xl">
        {t.brand.name}
      </h1>
      <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-ink-400">
        {t.brand.tagline}
      </p>
      <p className="mx-auto mt-10 max-w-sm text-sm leading-relaxed text-ink-600">
        Scan the QR on your hologram to open the passport for that piece.
      </p>
      <Link
        href="/signup"
        className="mt-8 inline-block rounded-xl bg-[--color-accent] px-7 py-3.5 text-sm font-semibold text-ink-950 transition hover:bg-[--color-accent-bright]"
      >
        {t.nav.signUp}
      </Link>
    </main>
  );
}
