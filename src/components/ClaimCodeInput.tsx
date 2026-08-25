'use client';

import { useId } from 'react';
import { ALPHABET } from '@/lib/codes/alphabet';
import { CLAIM_CODE_LENGTH } from '@/lib/codes/claim-code';

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
      .slice(0, CLAIM_CODE_LENGTH);

    // Groups of three, matching formatClaimCode and therefore matching what is
    // physically printed under the scratch panel. This grouped 4-4-3 and
    // accepted 11 characters until the code dropped to 9, so someone reading
    // XXX-XXX-XXX off the hologram watched their own typing regroup itself
    // into a different shape - at the exact moment they are trying to check
    // one against the other.
    const groups: string[] = [];
    for (let i = 0; i < cleaned.length; i += 3) groups.push(cleaned.slice(i, i + 3));
    onChange(groups.join('-'));
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
