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
    <form
      action={formAction}
      className="grain relative space-y-5 overflow-hidden rounded-3xl border border-ink-800 bg-ink-900/70 p-7 backdrop-blur-sm sm:p-8"
    >
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <div className="relative">
        <h1 className="font-display text-3xl tracking-wide text-ink-50">
          {mode === 'signup' ? t.auth.signUpTitle : t.auth.signInTitle}
        </h1>
        <p className="mt-1.5 text-sm text-ink-500">
          {mode === 'signup' ? t.auth.signUpBlurb : t.auth.signInBlurb}
        </p>
      </div>

      <Field
        name="email"
        type="email"
        label={t.auth.email}
        placeholder="you@example.com"
        autoComplete="email"
        error={state.fieldErrors?.email}
      />

      {mode === 'signup' ? (
        <Field
          name="handle"
          label={t.auth.handle}
          hint={t.auth.handleHint}
          placeholder="coleccionista"
          autoComplete="username"
          error={state.fieldErrors?.handle}
        />
      ) : null}

      <Field
        name="password"
        type="password"
        placeholder="••••••••••"
        label={t.auth.password}
        hint={mode === 'signup' ? t.auth.passwordHint : undefined}
        autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
        error={state.fieldErrors?.password}
      />

      <p aria-live="polite" className="min-h-5 text-sm text-danger">
        {state.error ?? ''}
      </p>

      <button
        type="submit"
        disabled={pending}
        className="press relative min-h-14 w-full rounded-xl bg-accent px-6 text-base font-semibold text-ink-950 transition hover:bg-accent-bright disabled:opacity-55"
      >
        {mode === 'signup' ? t.auth.submitSignUp : t.auth.submitSignIn}
      </button>

      <p className="text-center text-sm text-ink-500">
        {mode === 'signup' ? t.auth.haveAccount : t.auth.noAccount}{' '}
        <Link
          href={mode === 'signup' ? '/login' : '/signup'}
          className="text-accent underline underline-offset-4"
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
  placeholder,
}: {
  name: string;
  label: string;
  hint?: string;
  error?: string;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
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
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={hint || error ? `${name}-hint` : undefined}
        className={`min-h-12 w-full rounded-xl border bg-ink-950/70 px-4 text-base text-ink-50 outline-none transition placeholder:text-ink-700 ${
          error ? 'border-danger' : 'border-ink-700 focus:border-accent'
        }`}
      />
      {hint || error ? (
        <p id={`${name}-hint`} className={`text-xs ${error ? 'text-danger' : 'text-ink-600'}`}>
          {error ?? hint}
        </p>
      ) : null}
    </div>
  );
}
