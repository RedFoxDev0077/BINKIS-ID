'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

/**
 * Language toggle.
 *
 * Writes a cookie and refreshes, rather than navigating to a locale-prefixed
 * URL. The passport address is printed inside 137,000 holograms and cannot
 * carry a /es/ segment, so locale lives in a cookie for the whole site rather
 * than only for the pages where a prefix would have been harmless.
 */
export function LocaleSwitch({ current }: { current: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const next = current === 'es' ? 'en' : 'es';

  return (
    <button
      type="button"
      disabled={pending}
      aria-label={`Switch to ${next === 'es' ? 'Español' : 'English'}`}
      onClick={() => {
        document.cookie = `binkis_locale=${next}; path=/; max-age=31536000; samesite=lax`;
        startTransition(() => router.refresh());
      }}
      className="press mono ml-1 rounded-lg border border-ink-800 px-2.5 py-1.5 text-[11px] uppercase tracking-wider text-ink-400 transition hover:border-ink-700 hover:text-ink-100 disabled:opacity-50"
    >
      {next}
    </button>
  );
}
