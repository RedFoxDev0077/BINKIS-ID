import { normaliseRarity, type Rarity } from '@/lib/passport';

/**
 * Rarity is the one place colour runs loud, and it has to read as a tier
 * system rather than decoration: a collector should rank two pieces without
 * reading the label. Mythic gets the holographic treatment because it is the
 * only tier where that much attention is earned.
 */
const TONE: Record<Rarity, string> = {
  Common: 'text-[--color-rarity-common] border-[--color-rarity-common]/35 bg-[--color-rarity-common]/8',
  Uncommon: 'text-[--color-rarity-uncommon] border-[--color-rarity-uncommon]/40 bg-[--color-rarity-uncommon]/10',
  Rare: 'text-[--color-rarity-rare] border-[--color-rarity-rare]/45 bg-[--color-rarity-rare]/12',
  Epic: 'text-[--color-rarity-epic] border-[--color-rarity-epic]/50 bg-[--color-rarity-epic]/14',
  Legendary: 'text-[--color-rarity-legendary] border-[--color-rarity-legendary]/55 bg-[--color-rarity-legendary]/16',
  Mythic: 'text-[--color-rarity-mythic] border-[--color-rarity-mythic]/60 bg-[--color-rarity-mythic]/18',
};

export function RarityChip({ rarity, className = '' }: { rarity: string; className?: string }) {
  const tier = normaliseRarity(rarity);
  const isTop = tier === 'Mythic' || tier === 'Legendary';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${TONE[tier]} ${className}`}
    >
      <span
        aria-hidden
        className="size-1.5 rounded-full bg-current"
        style={isTop ? { boxShadow: '0 0 8px currentColor' } : undefined}
      />
      {tier}
    </span>
  );
}
