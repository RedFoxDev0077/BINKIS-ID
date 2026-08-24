import { normaliseRarity, RARITY_TIERS, type Rarity } from '@/lib/passport';

/**
 * Rarity is the one place colour runs loud, and it must read as a TIER, not a
 * label. Three things encode the tier at once, so it survives being seen
 * quickly, in colour-blind vision, and in a grid of other pieces:
 *
 *   1. hue, escalating through the tiers
 *   2. a filled pip count, so the rank is legible without knowing the palette
 *   3. a glow on the top two tiers only, so "rare" actually feels rare
 */
const TONE: Record<Rarity, string> = {
  Common: 'text-[--color-rarity-common] border-[--color-rarity-common]/30 bg-[--color-rarity-common]/8',
  Uncommon: 'text-[--color-rarity-uncommon] border-[--color-rarity-uncommon]/38 bg-[--color-rarity-uncommon]/10',
  Rare: 'text-[--color-rarity-rare] border-[--color-rarity-rare]/42 bg-[--color-rarity-rare]/12',
  Epic: 'text-[--color-rarity-epic] border-[--color-rarity-epic]/48 bg-[--color-rarity-epic]/14',
  Legendary: 'text-[--color-rarity-legendary] border-[--color-rarity-legendary]/55 bg-[--color-rarity-legendary]/16',
  Mythic: 'text-[--color-rarity-mythic] border-[--color-rarity-mythic]/60 bg-[--color-rarity-mythic]/18',
};

export function RarityChip({
  rarity,
  size = 'md',
  className = '',
}: {
  rarity: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const tier = normaliseRarity(rarity);
  const rank = RARITY_TIERS.indexOf(tier) + 1;
  const isTop = rank >= 5;

  return (
    <span
      title={`${tier} — tier ${rank} of ${RARITY_TIERS.length}`}
      className={`inline-flex items-center gap-2 rounded-full border font-semibold uppercase tracking-[0.14em] ${TONE[tier]} ${
        size === 'sm' ? 'px-2.5 py-0.5 text-[10px]' : 'px-3 py-1 text-xs'
      } ${className}`}
    >
      <span aria-hidden className="flex items-center gap-[2px]">
        {RARITY_TIERS.map((_, i) => (
          <span
            key={i}
            className={`rounded-full transition-opacity ${size === 'sm' ? 'size-[3px]' : 'size-1'} ${
              i < rank ? 'bg-current opacity-100' : 'bg-current opacity-20'
            }`}
            style={i < rank && isTop ? { boxShadow: '0 0 5px currentColor' } : undefined}
          />
        ))}
      </span>
      {tier}
    </span>
  );
}
