# BINKIS ID — Handover

Everything needed to run, extend, or take over this system.

Written for whoever holds it next: David, or a developer he brings in. It
assumes you can read TypeScript and use a terminal. It does not assume you were
here while it was built.

Live at **https://id.binkis.com**.

---

## 1. What this is, in one paragraph

Every physical BINKI carries a hologram sticker with a printed serial, a QR
code, and a Claim Code hidden under a scratch panel. Scanning the QR opens that
piece's public page. Scratching the panel and entering the code proves the
person is physically holding the figure, and registers them as its owner. The
figure is the collectible; this system is its permanent memory. Owners change.
The piece's identity and history do not.

---

## 2. The seven things you must not break

These are not style preferences. Each one is load-bearing, and each one is
cheap now and impossible to fix after 134,399 stickers are printed.

**1. Claim Codes exist only as a keyed hash.**
`HMAC-SHA256(code, CLAIM_CODE_PEPPER)`. The plaintext is never stored, never
logged, never returned by any endpoint. The only place plaintext ever exists is
the one-time encrypted factory export. If you ever find yourself writing a
column that holds a readable code, stop.

*Why it matters:* a database leak with plaintext codes means anyone can claim
every unclaimed piece in the world. With hashes and no pepper, a leak is worth
nothing.

**2. Ownership is an append-only ledger.**
There is no `current_owner` column anywhere, and there must never be one.
Current ownership is derived by reading the newest `OwnershipEvent` for a
piece. Never `UPDATE` or `DELETE` a ledger row.

*Why it matters:* provenance is the product. A column can be overwritten by one
bad query and the history is gone forever. A ledger cannot.

**3. Claiming is one atomic transaction with a conditional write.**
See [`src/lib/db/claim.ts`](../src/lib/db/claim.ts). The update is
`WHERE id = ? AND status = 'UNCLAIMED'`, and the code checks that exactly one
row changed. Two people submitting the same valid code at the same instant
produce exactly one owner.

*Why it matters:* two owners for one physical object is unrecoverable. You
cannot decide after the fact which of two paying customers is lying.

**4. The QR contains only a random token.**
Nothing else. Not the serial, not the claim code, not the internal ID. A
photographed QR must be worthless to the photographer.

**5. Public pages never expose owner personal data.**
Handle only. Never email, never real name. The passport query in
[`src/lib/passport.ts`](../src/lib/passport.ts) is typed so the personal fields
are not even selected — you would have to deliberately add them.

**6. The internal UUID never leaves the database.**
Not in URLs, not in API responses, not in the factory file.

**7. Generated production data is immutable.**
Once a batch is exported for printing, its serials, tokens and code hashes are
frozen. Re-running the generator over an exported batch is a bug, not a
feature, and the generator refuses to do it.

---

## 3. The four identifiers

Four identifiers, four jobs, none derivable from another. This separation is
the whole security model — compromising one tells you nothing about the others.

| | Format | Public? | Job |
|---|---|---|---|
| **Serial** | `SP-014278` | printed, public | human-readable name of the piece |
| **QR token** | 12 chars | public | lookup key in the URL |
| **Claim Code** | `XXX-XXX-XXX` | secret until scratched | proves physical possession |
| **Internal ID** | uuid v4 | never | database primary key |

### Serial

`XX-NNNNNN` — two-letter character code, hyphen, six digits. The digit block
encodes the edition, so ranges can never collide:

| Range | Edition |
|---|---|
| `0xxxxx` | Classic |
| `1xxxxx` | Limited Edition (last 3 digits are the edition number: RF-100045 is 45 of 777) |
| `5xxxxx` | Legendary (DS-500007 is 7 of 10) |
| `8xxxxx` | Spare / replacement |
| `9xxxxx` | Artist Proof — a separate identity, never mixed into the numbered run |

Character codes: SP Superman, BM Batman, HQ Harley Quinn, FL The Flash,
WW Wonder Woman, JK The Joker, SG Supergirl, CY Cyborg, RF Reverse Flash,
BZ Bizarro, CH Cheetah, RD Riddler, GL Green Lantern, DS Deathstroke.

### QR token

12 random characters from `23456789ABCDEFGHJKMNPQRSTUVWXYZ`. The payload is
`https://id.binkis.com/p/{token}` and nothing else — no tracking parameters.

That is not laziness. A short payload keeps the QR at version 3 (29x29
modules), which keeps each module large, which is what lets it scan off
reflective holographic foil. Adding `?utm_source=...` would push the symbol to
a denser version and cost real-world scan reliability on the exact surface
these are printed on.

### Claim Code

9 characters displayed `XXX-XXX-XXX`, for example `7K9-P2M-4XQ`.

Eight random characters from the same 31-character alphabet, plus one check
character. `0`, `O`, `1`, `I` and `L` are excluded so a code cannot be misread
off foil.

The check character is a **GF(31) weighted checksum**, in
[`src/lib/codes/check-character.ts`](../src/lib/codes/check-character.ts).
Every position carries a distinct weight, which means it catches *every* single
character substitution and *every* transposition of two characters — the two
mistakes people actually make when copying a code by hand.

> An earlier version used Luhn mod 31. It was replaced because Luhn's weights
> repeat, which makes it blind to certain transpositions: it silently accepted
> about 1.5% of realistic typos. Do not switch back to Luhn to "simplify" this.

The check character is validated **in the browser**, before anything is sent.
That is deliberate and it matters twice: a typo never reaches the database, and
a typo never burns one of the user's rate-limited attempts.

Security margin: 31^8 is about 8.5 x 10^11 possible codes against roughly
140,000 live ones, so a blind guess has about a 1 in 6 billion chance. **That
number is only meaningful because of rate limiting** (section 6). The two were
designed together; do not weaken one without re-examining the other.

---

## 4. Data model

Prisma schema: [`prisma/schema.prisma`](../prisma/schema.prisma). Migrations
live in `prisma/migrations/` and are applied with `migrate deploy` — never
`db push`, which silently skips the hand-written partial unique indexes.

```
User            id, email, password_hash, handle, role, created_at
Session         id, user_id, hashed_token, expires_at
CollectorId     id, user_id (1:1), display_name, avatar, joined_at, public_profile
Product         id, character, character_code, edition_type, series, rarity,
                run_size, artwork_url
Batch           id, code, product_id, quantity, status, exported_at, checksum
Piece           id (uuid, INTERNAL, never exposed)
                serial          "SP-014278"    unique, printed, public
                qr_token        12 chars       unique, public lookup key
                claim_hash      HMAC-SHA256    unique, never exposed
                product_id, batch_id, edition_number, production_year,
                produced_at, country, status, verified
OwnershipEvent  id, piece_id, seq, from_collector_id, to_collector_id,
                acquired_via, occurred_at                        APPEND ONLY
PassportEvent   id, piece_id, seq, type, title, body, actor, occurred_at,
                metadata jsonb
Transfer        id, piece_id, from_collector_id, to_email, to_collector_id,
                status, created_at, resolved_at
AuditLog        id, actor, action, entity, before jsonb, after jsonb, ip, at
ClaimAttempt    id, ip, qr_token, succeeded, at            rate limiting input
```

`Piece.status` — `unclaimed | claimed | void | reserved`.

`PassportEvent.type` — `BORN`, `CLAIMED`, `TRANSFERRED`, `MILESTONE`,
`OFFICIAL_EVENT`, `VERIFICATION`, `VOIDED`. An eighth type needs no schema
change: `metadata` is jsonb precisely so new event types carry their own extra
fields without a migration.

Two constraints do real work and should be understood before anyone touches
them:

- `@@unique([pieceId, seq])` on `OwnershipEvent` — the last line of defence
  against a double claim. Even if the conditional write were somehow bypassed,
  a duplicate ownership row is physically impossible at the database level.
- `unique` on `serial`, `qr_token` and `claim_hash` — uniqueness is enforced by
  Postgres, not by application code checking first. Application-level checks
  race; constraints do not.

---

## 5. Public surface

### `GET /p/{qr_token}` — the passport page

The only truly public entry point, and the one every scan lands on.
Server-rendered, cacheable, no authentication. Returns HTML.

- **Unclaimed piece** — shows the record, a clear "this BINKI has not been
  claimed yet" state, and the CLAIM action.
- **Claimed piece** — full record, verified badge, edition position, production
  data, **owner handle only**, and the complete event timeline.
- **Unknown token** — 404. It does not distinguish "never existed" from
  "voided", because that difference is nobody's business.

### Other routes

| Route | Auth | Purpose |
|---|---|---|
| `/` | — | landing page |
| `/p/{token}` | — | passport (above) |
| `/signup`, `/login` | — | account creation and sign-in |
| `/collection` | user | pieces owned by the signed-in collector |
| `/transfers` | user | outgoing and incoming transfers |
| `/admin`, `/admin/pieces`, `/admin/batches`, `/admin/audit` | admin | administration |
| `GET /api/admin/export` | admin | CSV/Excel export |

### There is no public JSON API yet

Everything above is server-rendered HTML or a server action. Mutations are
Next.js **server actions**, not REST endpoints — they live in
`src/app/actions/`.

If a partner, a mobile app or a marketplace ever needs machine-readable piece
data, the right shape is a read-only `GET /api/p/{qr_token}` returning the same
fields the passport page already shows publicly. That is a small, contained
job — the query and its privacy-safe return type already exist in
[`src/lib/passport.ts`](../src/lib/passport.ts) and would need only a JSON
wrapper. **The rule it must follow: return exactly what the public page shows.
No internal ID, no email, no real name, no claim hash.**

---

## 6. Rate limiting

[`src/lib/db/rate-limit.ts`](../src/lib/db/rate-limit.ts). Two independent
limits, because there are two different attacks.

**By IP** — one machine working through many pieces. Progressive lockout based
on failures in the last hour:

| Failures | Lockout |
|---|---|
| 5 | 1 minute |
| 10 | 5 minutes |
| 20 | 30 minutes |
| 40 | 2 hours |

**By piece** — many machines working on one piece. Eight failures in an hour
locks that piece for 30 minutes. An IP-only limit does nothing against a
distributed attack, and a distributed attack on a Legendary (10 in existence)
is exactly the shape a real attack would take.

Three details that look like details and are not:

- A **blocked** attempt is not recorded. Otherwise an attacker extends their
  own lockout forever by continuing to knock — and worse, a third party could
  lock a piece away from its real owner indefinitely.
- A malformed code never reaches the limiter at all, so a typo costs nothing.
- The per-IP lockout tells the user how long to wait. The per-**piece** lockout
  returns the generic failure instead, because saying "too many attempts" there
  would tell an attacker which pieces are already being worked on.

### The claim endpoint is not an oracle

Wrong code, already-claimed piece, valid code aimed at the wrong piece, and
unknown token all return one byte-identical failure message. If they differed,
anyone with a phone could enumerate which claim codes exist across the entire
production run. Keep it that way.

---

## 7. Batch generator

[`scripts/generate-batch.ts`](../scripts/generate-batch.ts) — the tool that
blocks physical manufacturing. Six stages, and it refuses to export unless all
six pass:

1. **Allocate** serials in the correct edition range.
2. **Mint** QR tokens and claim codes; insert with uniqueness enforced by
   database constraints.
3. **Render** every QR to SVG.
4. **Decode** every rendered QR with an independent decoder written from
   scratch against ISO/IEC 18004, and confirm it resolves to the intended URL.
5. **Rehearse** — claim every generated code against a throwaway staging
   database, assert each opens *its own* piece, then wipe staging.
6. **Export** the `.xlsx`, wrap it in an AES-256-GCM archive, print the SHA-256
   checksum and the row count.

Stage 4 exists because a QR that encodes correctly but renders wrong is
invisible until 134,399 stickers are printed. Stage 5 exists because a code
that opens the *wrong* piece is worse than a code that opens nothing, and no
amount of reading the code catches cross-wiring — you have to actually try it.

Factory export columns:
`LINE | PIECE_NUMBER | QR_URL | CLAIM_CODE | CHARACTER | EDITION | BATCH`

**The archive password is `FACTORY_EXPORT_KEY`, and it must travel to the
factory on a different channel than the file itself.** Sending both through the
same WhatsApp thread means one compromised account hands over every claim code
in the batch.

### Batch B-2026-01

SP-000001 to SP-000200, Superman Classic, generated and verified. Archive
SHA-256 `89747e5e...300fe4`. Confirmed live end to end: the real QR on the
sticker resolves to `https://id.binkis.com/p/G55JT7ECRC4P` and opens Superman
SP-000001.

---

## 8. Running it

### Stack

Next.js 15 (App Router, React Server Components), TypeScript strict,
Tailwind v4, PostgreSQL 16 with Prisma 6, argon2id password hashing, Zod on
every input. Deployed with Docker Compose behind Caddy, which handles TLS
automatically.

Prisma is **pinned to 6.x**. Version 7 removed the datasource `url` option in
favour of driver adapters, which is a real migration, not a version bump.

### Local development

```bash
npm install
cp .env.example .env

openssl rand -base64 48    # -> CLAIM_CODE_PEPPER
openssl rand -base64 32    # -> FACTORY_EXPORT_KEY

node scripts/dev-db.ts     # boots PostgreSQL 16, applies migrations, stays running
npm run dev
```

### Tests

```bash
npx vitest run      # 153 tests: units, and logic against real PostgreSQL
npm run test:e2e    # 22 tests: the claim and transfer flows in a real browser
```

`tests/unit/` needs nothing. `tests/db/` needs real PostgreSQL and the harness
boots one for you.

`npm run test:e2e` boots its own throwaway PostgreSQL, applies the migrations,
mints pieces with the real generator, builds the app and serves it exactly the
way production does - `node .next/standalone/server.js`, not `next start`,
because `next start` does not work with `output: 'standalone'` and a suite that
tests a different server than the one that ships can go green over a broken
deployment. The claim spec also runs at 360px, because that is where a scan in
a shop actually happens.

These are the only tests that see plaintext claim codes: the e2e seed mints
them and hands them to the run in memory, then deletes the file on teardown.
The seed refuses to run against any database that is not local, not named for
testing, or that holds an exported batch. Per CLAUDE.md: write the test *before* the logic for
anything touching codes, claiming, or ownership, and never mock a security
control to make a test pass.

### Environment

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection |
| `STAGING_DATABASE_URL` | throwaway database for generator stage 5 |
| `CLAIM_CODE_PEPPER` | HMAC key for claim hashes — **see the warning below** |
| `FACTORY_EXPORT_KEY` | AES-256 password for factory archives |
| `BACKUP_KEY` | AES-256 password for nightly backups |
| `PUBLIC_ORIGIN` | `https://id.binkis.com` — used in QR payloads |

> ### Losing `CLAIM_CODE_PEPPER` bricks every unclaimed piece on Earth.
>
> Claim hashes cannot be recomputed without it, so no printed code would ever
> match again, and the plaintext codes exist only on stickers already inside
> sealed boxes. There is no recovery procedure. It lives in
> `/opt/binkis-id/.env` on the VPS, mode 600, and it must also exist somewhere
> that is not that server. Rotating it is only possible by regenerating every
> unclaimed piece, which means reprinting every unsold sticker.

No secrets in the repository, ever. `.env.example` only.

### Deploying

```bash
./scripts/deploy.sh
```

Builds, applies migrations through a one-shot `migrate` service, then restarts
the app. Migrations run in their own service because the standalone Next.js
build does not carry the Prisma CLI's dependencies.

Compose services: `db`, `migrate` (one-shot), `app`, `caddy`.

---

## 9. Backups

Nightly at 03:15 UTC via `/etc/cron.d/binkis-backup`, running
`/opt/binkis-id/backup.sh`: `pg_dump`, then gzip, then AES-256-CBC, into
`/opt/binkis-id/backups`. Fourteen dailies are retained.

Encrypted with `BACKUP_KEY`, which is deliberately **separate** from
`CLAIM_CODE_PEPPER`: a backup is meant to travel off the machine, and the
pepper is meant never to leave it. If both used the same key, copying a backup
to cloud storage would also be copying the pepper.

The dump uses `--clean --if-exists` so it restores over an existing database
without hand-editing the file at the worst possible moment.

### Restoring

```bash
KEY=$(grep '^BACKUP_KEY=' /opt/binkis-id/.env | cut -d= -f2-)
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass "pass:$KEY" \
  -in /opt/binkis-id/backups/binkis_id-TIMESTAMP.sql.gz.enc \
  | gunzip \
  | docker exec -i binkis-id-db-1 psql -U binkis -d binkis_id
```

This has been tested by restoring into a scratch database and confirming all
200 pieces and 200 distinct claim hashes came back intact. **Do it once
yourself**, so that the first time you run it is not during an actual
emergency.

> **Still open:** backups sit on the same droplet as the database. That
> protects against a bad migration or a dropped table; it does **not** protect
> against losing the droplet. Copying the encrypted dumps to off-box storage
> (DigitalOcean Spaces, S3, anything with credentials) is the remaining piece,
> and it is a small job — the files are already encrypted and safe to copy
> anywhere.

---

## 10. Known gaps

Stated plainly, so nobody discovers them the hard way.

1. **Backups are on-box only.** See above. This is the highest-value hour of
   work left in the system.
2. **No email notifications.** A pending transfer waits silently until the
   recipient happens to visit the site. The transfer itself is correct and
   completes on signup; the person simply is not told it is waiting.
3. **Void-on-scrap and reserved-until-delivery are not built.** The `void` and
   `reserved` statuses exist in the schema and an admin can set them by hand,
   but there is no workflow around them.
4. **Only 200 pieces generated.** The full run is 134,399 plus 3,000 spares.
   The generator has been tested at scale, but the real run has not happened.

---

## 11. If something goes wrong

**A collector says their code does not work.**
Check `AuditLog` for `CLAIM_FAILED` on that `qr_token`. The recorded reason
distinguishes a wrong code from an already-claimed piece — that difference is
withheld from the *user* on purpose, but it is in the audit trail for you. Also
check whether they are simply rate-limited.

**Two people claim the same piece.**
They cannot, and the ledger will show it. Read `OwnershipEvent` for that
`piece_id` ordered by `seq`. The first row is the true first owner.

**A piece needs its ownership corrected.**
Append a new `OwnershipEvent`. Never edit or delete the old one. The wrong
history is part of the history.

**The site is down.**
`docker compose ps` on the VPS. Caddy handles TLS itself; if certificates are
the problem, `docker compose restart caddy` — an ACME failure can leave it in a
long backoff even after the underlying cause (usually DNS) is fixed.

**You need to know what an admin did.**
Every admin action writes an `AuditLog` row with before and after state.
`/admin/audit` in the browser.

---

*Handover prepared by Goodman Dylan Lee. Contactable for questions after
delivery.*
