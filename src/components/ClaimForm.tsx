'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { ScratchPanel } from './ScratchPanel';
import { ClaimCodeInput } from './ClaimCodeInput';
import { submitClaim, type ClaimState } from '@/app/actions/claim';
import { parseClaimCode } from '@/lib/codes/claim-code';
import type { Dictionary } from '@/lib/i18n';

const INITIAL: ClaimState = { status: 'idle' };

export function ClaimForm({
  qrToken,
  signedIn,
  t,
}: {
  qrToken: string;
  signedIn: boolean;
  t: Dictionary;
}) {
  const [state, formAction, pending] = useActionState(submitClaim, INITIAL);
  const [code, setCode] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const normalised = parseClaimCode(code);
  const complete = code.replace(/-/g, '').length === 11;

  if (state.status === 'success') {
    return <ClaimSuccess serial={state.serial ?? ''} t={t} />;
  }

  if (!signedIn) {
    return (
      <div className="rounded-2xl border border-ink-800 bg-ink-900/60 p-6 text-center">
        <h2 className="text-lg font-semibold text-ink-50">{t.claim.signInFirst}</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-400">
          {t.claim.signInFirstBody}
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link
            href={`/signup?next=/p/${qrToken}`}
            className="rounded-xl bg-[--color-accent] px-6 py-3 text-sm font-semibold text-ink-950 transition hover:bg-[--color-accent-bright]"
          >
            {t.nav.signUp}
          </Link>
          <Link
            href={`/login?next=/p/${qrToken}`}
            className="rounded-xl border border-ink-700 px-6 py-3 text-sm font-semibold text-ink-200 transition hover:border-ink-600 hover:text-ink-50"
          >
            {t.nav.signIn}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        // The check character is validated here, in the browser, before the
        // request is made. A mistyped code is a typo, not an attack, and it
        // must never consume one of the caller's rate-limited attempts.
        if (!normalised) {
          e.preventDefault();
          setLocalError(complete ? t.claim.checkFailed : t.claim.invalidFormat);
          return;
        }
        setLocalError(null);
      }}
      className="space-y-5"
    >
      <input type="hidden" name="qrToken" value={qrToken} />
      <input type="hidden" name="code" value={normalised ?? code} />

      <div>
        <h2 className="font-display text-2xl tracking-wide text-ink-50">{t.claim.title}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-400">{t.claim.subtitle}</p>
      </div>

      <ScratchPanel hint={t.claim.scratchHint} skipLabel={t.claim.scratchHintShort}>
        <ClaimCodeInput
          value={code}
          onChange={(next) => {
            setCode(next);
            setLocalError(null);
          }}
          label={t.claim.codeLabel}
          placeholder={t.claim.codePlaceholder}
          invalid={Boolean(localError)}
          describedBy="claim-error"
        />
      </ScratchPanel>

      <p id="claim-error" aria-live="polite" className="min-h-5 text-center text-sm text-[--color-danger]">
        {localError ?? (state.status === 'error' ? state.message : '')}
      </p>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-[--color-accent] px-6 py-4 text-base font-semibold text-ink-950 transition hover:bg-[--color-accent-bright] disabled:cursor-not-allowed disabled:opacity-55"
      >
        {pending ? `${t.claim.working}...` : t.claim.submit}
      </button>
    </form>
  );
}

function ClaimSuccess({ serial, t }: { serial: string; t: Dictionary }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[--color-verified]/30 bg-ink-900/70 p-8 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          background:
            'radial-gradient(circle at 50% 0%, oklch(0.78 0.17 155 / 0.6), transparent 65%)',
        }}
      />
      <div className="relative animate-[rise_0.6s_cubic-bezier(0.22,1,0.36,1)]">
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="mx-auto size-14 text-[--color-verified]"
          fill="currentColor"
        >
          <path d="M12 1l9 4v6c0 5-3.8 9.7-9 11-5.2-1.3-9-6-9-11V5l9-4zm-1 14l6-6-1.4-1.4L11 12.2 8.4 9.6 7 11l4 4z" />
        </svg>
        <h2 className="mt-4 font-display text-3xl tracking-wide text-ink-50">
          {t.claim.successTitle}
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-300">
          {t.claim.successBody}
        </p>
        <p className="mono mt-4 text-lg tracking-[0.14em] text-ink-200">{serial}</p>
        <Link
          href="/collection"
          className="mt-6 inline-block rounded-xl bg-[--color-accent] px-6 py-3 text-sm font-semibold text-ink-950 transition hover:bg-[--color-accent-bright]"
        >
          {t.claim.viewCollection}
        </Link>
      </div>
    </div>
  );
}
