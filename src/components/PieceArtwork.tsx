import Image from 'next/image';
import { normaliseRarity, RARITY_TIERS } from '@/lib/passport';
import { characterMedia } from '@/lib/characters/media';
import { CharacterAnimation } from './CharacterAnimation';

/**
 * The artwork panel.
 *
 * Three sources, in order. Product.artworkUrl wins, because it is the field an
 * admin can change without a deploy. Otherwise the character's own art, which
 * the client supplied in September 2026: the eight Classics animate, the five
 * Limiteds are stills. Failing both, a generated panel keyed to the character
 * code and rarity, so a passport for a character we have no art for still
 * looks finished rather than broken.
 *
 * The last fallback is typographic on purpose: the character code is the real
 * identifier, and inventing artwork for somebody else's product would be
 * worse than showing none.
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

  const media = characterMedia(characterCode);
  if (media) {
    return (
      <div className={`relative overflow-hidden rounded-2xl bg-ink-925 ${className}`}>
        {media.video && media.poster ? (
          <CharacterAnimation video={media.video} poster={media.poster} alt={character} />
        ) : (
          // Plain img, not next/image: these files are served by Caddy off the
          // host, so the optimiser inside the app container cannot fetch them.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={media.image} alt={character} className="h-full w-full object-cover" />
        )}
        <span className="sr-only">{character}</span>
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
