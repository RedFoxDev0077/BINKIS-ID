import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';
import { getTranslations } from '@/lib/i18n';
import { getCurrentUser } from '@/lib/auth/current';
import { signOut } from '@/app/actions/auth';

export const metadata: Metadata = {
  title: 'BINKIS ID',
  description: 'Digital identity registry for physical BINKIS collectible figures.',
};

export const viewport: Viewport = {
  themeColor: '#0b0c10',
  // Nearly every scan is a phone. Zoom stays available: a collector reading an
  // 11-character code off foil in bad light may genuinely need to pinch in.
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { t, locale } = await getTranslations();
  const user = await getCurrentUser();

  return (
    <html lang={locale}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <header className="sticky top-0 z-40 border-b border-ink-850/80 bg-ink-950/85 backdrop-blur-md">
          <nav className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between gap-4 px-4 sm:px-6">
            <Link
              href="/"
              className="font-display text-xl tracking-[0.18em] text-ink-50 transition hover:text-white"
            >
              {t.brand.name}
            </Link>

            <div className="flex items-center gap-1">
              {user ? (
                <>
                  <Link
                    href="/collection"
                    className="rounded-lg px-3 py-2 text-sm text-ink-300 transition hover:bg-ink-900 hover:text-ink-50"
                  >
                    {t.nav.collection}
                  </Link>
                  <form action={signOut}>
                    <button
                      type="submit"
                      className="rounded-lg px-3 py-2 text-sm text-ink-500 transition hover:bg-ink-900 hover:text-ink-200"
                    >
                      {t.nav.signOut}
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="rounded-lg px-3 py-2 text-sm text-ink-300 transition hover:bg-ink-900 hover:text-ink-50"
                  >
                    {t.nav.signIn}
                  </Link>
                  <Link
                    href="/signup"
                    className="rounded-lg bg-[--color-accent] px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-[--color-accent-bright]"
                  >
                    {t.nav.signUp}
                  </Link>
                </>
              )}
            </div>
          </nav>
        </header>

        {children}
      </body>
    </html>
  );
}
