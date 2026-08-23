export function VerifiedBadge({ label, verified }: { label: string; verified: boolean }) {
  if (!verified) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-ink-700 bg-ink-850 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.14em] text-ink-400">
        <span aria-hidden className="size-1.5 rounded-full bg-ink-600" />
        {label}
      </span>
    );
  }

  // Iridescent, echoing the physical hologram. An accent, never a background.
  return (
    <span className="holo-border inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em]">
      <svg aria-hidden viewBox="0 0 20 20" className="size-3.5 text-[--color-verified]" fill="currentColor">
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
