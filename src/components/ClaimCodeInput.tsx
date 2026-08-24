'use client';

import { useId } from 'react';
import { ALPHABET } from '@/lib/codes/alphabet';

/**
 * The Claim Code field.
 *
 * Nearly every claim happens on a phone, one-handed, in bad light, with the
 * physical hologram in the other hand. So: auto-uppercase, hyphens inserted
 * as you type, a keyboard that offers letters and digits, no autocorrect and
 * no autocapitalise fighting the input, and characters outside the 31-letter
 * alphabet silently dropped rather than accepted and rejected later.
 */
export function ClaimCodeInput({
  value,
  onChange,
  label,
  placeholder,
  invalid,
  describedBy,
}: {
  value: string;
  onChange: (next: string) => void;
  label: string;
  placeholder: string;
  invalid?: boolean;
  describedBy?: string;
}) {
  const id = useId();

  const handle = (raw: string) => {
    const cleaned = raw
      .toUpperCase()
      .split('')
      .filter((char) => ALPHABET.includes(char))
      .join('')
      .slice(0, 11);

    let formatted = cleaned.slice(0, 4);
    if (cleaned.length > 4) formatted += `-${cleaned.slice(4, 8)}`;
    if (cleaned.length > 8) formatted += `-${cleaned.slice(8, 11)}`;
    onChange(formatted);
  };

  return (
    <div className="space-y-2">
      <label
        htmlFor={id}
        className="block text-xs font-semibold uppercase tracking-[0.16em] text-ink-400"
      >
        {label}
      </label>
      <input
        id={id}
        name="codeDisplay"
        value={value}
        onChange={(e) => handle(e.target.value)}
        placeholder={placeholder}
        inputMode="text"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="characters"
        spellCheck={false}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={`mono w-full rounded-xl border bg-ink-900 px-4 py-4 text-center text-2xl tracking-[0.18em] text-ink-50 outline-none transition placeholder:text-ink-700 sm:text-3xl ${
          invalid
            ? 'border-danger focus:border-danger'
            : 'border-ink-700 focus:border-accent'
        }`}
      />
    </div>
  );
}
