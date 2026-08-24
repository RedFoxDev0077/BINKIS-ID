import { lookupPiece } from '@/app/actions/lookup';
import type { Dictionary } from '@/lib/i18n';

/**
 * Find a piece by its printed number when the QR will not scan.
 *
 * A plain server action with no client JavaScript: this is the fallback for
 * exactly the situation where things are already going wrong, so it should
 * work with the simplest possible machinery.
 */
export function PieceLookup({ t, notFound }: { t: Dictionary; notFound?: string }) {
  return (
    <form action={lookupPiece} className="mx-auto w-full max-w-md">
      <label
        htmlFor="lookup"
        className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-500"
      >
        {t.lookup.label}
      </label>

      <div className="mt-2.5 flex gap-2">
        <input
          id="lookup"
          name="q"
          required
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder={t.lookup.placeholder}
          className="mono min-h-12 flex-1 rounded-xl border border-ink-700 bg-ink-950/70 px-4 text-center text-base tracking-[0.12em] text-ink-50 outline-none transition placeholder:text-ink-700 focus:border-accent"
        />
        <button
          type="submit"
          className="press inline-flex min-h-12 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-semibold text-ink-950 transition hover:bg-accent-bright"
        >
          {t.lookup.action}
        </button>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-ink-600">{t.lookup.hint}</p>

      {notFound ? (
        <p className="mt-2 text-sm text-danger">
          {t.lookup.notFound} <span className="mono">{notFound}</span>
        </p>
      ) : null}
    </form>
  );
}
