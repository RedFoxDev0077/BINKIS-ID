-- Variant, Rare and Super Rare editions.
--
-- Requested by the client on 29 August 2026, before any of the three had been
-- printed: Variant across 4 characters at 2,777 each, Rare (Brainiac) at
-- 7,777, and Super Rare (Poison Ivy) at 2,777.
--
-- Additive only. No existing row changes edition, and no printed serial
-- changes meaning. The serial ranges these occupy (2xxxxx, 3xxxxx, 4xxxxx)
-- were left deliberately empty for exactly this.
ALTER TYPE "EditionType" ADD VALUE IF NOT EXISTS 'VARIANT';
ALTER TYPE "EditionType" ADD VALUE IF NOT EXISTS 'RARE';
ALTER TYPE "EditionType" ADD VALUE IF NOT EXISTS 'SUPER_RARE';
