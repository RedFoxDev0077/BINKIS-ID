'use client';

import { useActionState } from 'react';
import { runImportAction, type ImportState } from '@/app/actions/import';
import { Button } from '../ui/Button';
import { Card, SectionTitle } from '../ui/Card';
import type { Dictionary } from '@/lib/i18n';

const INITIAL: ImportState = { status: 'idle' };

/**
 * Bulk import, dry run first.
 *
 * The preview is not a courtesy, it is the safety mechanism. Nothing is
 * written until the operator has seen the exact list of changes, so a
 * spreadsheet with a shifted column cannot silently rewrite a few thousand
 * rows. Applying is a second, separate submission.
 */
export function ImportPanel({ t }: { t: Dictionary }) {
  const [state, formAction, pending] = useActionState(runImportAction, INITIAL);

  return (
    <section>
      <SectionTitle>{t.admin.importExport}</SectionTitle>

      <Card className="p-5 sm:p-6">
        <form action={formAction} className="relative space-y-4">
          <p className="text-sm leading-relaxed text-ink-400">
            CSV or Excel with a <span className="mono text-ink-200">SERIAL</span> column. Only{' '}
            <span className="mono text-ink-200">VERIFIED</span>,{' '}
            <span className="mono text-ink-200">COUNTRY</span> and{' '}
            <span className="mono text-ink-200">PRODUCTION_YEAR</span> can be changed. Serials, QR
            tokens and claim codes are frozen at export and are never importable.
          </p>

          <input
            type="file"
            name="file"
            required
            accept=".csv,.xlsx"
            className="block w-full cursor-pointer rounded-xl border border-dashed border-ink-700 bg-ink-950/50 px-4 py-6 text-sm text-ink-400 file:mr-4 file:rounded-lg file:border-0 file:bg-ink-800 file:px-4 file:py-2 file:text-sm file:text-ink-100 hover:border-ink-600"
          />

          <div className="flex flex-wrap gap-2">
            <Button type="submit" name="mode" value="preview" variant="secondary" disabled={pending}>
              Preview
            </Button>
            <Button
              type="submit"
              name="mode"
              value="apply"
              disabled={pending || state.status !== 'preview' || state.report?.changes.length === 0}
            >
              {t.admin.confirm}
            </Button>
          </div>
        </form>

        {state.report ? (
          <div className="relative mt-6 border-t border-ink-850 pt-5">
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <Metric label="rows" value={state.report.totalRows} />
              <Metric label="matched" value={state.report.matched} />
              <Metric label="changes" value={state.report.changes.length} tone="text-accent" />
              <Metric
                label="issues"
                value={state.report.issues.length}
                tone={state.report.issues.length ? 'text-danger' : 'text-ink-400'}
              />
              {state.report.applied ? (
                <span className="rounded-full border border-verified/40 bg-verified/10 px-2.5 py-0.5 text-[10px] uppercase tracking-wider text-verified">
                  applied
                </span>
              ) : (
                <span className="rounded-full border border-ink-700 px-2.5 py-0.5 text-[10px] uppercase tracking-wider text-ink-500">
                  dry run
                </span>
              )}
            </div>

            {state.report.changes.length > 0 ? (
              <ul className="mono mt-4 max-h-56 space-y-1 overflow-y-auto text-xs">
                {state.report.changes.slice(0, 200).map((change, i) => (
                  <li key={i} className="flex flex-wrap gap-2 text-ink-400">
                    <span className="text-ink-200">{change.serial}</span>
                    <span className="text-ink-600">{change.field}</span>
                    <span className="text-danger/80">{change.from}</span>
                    <span className="text-ink-600">→</span>
                    <span className="text-verified">{change.to}</span>
                  </li>
                ))}
              </ul>
            ) : null}

            {state.report.issues.length > 0 ? (
              <ul className="mono mt-4 max-h-40 space-y-1 overflow-y-auto text-xs text-danger/85">
                {state.report.issues.slice(0, 100).map((issue, i) => (
                  <li key={i}>
                    line {issue.line} {issue.serial} — {issue.problem}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {state.status === 'error' ? (
          <p className="relative mt-4 text-sm text-danger">{state.message}</p>
        ) : null}
      </Card>
    </section>
  );
}

function Metric({ label, value, tone = 'text-ink-100' }: { label: string; value: number; tone?: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className={`mono text-lg ${tone}`}>{value}</span>
      <span className="text-[10px] uppercase tracking-wider text-ink-600">{label}</span>
    </span>
  );
}
