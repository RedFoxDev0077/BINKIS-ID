import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';
import { getTranslations } from '@/lib/i18n';
import { getCurrentUser } from '@/lib/auth/current';
import { getAdminUser } from '@/lib/auth/admin';
import { prisma } from '@/lib/db/client';
import { signOut } from '@/app/actions/auth';
import { LocaleSwitch } from '@/components/LocaleSwitch';

export const metadata: Metadata = {
  title: { default: 'BINKIS ID', template: '%s' },
  description: 'Digital identity registry for physical BINKIS collectible figures.',
};

export const viewport: Viewport = {
  themeColor: '#0b0c10',
  width: 'device-width',
  initialScale: 1,
  // Zoom stays available. A collector reading an 11-character code off foil in
  // bad light may genuinely need to pinch in, and disabling that to make the
  // page feel more "app-like" would be a real accessibility failure.
  maximumScale: 5,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { t, locale } = await getTranslations();
  const [user, admin] = await Promise.all([getCurrentUser(), getAdminUser()]);

  // A transfer waiting on you is the one thing worth a badge in the nav.
  const incoming = user?.collectorId
    ? await prisma.transfer.count({
        where: { toCollectorId: user.collectorId, status: 'PENDING' },
      })
    : 0;

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
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-ink-950"
        >
          Skip to content
        </a>

        <header className="sticky top-0 z-40 border-b border-ink-850/70 bg-ink-950/80 backdrop-blur-xl">
          <nav className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
            <Link href="/" className="press flex items-center gap-2.5">
              <span className="holo-border flex size-8 items-center justify-center rounded-lg">
                <span className="holo-text font-display text-sm leading-none">B</span>
              </span>
              {/* The mark alone below sm. At 360px the wordmark and the
                  collection link cannot both fit, and the collection link is
                  the one people are trying to reach. */}
              <span className="hidden font-display text-lg tracking-[0.18em] text-ink-50 sm:inline">
                {t.brand.name}
              </span>
            </Link>

            <div className="flex items-center gap-1">
              {user ? (
                <>
                  <Link
                    href="/collection"
                    className="press rounded-lg border border-ink-700 px-3 py-2 text-sm font-medium text-ink-100 transition hover:border-accent hover:bg-ink-900"
                  >
                    {t.nav.collection}
                  </Link>
                  {/* Transfers hides on a phone, unless one is waiting: a
                      pending transfer is somebody holding a piece for you. */}
                  <NavLink href="/transfers" badge={incoming} showOnMobile={incoming > 0}>
                    {t.admin.transfers}
                  </NavLink>
                  {admin ? (
                    <NavLink href="/admin" tone="warn">
                      {t.admin.title}
                    </NavLink>
                  ) : null}
                  <form action={signOut}>
                    <button
                      type="submit"
                      aria-label={t.nav.signOut}
                      title={t.nav.signOut}
                      className="press rounded-lg px-2 py-2 text-sm text-ink-500 transition hover:bg-ink-900 hover:text-ink-200 sm:px-3"
                    >
                      <span className="hidden sm:inline">{t.nav.signOut}</span>
                      <svg
                        aria-hidden
                        viewBox="0 0 24 24"
                        className="size-5 sm:hidden"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      >
                        <path d="M15 17l5-5-5-5M20 12H9M12 20H6a2 2 0 01-2-2V6a2 2 0 012-2h6" />
                      </svg>
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <NavLink href="/login">{t.nav.signIn}</NavLink>
                  <Link
                    href="/signup"
                    className="press rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-accent-bright"
                  >
                    {t.nav.signUp}
                  </Link>
                </>
              )}
              <LocaleSwitch current={locale} />
            </div>
          </nav>
        </header>

        <div id="main">{children}</div>
      </body>
    </html>
  );
}

function NavLink({
  href,
  children,
  badge,
  tone,
  showOnMobile = false,
}: {
  href: string;
  children: React.ReactNode;
  badge?: number;
  tone?: 'warn';
  showOnMobile?: boolean;
}) {
  return (
    <Link
      href={href as never}
      className={`press relative ${showOnMobile ? 'block' : 'hidden'} rounded-lg px-3 py-2 text-sm transition hover:bg-ink-900 sm:block ${
        tone === 'warn'
          ? 'text-warn/85 hover:text-warn'
          : 'text-ink-400 hover:text-ink-50'
      }`}
    >
      {children}
      {badge && badge > 0 ? (
        <span className="mono absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-ink-950">
          {badge > 9 ? '9+' : badge}
        </span>
      ) : null}
    </Link>
  );
}
