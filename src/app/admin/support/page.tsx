import { prisma } from '@/lib/db/client';
import { diagnose, type Verdict } from '@/lib/db/support';
import { Card } from '@/components/ui/Card';
import { Serial } from '@/components/Serial';

/**
 * "My code does not work."
 *
 * One box, one answer. A support person pastes whatever the customer sent -
 * a serial, a token, or the whole URL - and gets a sentence they can act on,
 * with the evidence underneath it.
 *
 * The claim endpoint deliberately refuses to say why it failed, so that it
 * cannot be used to enumerate codes. This page is the other side of that
 * decision: the reason exists, it is in the audit log, and this is the one
 * place it is shown.
 */

export const dynamic = 'force-dynamic';

const TONE: Record<Verdict, { label: string; className: string }> = {
  not_found: { label: 'Not found', className: 'border-ink-700 bg-ink-900 text-ink-300' },
  unclaimed_no_attempts: {
    label: 'Piece is fine',
    className: 'border-verified/40 bg-verified/10 text-verified',
  },
  unclaimed_wrong_code: {
    label: 'Piece is fine',
    className: 'border-verified/40 bg-verified/10 text-verified',
  },
  already_claimed: {
    label: 'Already claimed',
    className: 'border-accent/40 bg-accent/10 text-accent',
  },
  rate_limited: {
    label: 'Locked out',
    className: 'border-accent/40 bg-accent/10 text-accent',
  },
  voided: { label: 'Voided', className: 'border-danger/40 bg-danger/10 text-danger' },
  reserved: { label: 'Reserved', className: 'border-danger/40 bg-danger/10 text-danger' },
};

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? '').trim();
  const report = query ? await diagnose(prisma, query) : null;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 sm:px-6">
      <div className="py-8">
        <h1 className="font-display text-3xl tracking-wide text-ink-50">Support lookup</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-400">
          Paste a piece number, a QR token, or the whole link the customer sent.
        </p>

        <form method="get" className="mt-6 flex gap-2">
          <input
            name="q"
            defaultValue={query}
            autoFocus
            placeholder="SP-000001, or id.binkis.com/p/..."
            aria-label="Piece number, token or link"
            className="mono min-w-0 flex-1 rounded-xl border border-ink-700 bg-ink-900 px-4 py-3 text-base text-ink-50 outline-none transition placeholder:text-ink-700 focus:border-accent"
          />
          <button
            type="submit"
            className="shrink-0 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-ink-950 transition hover:bg-accent-bright"
          >
            Look up
          </button>
        </form>
      </div>

      {report ? (
        <div className="space-y-5 pb-10">
          {/* The answer, before any of the evidence. */}
          <Card className="p-6">
            <span
              className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${TONE[report.verdict].className}`}
            >
              {TONE[report.verdict].label}
            </span>
            <p className="mt-4 text-base leading-relaxed text-ink-100">{report.summary}</p>
          </Card>

          {report.piece ? (
            <Card className="p-6">
              <Serial value={report.piece.serial} className="text-2xl" />
              <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                <Field label="Status" value={report.piece.status} />
                <Field label="Verified" value={report.piece.verified ? 'Yes' : 'No'} />
                <Field label="Character" value={report.piece.character} />
                <Field label="Edition" value={report.piece.editionLabel} />
                <Field
                  label="Edition number"
                  value={report.piece.editionNumber?.toString() ?? '—'}
                />
                <Field label="Batch" value={report.piece.batch} />
                <Field label="QR token" value={report.piece.qrToken} mono />
                {report.owner ? (
                  <Field label="Owner" value={`@${report.owner.handle}`} />
                ) : null}
              </dl>
            </Card>
          ) : null}

          {report.attempts.length > 0 ? (
            <Card className="p-6">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-500">
                Attempts, last 24 hours
              </h2>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[34rem] text-left text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wider text-ink-600">
                      <th className="pb-2 pr-4 font-semibold">When</th>
                      <th className="pb-2 pr-4 font-semibold">From</th>
                      <th className="pb-2 pr-4 font-semibold">Result</th>
                      <th className="pb-2 font-semibold">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="text-ink-300">
                    {report.attempts.map((a, i) => (
                      <tr key={i} className="border-t border-ink-850">
                        <td className="mono py-2 pr-4 tabular-nums text-ink-400">
                          {a.at.toISOString().slice(0, 19).replace('T', ' ')}
                        </td>
                        <td className="mono py-2 pr-4 text-ink-500">{a.ip}</td>
                        <td className="py-2 pr-4">
                          {a.succeeded ? (
                            <span className="text-verified">claimed</span>
                          ) : (
                            <span className="text-ink-400">failed</span>
                          )}
                        </td>
                        <td className="py-2 text-ink-400">{a.reason ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-4 text-xs text-ink-600">
                The customer is never shown these reasons. All four failures look
                identical from outside, so the endpoint cannot be used to find out
                which codes exist.
              </p>
            </Card>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-ink-600">{label}</dt>
      <dd className={`mt-0.5 text-ink-100 ${mono ? 'mono text-sm' : ''}`}>{value}</dd>
    </div>
  );
}
