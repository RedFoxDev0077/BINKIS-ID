# Adding pieces to an edition that already exists

How to grow a run without regenerating anything. Written for the Brainiac and
Poison Ivy increases the client confirmed on 8 November 2026, but the shape is
the same every time.

The rule this whole procedure exists to protect: **generated production data is
immutable**. Pieces already minted keep their serial, their QR token and their
claim code forever. An increase is new pieces in a new batch, plus a run size
that moves. Nothing is ever rebuilt.

## What was confirmed

| Character | Edition | Was | Now | New pieces | Positions |
|---|---|---|---|---|---|
| BR Brainiac | Rare | 7,777 | 8,000 | 223 | 7,778 .. 8,000 |
| PI Poison Ivy | Super Rare | 2,222 | 2,777 | 555 | 2,223 .. 2,777 |

Both print as the separated form agreed the same day: `BR-R-7778`, `PI-S-2223`.

## Before you run anything

**Check the series on the existing product, and pass exactly that.**

A Product is keyed by `characterCode + editionType + series`. `--series`
defaults to `Series 1`. If the Brainiac product was created under any other
series name, passing the default does not append to it — it silently creates a
**second** Brainiac Rare product with its own run size, and the 223 new pieces
join that one instead. The edition then has two totals and neither is right.

```sh
docker exec binkis-id-db-1 psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "SELECT character_code, edition_type, series, rarity, run_size
     FROM products WHERE character_code IN ('BR','PI');"
```

Also confirm the last position actually in use, so `--from` continues rather
than collides. The generator refuses to reuse a serial, so a wrong `--from`
fails loudly rather than corrupting anything — but it fails after you have
waited for QR verification, so it is cheaper to check first.

```sh
docker exec binkis-id-db-1 psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "SELECT p.character_code, MAX(pc.edition_number)
     FROM pieces pc JOIN products p ON p.id = pc.product_id
    WHERE p.character_code IN ('BR','PI') GROUP BY 1;"
```

## Run it

On the server, as the user that owns the app, with `CLAIM_CODE_PEPPER` and
`FACTORY_EXPORT_KEY` present in the environment. `STAGING_DATABASE_URL` must
point somewhere that is **not** the live registry: the rehearsal claims every
code it generates, so pointing it at production would burn the whole batch.

```sh
cd /opt/binkis-id/app

node scripts/generate-batch.ts \
  --character BR --edition rare \
  --quantity 223 --from 7778 --run-size 8000 \
  --batch B-2026-BR-RARE-B2 \
  --series '<exactly what the query above returned>' \
  --rarity 'Rare'

node scripts/generate-batch.ts \
  --character PI --edition super-rare \
  --quantity 555 --from 2223 --run-size 2777 \
  --batch B-2026-PI-SUPERRARE-B2 \
  --series '<exactly what the query above returned>' \
  --rarity 'Super Rare'
```

The plan step prints the run size move before it writes anything:

```
Run size    7777 -> 8000  (moves EVERY Brainiac Rare passport, not just this batch)
```

That line is the one to read carefully. It is correct here — the whole edition
should read `/ 8,000` once the run grows, including pieces sold yesterday — but
it is also the line that would warn you if you were about to move a run you did
not mean to touch. If `--run-size` is omitted entirely the generator refuses the
batch rather than minting pieces that would read `7,999 / 7,777`.

## Then rebuild the factory files

The delivered Rare and Super Rare files hold the old spelling and the old run.
`scripts/build-separated-serials.ts` re-spells them, but it asserts the row
counts, so it will refuse until the two files are merged with the continuation
batches generated above — the same merge `build-variant-4777.ts` does for the
Variant B2 batches. Update the counts in `JOBS` to 8,000 and 2,777 as part of
that change, not before.

## What must never happen

- No `--overage` on an edition-numbered run. The generator refuses it: feeding
  extra rows to absorb press waste leaves gaps in the numbering, and there is no
  way to repair a missing `45 / 777` after the press has run.
- No regeneration of an existing batch. A claim code exists in plaintext only in
  the file already delivered; minting new ones strands every code the client is
  holding.
- No editing of the delivered files. They are the record of what was sent.
