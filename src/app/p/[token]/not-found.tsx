import { getTranslations } from '@/lib/i18n';

/**
 * An unknown QR token.
 *
 * The page used to render this same message inline, which meant a token that
 * does not exist answered HTTP 200. That is a soft 404: it looks right to a
 * person and is wrong to everything else. Crawlers index the page, caches
 * store it as a valid response, and monitoring cannot tell a scan of a
 * counterfeit sticker from a scan of a real one.
 *
 * Living here instead means notFound() sets a real 404 status while the
 * collector still gets the designed page rather than a bare error.
 *
 * It deliberately does not distinguish "never existed" from "voided". That
 * difference is nobody's business but the registry's, and revealing it would
 * turn this page into a way to probe which tokens are real.
 */
export default async function PassportNotFound() {
  const { t } = await getTranslations();

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-24 sm:px-6">
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
    </main>
  );
}
