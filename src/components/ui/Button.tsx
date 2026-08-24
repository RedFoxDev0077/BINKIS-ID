import Link from 'next/link';

/**
 * One button, three intents.
 *
 * Large tap targets throughout: nearly every scan is a phone, one-handed, and
 * often in a shop. Minimum height is 44px, which is the smallest reliable
 * touch target, and the primary action on the claim flow is bigger still.
 */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-accent text-ink-950 font-semibold hover:bg-accent-bright shadow-[0_0_0_0_oklch(0.76_0.17_195/0.5)] hover:shadow-[0_6px_28px_-6px_oklch(0.76_0.17_195/0.55)]',
  secondary:
    'border border-ink-700 bg-ink-900/60 text-ink-100 hover:border-ink-600 hover:bg-ink-850 hover:text-white',
  ghost: 'text-ink-400 hover:bg-ink-900 hover:text-ink-100',
  danger:
    'border border-danger/45 bg-danger/10 text-danger hover:bg-danger/18',
};

const SIZES: Record<Size, string> = {
  sm: 'min-h-9 px-3.5 text-sm rounded-lg gap-1.5',
  md: 'min-h-11 px-5 text-sm rounded-xl gap-2',
  lg: 'min-h-14 px-7 text-base rounded-xl gap-2.5',
};

function classes(variant: Variant, size: Size, full?: boolean) {
  return [
    'press inline-flex items-center justify-center whitespace-nowrap',
    'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:transform-none',
    VARIANTS[variant],
    SIZES[size],
    full ? 'w-full' : '',
  ].join(' ');
}

export function Button({
  variant = 'primary',
  size = 'md',
  full,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  full?: boolean;
}) {
  return <button {...props} className={`${classes(variant, size, full)} ${className}`} />;
}

export function ButtonLink({
  href,
  variant = 'primary',
  size = 'md',
  full,
  className = '',
  children,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  full?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href as never} className={`${classes(variant, size, full)} ${className}`}>
      {children}
    </Link>
  );
}
