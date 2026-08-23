/**
 * The serial, set as a hero element.
 *
 * This is the number printed on the physical hologram, and it is the first
 * thing a collector checks against the object in their hand. Monospaced with
 * tabular figures so the two can be compared character by character, and set
 * large because it is the piece's name, not its metadata.
 */
export function Serial({ value, className = '' }: { value: string; className?: string }) {
  const [prefix, digits] = value.split('-');
  return (
    <div
      className={`mono select-all leading-none tracking-[0.02em] ${className}`}
      aria-label={`Piece number ${value}`}
    >
      <span className="text-ink-400">{prefix}</span>
      <span className="text-ink-600">-</span>
      <span className="text-ink-50">{digits}</span>
    </div>
  );
}
