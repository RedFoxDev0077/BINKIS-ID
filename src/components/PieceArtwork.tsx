import Image from 'next/image';
import { normaliseRarity, RARITY_TIERS } from '@/lib/passport';

/**
 * The artwork panel.
 *
 * Uses Product.artworkUrl when the client has supplied art. Until then it
 * renders a generated panel keyed to the character code and rarity, so the
 * passport looks finished rather than showing a broken-image icon or an empty
 * grey rectangle on 134,399 pages.
 *
 * The fallback is deliberately typographic rather than a stock illustration:
 * the character code is the real identifier, and inventing artwork for
 * somebody else's product would be worse than showing none.
 */
export function PieceArtwork({
  characterCode,
  character,
  rarity,
  artworkUrl,
  className = '',
}: {
  characterCode: string;
  character: string;
  rarity: string;
  artworkUrl?: string | null;
  className?: string;
}) {
  if (artworkUrl) {
    return (
      <div className={`relative overflow-hidden rounded-2xl bg-ink-925 ${className}`}>
        <Image
          src={artworkUrl}
          alt={character}
          fill
          sizes="(max-width: 640px) 100vw, 320px"
          className="object-cover"
        />
      </div>
    );
  }

  const tier = normaliseRarity(rarity);
  const rank = RARITY_TIERS.indexOf(tier);
  // Spread the six tiers across the colour wheel so two rarities never produce
  // the same panel, and keep chroma low so it stays a backdrop.
  const hue = [265, 155, 245, 305, 75, 15][rank] ?? 265;

  return (
    <div
      className={`grain relative flex items-center justify-center overflow-hidden rounded-2xl border border-ink-800 ${className}`}
      style={{
        background: `radial-gradient(circle at 50% 30%, oklch(0.32 0.09 ${hue}), oklch(0.17 0.03 ${hue}) 62%, oklch(0.145 0.008 265) 100%)`,
      }}
    >
      <span
        aria-hidden
        className="font-display text-7xl leading-none tracking-[0.06em] text-white/85 sm:text-8xl"
        style={{ textShadow: `0 0 42px oklch(0.7 0.16 ${hue} / 0.55)` }}
      >
        {characterCode}
      </span>
      <span className="sr-only">{character}</span>
    </div>
  );
}
