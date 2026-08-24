# BINKIS ID

Digital identity registry for physical collectible figures. Every physical BINKI carries a hologram sticker with a printed serial, a QR code, and a Claim Code hidden under a scratch panel. Scanning the QR opens that piece's public page. Scratching and entering the code proves physical possession and registers ownership.

The physical object is the collectible. This system is its permanent memory. Owners change, the piece's identity and history never do.

Live at `id.binkis.com`. Client is David (BINKIS, Mexico). Launch date 30 September 2026.

## Non-negotiables

Read these before writing any code. They are the parts that cannot be fixed later.

1. **Claim Codes are stored only as a keyed hash (HMAC-SHA256 with a server-side pepper).** Never store, log, or return plaintext. The only place plaintext exists is the one-time encrypted export for the factory.
2. **Ownership is an append-only ledger.** There is no `current_owner` column on the piece. Current ownership is derived from the latest ledger row. Never UPDATE or DELETE a ledger row.
3. **Claiming is a single atomic transaction** with a conditional write. Two simultaneous claims with the same valid code must produce exactly one winner and one deterministic rejection. Never a duplicate ownership row.
4. **The QR contains only a random token.** Never the serial, never the Claim Code, never the internal ID. A photographed QR must be worthless.
5. **Public pages never expose owner personal data.** Display handle only, never email or real name.
6. **The internal ID never leaves the database.** Not in URLs, not in API responses, not in the factory file.
7. **Generated production data is immutable.** Once a batch is exported for printing, its serials, tokens and code hashes are frozen. Regeneration is a bug, not a feature.

## Stack

- Next.js 15 (App Router), TypeScript strict, React Server Components by default
- Tailwind CSS v4, no component library, hand-built UI
- PostgreSQL 16 with Prisma
- Auth: Lucia or Auth.js with email and password, sessions in Postgres, argon2id hashing
- Zod for all input validation, server actions for mutations
- Deployment: Docker Compose on the client's VPS (Ubuntu 24.04), Caddy in front for automatic TLS
- Tests: Vitest for the code generator and claim logic, Playwright for the claim and transfer flows

Keep it boring and modular. No microservices, no Kubernetes, no blockchain. 134,399 rows is small for Postgres. What makes this scale is that public pages are read-heavy and cacheable.

## Data model

```
User            id, email, password_hash, handle, created_at
CollectorId     id, user_id (1:1), display_name, avatar, joined_at, public_profile bool
Product         id, character, character_code, edition_type, series, rarity, run_size, artwork_url
Batch           id, code, product_id, quantity, status, exported_at, checksum
Piece           id (uuid, INTERNAL, never exposed)
                serial          e.g. "SP-014278"   unique, printed, public
                qr_token        12 chars           unique, public lookup key
                claim_hash      HMAC-SHA256        unique, never exposed
                product_id, batch_id, edition_number, production_year, produced_at
                country, status (unclaimed|claimed|void|reserved), verified bool
OwnershipEvent  id, piece_id, seq, from_collector_id, to_collector_id,
                acquired_via (claim|transfer), occurred_at        APPEND ONLY
PassportEvent   id, piece_id, seq, type, title, body, actor, occurred_at, metadata jsonb
AuditLog        id, actor, action, entity, before jsonb, after jsonb, ip, at
ClaimAttempt    id, ip, qr_token, succeeded, at        for rate limiting
```

`PassportEvent.type` enum, the seven event types:
`BORN`, `CLAIMED`, `TRANSFERRED`, `MILESTONE`, `OFFICIAL_EVENT`, `VERIFICATION`, `VOIDED`

Adding an eighth type later must require no schema change.

## Identifiers

Four identifiers, four jobs, none derivable from another.

**Serial** — `XX-NNNNNN`. Two-letter character code, hyphen, six digits. The digit block encodes the edition so ranges can never collide:

| Range | Edition |
|---|---|
| `0xxxxx` | Classic |
| `1xxxxx` | Limited Edition (last 3 digits = edition number, RF-100045 is 45 of 777) |
| `5xxxxx` | Legendary (DS-500007 is 7 of 10) |
| `8xxxxx` | Spare / replacement |
| `9xxxxx` | Artist Proof (separate identity, never mixed into the numbered run) |

Character codes: SP Superman, BM Batman, HQ Harley Quinn, FL The Flash, WW Wonder Woman, JK The Joker, SG Supergirl, CY Cyborg, RF Reverse Flash, BZ Bizarro, CH Cheetah, RD Riddler, GL Green Lantern, DS Deathstroke.

Production run: 130,000 Classic across 8 characters, 5 Limited Editions of 777, 5 A/P sets of 100, Deathstroke Legendary 10 plus 4 A/P. Total 134,399, plus 3,000 spares.

**QR token** — 12 random chars, alphabet `23456789ABCDEFGHJKMNPQRSTUVWXYZ`. Payload is `https://id.binkis.com/p/{token}` and nothing else. No tracking params. Short payload keeps QR module size large, which is what makes it scan off reflective holographic foil.

**Claim Code** — 9 chars displayed `XXX-XXX-XXX`, e.g. `7K9-P2M-4XQ`. Eight random from the same 31-char alphabet (0/O/1/I/L excluded so it can't be misread off foil), plus one check character (weighted checksum over GF(31): `check = -Σ wᵢ·xᵢ mod 31`, weights 2..9 on the payload and 1 on the check character itself). The check character is validated client-side so a typo never reaches the database and never burns a rate-limited attempt. Because 31 is prime and every weight is distinct and non-zero, this detects **every** single-character substitution and **every** transposition, adjacent or not. A code only claims the piece it was minted for, so the figure that matters is one guess in ~850 billion against a specific piece.

> Shortened from 11 characters to 9 at the client's request on 24 August 2026, to reduce typing on a phone, and before any print run. Nine is the floor: the binding constraint is not guessing but PARTIAL DISCLOSURE, since scratch panels get rubbed in transit and photographed half-open. At 9 characters a half-revealed code still leaves ~923,000 combinations; at 7 it leaves ~30,000.

> Changed from Luhn mod 31, which this file originally specified, with the client's approval on 20 August 2026 and before any print run. Luhn's error-detection guarantee depends on an *even* modulus; over 31 its doubling map sends both `x` and `x+15` to the same value, so it leaked about 1.5% of single-character typos and missed the `2`/`Z` transposition. Same single printed character, same factory spec, strictly stronger. See `src/lib/codes/check-character.ts`.

**Internal ID** — uuid v4, database only.

## Core flows

**Scan** — `GET /p/{qr_token}`. Server-rendered, cacheable, no auth. Unclaimed pieces show the record plus a clear "This BINKI has not been claimed yet" state and a CLAIM YOUR BINKI action. Claimed pieces show the full record, verified status, owner handle only, and the complete event timeline.

**Claim** — check character validated client-side, then server action: hash the submitted code, look up by hash, verify it belongs to this piece, then in one transaction assert `status = 'unclaimed'`, flip to claimed, insert the OwnershipEvent and the `CLAIMED` PassportEvent, write the audit row. Rate limit per IP with progressive lockout. Wrong code, already-claimed and code-belongs-to-another-piece must all return the same generic failure so the endpoint can't be used as an oracle.

**Transfer** — current owner initiates to an email or handle, receiver confirms. Never overwrite. New OwnershipEvent plus `TRANSFERRED` PassportEvent. If the receiver has no account, the transfer stays pending and completes on signup.

**Admin** — products, batches, pieces, users, claims, transfers, void a piece, manual verification, CSV/Excel import and export, audit history. Separate role, every action audited.

**Batch generator (CLI, milestone 1, build this first)** — generates serials, tokens, codes and hashes for a range, enforces uniqueness at the database constraint level, renders every QR and machine-decodes it back to confirm it resolves to the intended URL, claims every generated code against a staging database and then resets, and exports an `.xlsx` for the factory with columns `LINE | PIECE_NUMBER | QR_URL | CLAIM_CODE | CHARACTER | EDITION | BATCH`, delivered as an AES-256 archive with a SHA-256 checksum and row count.

## Frontend

The client cares about this deeply and is comparing against a polished competitor demo. Treat the UI as a product surface, not a CRUD skin.

**Aesthetic** — dark, premium, collector-grade. Near-black base with a subtle grid or noise texture, not flat grey. Restrained use of a single luminous accent. Rarity is the only place colour runs loud: Common through Mythic each get their own tone and they should feel like a tier system, not decoration. Holographic and iridescent gradients are on-brand, because that is what the physical hologram looks like, but use them as accents on rarity chips and verified badges, never as page backgrounds.

**Typography** — one strong display face for character names and serials, one clean sans for body. Serials, tokens and codes always monospaced with tabular figures. The serial is a hero element, set it large.

**The claim moment is the product.** Scan to scratch to claim is the emotional core. Make it feel like opening something. Deliberate pacing, a real reveal on success, the Passport visibly flipping to VERIFIED. Do not let it feel like a form submission. On the demo page, a scratchable canvas foil overlay the user actually drags to reveal.

**Passport page** — reads like a certificate. Character artwork, serial, rarity, verified badge, edition position (45 / 777), production data, then the event timeline as a vertical rail with typed icons and sequence numbers. Verified provenance should look like the valuable thing it is.

**My Collection** — grid of owned pieces with rarity borders, collection progress bars per series, counts for owned, verified and distinct series. Empty state is an invitation to claim, not a blank page.

**Motion** — purposeful only. Staggered entry on grids, spring on the claim reveal, `prefers-reduced-motion` respected everywhere. No looping ambient animation.

**Mobile first, genuinely.** Nearly every scan is a phone in a shop or at a table, often one-handed and in bad light. Large tap targets, big legible code input with auto-uppercase, auto-hyphen and numeric-friendly keyboard, works at 360px, no horizontal scroll.

Spanish and English from day one, with the language layer in place so more can be added.

## Build order

1. Batch generator and factory export, with tests. This is the urgent deliverable and blocks physical manufacturing.
2. Schema, migrations, seed data, auth, Collector ID.
3. Public passport page, scan, claim flow.
4. My Collection, transfers.
5. Admin dashboard, import and export, audit.
6. Deploy to VPS with Docker and Caddy, plus a handover document with the schema and public API.

Deploy to the VPS from step 1 so the client can watch progress on a live URL and correct direction early.

## Working style

- Small commits, one concern each, conventional commit messages
- Write the test before the logic for anything touching codes, claiming, or ownership
- Never mock a security control to make a test pass
- Ask before adding a dependency
- No secrets in the repo, `.env.example` only
- Prefer server components; reach for client components only where interaction requires it
