'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { signIn, signUp, type AuthState } from '@/app/actions/auth';
import type { Dictionary } from '@/lib/i18n';

const INITIAL: AuthState = {};

export function AuthForm({
  mode,
  next,
  t,
}: {
  mode: 'signin' | 'signup';
  next?: string;
  t: Dictionary;
}) {
  const action = mode === 'signup' ? signUp : signIn;
  const [state, formAction, pending] = useActionState(action, INITIAL);

  return (
    <form action={formAction} className="space-y-5">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <h1 className="font-display text-3xl tracking-wide text-ink-50">
        {mode === 'signup' ? t.auth.signUpTitle : t.auth.signInTitle}
      </h1>

      <Field
        name="email"
        type="email"
        label={t.auth.email}
        autoComplete="email"
        error={state.fieldErrors?.email}
      />

      {mode === 'signup' ? (
        <Field
          name="handle"
          label={t.auth.handle}
          hint={t.auth.handleHint}
          autoComplete="username"
          error={state.fieldErrors?.handle}
        />
      ) : null}

      <Field
        name="password"
        type="password"
        label={t.auth.password}
        hint={mode === 'signup' ? t.auth.passwordHint : undefined}
        autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
        error={state.fieldErrors?.password}
      />

      <p aria-live="polite" className="min-h-5 text-sm text-[--color-danger]">
        {state.error ?? ''}
      </p>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-[--color-accent] px-6 py-4 text-base font-semibold text-ink-950 transition hover:bg-[--color-accent-bright] disabled:opacity-55"
      >
        {mode === 'signup' ? t.auth.submitSignUp : t.auth.submitSignIn}
      </button>

      <p className="text-center text-sm text-ink-500">
        {mode === 'signup' ? t.auth.haveAccount : t.auth.noAccount}{' '}
        <Link
          href={mode === 'signup' ? '/login' : '/signup'}
          className="text-[--color-accent] underline underline-offset-4"
        >
          {mode === 'signup' ? t.auth.submitSignIn : t.auth.submitSignUp}
        </Link>
      </p>
    </form>
  );
}

function Field({
  name,
  label,
  hint,
  error,
  type = 'text',
  autoComplete,
}: {
  name: string;
  label: string;
  hint?: string;
  error?: string;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={name}
        className="block text-xs font-semibold uppercase tracking-[0.16em] text-ink-400"
      >
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={hint || error ? `${name}-hint` : undefined}
        className={`w-full rounded-xl border bg-ink-900 px-4 py-3.5 text-base text-ink-50 outline-none transition ${
          error ? 'border-[--color-danger]' : 'border-ink-700 focus:border-[--color-accent]'
        }`}
      />
      {hint || error ? (
        <p id={`${name}-hint`} className={`text-xs ${error ? 'text-[--color-danger]' : 'text-ink-600'}`}>
          {error ?? hint}
        </p>
      ) : null}
    </div>
  );
}
