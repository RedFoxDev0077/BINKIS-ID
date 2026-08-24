/**
 * Collection progress.
 *
 * The bar is the point of the My Collection page: a collector wants to see how
 * close a set is to complete at a glance. The fill is tinted by rarity so a
 * Legendary set reads differently from a Common one, and the number is stated
 * as "n / total" rather than a percentage because collectors count pieces, not
 * percentages.
 */
export function Progress({
  value,
  total,
  label,
  tone = 'accent',
}: {
  value: number;
  total: number;
  label: string;
  tone?: string;
}) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  const complete = total > 0 && value >= total;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-sm text-ink-200">{label}</span>
        <span className="mono shrink-0 text-xs text-ink-500">
          {value} / {total}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={label}
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-850"
      >
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{
            width: `${pct}%`,
            background: complete
              ? 'linear-gradient(90deg, oklch(0.78 0.17 155), oklch(0.86 0.15 195))'
              : `var(--color-${tone})`,
          }}
        />
      </div>
    </div>
  );
}
