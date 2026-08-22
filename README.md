# BINKIS ID

Digital identity registry for physical BINKIS collectible figures.

**Build step 1 only.** This repository currently contains the schema and the
batch generator — the deliverable that blocks physical manufacturing. The
public passport page, claim flow, collection, admin and deployment are build
steps 2–6 and are not started.

---

## What is here

```
prisma/schema.prisma            the full data model from CLAUDE.md
scripts/generate-batch.ts       the batch generator CLI  <- the deliverable
scripts/dev-db.ts               boots a local PostgreSQL 16 for development

src/lib/codes/                  alphabet, check character, claim codes, QR tokens
src/lib/serial.ts               serial format and edition range allocation
src/lib/hash.ts                 HMAC-SHA256 claim-code hashing
src/lib/generator.ts            minting and constraint-backed insertion
src/lib/db/claim.ts             the atomic claim transaction
src/lib/qr/                     QR encode, SVG render, and an independent decoder
src/lib/verify/                 the two pre-flight verification passes
src/lib/export/                 .xlsx writer and AES-256-GCM archive

tests/unit/                     no database required
tests/db/                       real PostgreSQL required
src/app/                        placeholder Next.js skeleton (step 3 fills it in)
```

---

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

```bash
openssl rand -base64 48    # -> CLAIM_CODE_PEPPER
openssl rand -base64 32    # -> FACTORY_EXPORT_KEY
```

Then either point `DATABASE_URL` / `STAGING_DATABASE_URL` at your own
PostgreSQL 16 and run `npx prisma db push` against each, or start a throwaway
one:

```bash
node scripts/dev-db.ts       # prints both URLs, pushes the schema, stays running
```

---

## Running the generator

```bash
node scripts/generate-batch.ts \
  --character SP \
  --edition classic \
  --quantity 200 \
  --batch B-2026-01 \
  --produced-at 2026-01-15
```

`node scripts/generate-batch.ts --help` lists every flag.

It runs six stages and stops at the first failure:

1. **Allocate** a contiguous serial range inside the correct edition block.
   Fails before writing anything if the batch would not fit.
2. **Mint** serials, QR tokens and claim codes, and insert them behind the
   database's unique constraints.
3. **Render** every QR to SVG and machine-decode every one back off disk.
4. **Rehearse** — claim every generated code against a staging database,
   assert each opens its own piece, then wipe staging.
5. **Export** the `.xlsx`, encrypt it to an AES-256-GCM archive, write the
   SHA-256 checksum, the row count and a manifest.
6. **Freeze** the batch. Its serials, tokens and hashes become immutable.

Output lands in `factory-exports/<BATCH>/`:

| File | What it is |
|---|---|
| `<BATCH>.xlsx.binkis` | the encrypted archive — **this is what the factory gets** |
| `<BATCH>.sha256` | `sha256sum`-compatible checksum file |
| `<BATCH>.manifest.json` | row count, checksums, cipher, columns |
| `qr/<SERIAL>.svg` | one verified QR per piece |

The plaintext `.xlsx` is deleted after sealing unless you pass
`--keep-plaintext`. Send the archive and the checksum together; send the key
through a different channel.

---

## Tests

```bash
npm test                                  # everything, boots PostgreSQL 16
VITEST_SKIP_DB=1 npx vitest run tests/unit  # no database needed
```

Written in the order the risks matter:

| | Suite | What it protects |
|---|---|---|
| 1 | `01-check-character` | a typo never reaches the server |
| 2 | `02-alphabet` | no ambiguous character ever reaches foil |
| 3 | `03-range-allocation` | editions can never collide in the serial block |
| 4 | `04-uniqueness-at-scale` | uniqueness is the database's job, at 50,000 rows |
| 5 | `05-concurrent-claim` | exactly one winner, and no oracle |
| 6 | `06-qr-roundtrip` | every printed QR resolves to its own piece |
| 7 | `07-factory-export` | the factory file is correct, sealed and checksummed |

`tests/db/` needs a real PostgreSQL. It boots one automatically via
`embedded-postgres`, or uses `TEST_DATABASE_URL` if you set it.

---

## Design notes worth knowing

**The QR decoder is deliberately hand-written.** Encoding uses the `qrcode`
library; `src/lib/qr/decode.ts` implements ISO/IEC 18004 from scratch — format
information, masking, block de-interleaving, Reed-Solomon verification, segment
decoding. A round trip is only evidence if the two directions are independent.
The SVG is also re-read geometrically rather than trusted, so a rendering bug
surfaces as a decode failure instead of cancelling itself out.

**Error correction defaults to M, not Q.** At 36 characters the payload is a
version 3 (29×29) symbol at level M and a version 4 (33×33) at level Q. On a
fixed sticker footprint, version 3 gives modules about 14% larger, and module
size is what survives reflective holographic foil. Raise it with `--ec Q` after
a physical print test rather than in advance.

**The factory `.xlsx` is not byte-reproducible.** An `.xlsx` is a zip and its
per-entry timestamps come from the clock, so two runs over identical rows
differ in about 32 container bytes. The checksum proves the archive arrived
intact; it cannot prove a regenerated file matches an earlier one. Regenerating
a batch is forbidden anyway.

**Prisma is pinned to 6.x.** Prisma 7 removed `url` from the datasource block
and requires a driver adapter (`pg` + `@prisma/adapter-pg`). Pinning to 6 keeps
the dependency list to what was approved.

**Claim transactions carry an explicit time budget.** Prisma's default 2-second
window for acquiring a transaction is wrong at both ends of our range. A
collector tapping CLAIM should fail fast, so `claimPiece` defaults to a short
one; the staging rehearsal drives hundreds of claims through a shared pool and
passes a much longer one. Left at the default, the rehearsal fails partway
through and reports a perfectly good claim code as invalid.

## Running this on Windows

Development on Windows needs three workarounds, all handled in
`scripts/lib/pg-cluster.ts` and none of which apply to the Ubuntu VPS:

- `initdb` fails on a data directory whose path contains a space, and this
  project lives in `C:\my project\`. The cluster is created under the temp
  directory instead.
- `postgres.exe` refuses to run under an account with administrative
  privileges. The server is started through `pg_ctl`, which relaunches it under
  a restricted token.
- `pg_ctl` hands its stdio handles to the server, which holds them open for
  its whole life, so it must be spawned with stdio ignored or the caller
  blocks forever.

Expect it to be slow here: a trivial Prisma transaction takes roughly 800ms on
this machine, against single-digit milliseconds on a normal Linux host. The
200-piece batch takes a few minutes locally and will be far quicker on the VPS.

---

## Check character: resolved, and why it changed

The claim code carries a weighted checksum over GF(31), not Luhn mod 31.

CLAUDE.md originally specified Luhn, this was built that way first, and the
tests measured what it actually did: **98.5%** of single-character typos caught,
and every adjacent transposition except `2`/`Z`. That gap is inherent to Luhn
over an odd modulus. Its guarantee comes from the base-10 doubling map being a
bijection on 0-9, which only holds because 10 is even. Over 31 the map collapses
and sends both `x` and `x + 15` to the same value, so at every doubled position
exactly one wrong character validates. The affected pairs were `3/J 4/K 5/M 6/N
7/P 8/Q 9/R A/S B/T C/U D/V E/W F/X G/Y H/Z`.

The replacement is `check = -Σ wᵢ·xᵢ mod 31`, with weights 2..11 on the payload
and weight 1 reserved for the check character, so no two positions share a
weight. Because 31 is prime it detects **every** single-character substitution
and **every** transposition, adjacent or not - a strictly stronger guarantee
than Luhn gives even in base 10, where non-adjacent transpositions can slip
through.

It is the same single printed character on the hologram, the same client-side
check, and the same factory specification. It was raised with the client and
changed on 20 August 2026, while the batch could still be regenerated for free
and before any hologram existed. `tests/unit/01-check-character.test.ts` proves
both guarantees exhaustively rather than by sampling.
