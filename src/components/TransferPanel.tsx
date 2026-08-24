'use client';

import { useActionState, useState } from 'react';
import { sendTransfer, type TransferState } from '@/app/actions/transfer';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import type { Dictionary } from '@/lib/i18n';

const INITIAL: TransferState = { status: 'idle' };

/**
 * Transfer, offered on the passport page to the current owner only.
 *
 * Collapsed by default. Handing a piece to someone else is rare and
 * irreversible-feeling, so it should be deliberate rather than a button
 * sitting under the owner's thumb every time they open their own piece.
 */
export function TransferPanel({
  serial,
  hasPending,
  t,
}: {
  serial: string;
  hasPending: boolean;
  t: Dictionary;
}) {
  const [state, formAction, pending] = useActionState(sendTransfer, INITIAL);
  const [open, setOpen] = useState(false);

  if (hasPending) {
    return (
      <Card className="p-5">
        <div className="relative flex items-center gap-3">
          <span className="relative flex size-2.5 shrink-0">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-[--color-warn] opacity-60" />
            <span className="relative inline-flex size-2.5 rounded-full bg-[--color-warn]" />
          </span>
          <p className="text-sm text-ink-200">{t.transfer.outgoing}</p>
        </div>
      </Card>
    );
  }

  if (state.status === 'sent') {
    return (
      <Card tone="verified" className="p-5">
        <p className="relative text-sm text-ink-100">{state.message}</p>
      </Card>
    );
  }

  return (
    <Card className="p-5 sm:p-6">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="press relative flex w-full items-center justify-between gap-4 text-left"
        >
          <span>
            <span className="block font-display text-xl tracking-wide text-ink-50">
              {t.transfer.title}
            </span>
            <span className="mt-1 block text-sm text-ink-500">{t.transfer.subtitle}</span>
          </span>
          <svg viewBox="0 0 24 24" className="size-5 shrink-0 text-ink-500" fill="currentColor">
            <path d="M4 9h12l-3.3-3.3L14.1 4.3 19.8 10l-5.7 5.7-1.4-1.4L16 11H4V9z" />
          </svg>
        </button>
      ) : (
        <form action={formAction} className="relative space-y-4">
          <input type="hidden" name="serial" value={serial} />

          <div>
            <h3 className="font-display text-xl tracking-wide text-ink-50">{t.transfer.title}</h3>
            <p className="mt-1 text-sm text-ink-500">{t.transfer.subtitle}</p>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="recipient"
              className="block text-xs font-semibold uppercase tracking-[0.16em] text-ink-400"
            >
              {t.transfer.recipient}
            </label>
            <input
              id="recipient"
              name="recipient"
              required
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="@handle · email@example.com"
              className="min-h-12 w-full rounded-xl border border-ink-700 bg-ink-950/60 px-4 text-base text-ink-50 outline-none transition focus:border-[--color-accent]"
            />
            <p className="text-xs leading-relaxed text-ink-600">{t.transfer.recipientHint}</p>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="message"
              className="block text-xs font-semibold uppercase tracking-[0.16em] text-ink-400"
            >
              {t.transfer.messageLabel}
            </label>
            <textarea
              id="message"
              name="message"
              rows={2}
              maxLength={500}
              className="w-full resize-none rounded-xl border border-ink-700 bg-ink-950/60 px-4 py-3 text-sm text-ink-50 outline-none transition focus:border-[--color-accent]"
            />
          </div>

          <p aria-live="polite" className="min-h-5 text-sm text-[--color-danger]">
            {state.status === 'error' ? state.message : ''}
          </p>

          <div className="flex gap-2">
            <Button type="submit" disabled={pending} full>
              {t.transfer.send}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {t.transfer.cancel}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
