-- Bizarro: BZ -> BIZ.
--
-- The client renamed the character on 15 October 2026. CHARACTER_CODES, the
-- serial parser and the print-file builder all changed that day. This
-- database did not, because products.character_code was CHAR(2) and could
-- not hold three letters; see 20260106000000_three_letter_character_codes.
-- Once that column became VARCHAR(8) the rename was finally possible, and it
-- was run against production on 4 November 2026.
--
-- This is a repair, not a regeneration, and it does not touch what rule 7 of
-- CLAUDE.md protects:
--
--   * qr_token and claim_hash are untouched. Every QR still resolves to the
--     piece it was minted for, and every claim code still claims it.
--   * The factory files printed in October read BIZ-001 .. BIZ-777. The
--     hologram says BIZ. The database said BZ. This moves the database to
--     the physical object, which is the direction that rule exists to
--     protect.
--   * parseSerial('BZ-L00001') returned NULL: not one of the 4,254 Bizarro
--     pieces in production could be read by the registry that owns them.
--     printedSerial('BIZ-L00001') is 'BIZ-001', the string on the sticker.
--   * All 4,254 were UNCLAIMED, so no owner had ever been shown the old
--     serial and no ledger row refers to one.
--
-- Batch codes stay B-2026-BZ-*. A batch code is a frozen generation
-- identifier, it is not printed, and the factory file carries no BATCH
-- column. Renaming it would alter an exported fact to gain nothing.
--
-- audit_logs rows that mention BZ- stay as they are. The audit records what
-- happened, and what happened is that they said BZ.
--
-- Written as a migration so a restore-then-migrate reproduces the state. It
-- is idempotent: production is already renamed and staging has no Bizarro
-- rows, so both are a no-op.

UPDATE "products" SET "character_code" = 'BIZ' WHERE "character_code" = 'BZ';

UPDATE "pieces" SET "serial" = 'BIZ-' || substring("serial" from 4)
WHERE "serial" LIKE 'BZ-%';
