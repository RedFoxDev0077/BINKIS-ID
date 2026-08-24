export function Card({
  children,
  className = '',
  tone = 'default',
  as: Tag = 'section',
}: {
  children: React.ReactNode;
  className?: string;
  tone?: 'default' | 'accent' | 'danger' | 'verified';
  as?: 'section' | 'div' | 'article' | 'li';
}) {
  const TONES = {
    default: 'border-ink-800 bg-ink-900/55',
    accent: 'border-[--color-accent]/25 bg-[--color-accent]/6',
    danger: 'border-[--color-danger]/35 bg-[--color-danger]/8',
    verified: 'border-[--color-verified]/28 bg-[--color-verified]/6',
  } as const;

  return (
    <Tag
      className={`grain relative overflow-hidden rounded-2xl border backdrop-blur-[2px] ${TONES[tone]} ${className}`}
    >
      {children}
    </Tag>
  );
}

export function SectionTitle({
  children,
  hint,
}: {
  children: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
      <h2 className="font-display text-2xl tracking-wide text-ink-50">{children}</h2>
      {hint ? <span className="text-xs text-ink-500">{hint}</span> : null}
    </div>
  );
}

export function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-600">
        {label}
      </dt>
      <dd className={`mt-1 text-sm text-ink-100 ${mono ? 'mono' : ''}`}>{value}</dd>
    </div>
  );
}
