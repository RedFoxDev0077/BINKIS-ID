/**
 * The verified badge.
 *
 * Iridescent, because that is exactly what the physical hologram looks like,
 * and this is the digital half of the same object. The unverified state is
 * deliberately flat and grey: the contrast between them is what makes
 * verification feel like it was earned rather than granted by default.
 */
export function VerifiedBadge({
  label,
  verified,
  size = 'md',
}: {
  label: string;
  verified: boolean;
  size?: 'sm' | 'md';
}) {
  const pad = size === 'sm' ? 'px-2.5 py-1 text-[10px]' : 'px-3.5 py-1.5 text-xs';

  if (!verified) {
    return (
      <span
        className={`inline-flex items-center gap-2 rounded-full border border-ink-700 bg-ink-850/80 font-medium uppercase tracking-[0.14em] text-ink-400 ${pad}`}
      >
        <span aria-hidden className="size-1.5 rounded-full bg-ink-600" />
        {label}
      </span>
    );
  }

  return (
    <span
      className={`holo-border relative inline-flex items-center gap-2 rounded-full font-semibold uppercase tracking-[0.14em] ${pad}`}
    >
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        className={`${size === 'sm' ? 'size-3' : 'size-3.5'} text-[--color-verified]`}
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          d="M10 1.5l2.2 1.6 2.7-.2.9 2.6 2.2 1.6-1 2.6 1 2.6-2.2 1.6-.9 2.6-2.7-.2L10 18.5l-2.2-1.6-2.7.2-.9-2.6L2 12.9l1-2.6-1-2.6 2.2-1.6.9-2.6 2.7.2L10 1.5zm3.7 6.1a.9.9 0 00-1.3-1.2L9 9.9 7.6 8.5a.9.9 0 10-1.3 1.2l2 2c.4.4 1 .4 1.3 0l4.1-4.1z"
          clipRule="evenodd"
        />
      </svg>
      <span className="holo-text">{label}</span>
    </span>
  );
}
