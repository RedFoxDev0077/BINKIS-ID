import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAdminUser } from '@/lib/auth/admin';
import { getTranslations } from '@/lib/i18n';

/**
 * Every admin route passes through here, and the role is re-checked on each
 * request. A layout guard is convenience, not security: each action in
 * actions/admin.ts calls requireAdmin() again on its own.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getAdminUser();
  if (!admin) redirect('/');

  const { t } = await getTranslations();

  const tabs = [
    { href: '/admin', label: t.admin.overview },
    { href: '/admin/pieces', label: t.admin.pieces },
    { href: '/admin/batches', label: t.admin.batches },
    { href: '/admin/audit', label: t.admin.audit },
  ] as const;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-3xl tracking-wide text-ink-50">{t.admin.title}</h1>
          <span className="mono rounded-full border border-[--color-warn]/35 bg-[--color-warn]/10 px-3 py-1 text-xs text-[--color-warn]">
            @{admin.handle}
          </span>
        </div>

        <nav className="mt-5 flex gap-1 overflow-x-auto border-b border-ink-850 pb-px">
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href as never}
              className="whitespace-nowrap rounded-t-lg px-4 py-2.5 text-sm text-ink-400 transition hover:bg-ink-900 hover:text-ink-50"
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </header>
      {children}
    </div>
  );
}
