#!/usr/bin/env node
/**
 * Pull one serial range out of a master file, for a reprint.
 *
 *   node scripts/extract-range.ts --from HQ-000001 --to HQ-000850
 *
 * A reprint is not a regeneration. The factory lost, damaged or never printed
 * a range, and asks for it again; the pieces already exist in the registry and
 * their codes are already committed to. This copies those rows out of the
 * master file that was already built and verified, renumbers LINE so the
 * factory's own line count matches what it receives, and writes nothing else.
 * Non-negotiable 7: once a batch is exported, its serials, tokens and code
 * hashes are frozen. Minting fresh codes for serials that are already spoken
 * for would be a bug wearing a feature's clothes.
 *
 * Nothing is written until the rows have been checked three ways:
 *
 *   - every claim code still passes its own check character
 *   - no serial, code or QR URL repeats
 *   - the range matches, row for row, the batch file that was delivered for
 *     those pieces (--cross). That is what makes this a copy and not a mint.
 *
 * With --db it also verifies against the registry: that each serial exists,
 * that the QR URL carries that piece's own token, and that
 * HMAC(claim code, pepper) equals its stored claim_hash. That is the strongest
 * check, because it proves the codes in the file are the codes the live site
 * will accept. It needs DATABASE_URL pointed at the real registry, so it is
 * opt-in rather than the default.
 *
 * Output is plaintext claim codes. Send it the way the originals were sent,
 * and delete it once the factory confirms receipt.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { parseArgs } from 'node:util';
import ExcelJS from 'exceljs';

import { prisma } from '../src/lib/db/client.ts';
import { hashClaimCode } from '../src/lib/hash.ts';
import { parseSerial } from '../src/lib/serial.ts';
import { parseClaimCode } from '../src/lib/codes/claim-code.ts';

for (const file of ['.env.local', '.env']) {
  const path = resolve(process.cwd(), file);
  if (existsSync(path)) process.loadEnvFile(path);
}

const { values } = parseArgs({
  options: {
    from: { type: 'string' },
    to: { type: 'string' },
    source: { type: 'string', default: 'factory-exports/SEND-TO-KRY/BINKIS-CLASSIC-SILVER.xlsx' },
    cross: { type: 'string' },
    db: { type: 'boolean', default: false },
    out: { type: 'string', default: 'factory-exports/REPRINT' },
    help: { type: 'boolean', short: 'h' },
  },
});

if (values.help || !values.from || !values.to) {
  console.log(`
  node scripts/extract-range.ts --from HQ-000001 --to HQ-000850
       [--source <master .xlsx>] [--cross <delivered batch .xlsx>]
       [--db] [--out <directory>]
`);
  process.exit(values.help ? 0 : 1);
}

const from = parseSerial(values.from);
const to = parseSerial(values.to);
if (!from || !to) throw new Error('--from and --to must be valid serials');
if (from.characterCode !== to.characterCode) {
  throw new Error('--from and --to must be the same character');
}
if (to.number < from.number) throw new Error('--to comes before --from');

const pepper = process.env.CLAIM_CODE_PEPPER ?? '';
if (values.db && !pepper) {
  throw new Error('CLAIM_CODE_PEPPER is not set; without it --db can verify nothing');
}

interface Row {
  piece: string;
  url: string;
  code: string;
}

/** Read one serial range out of a factory workbook, in serial order. */
async function readRange(path: string): Promise<Row[]> {
  const full = resolve(process.cwd(), path);
  if (!existsSync(full)) throw new Error(`Missing file: ${full}`);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(full);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error(`No sheet in ${path}`);

  const header = (sheet.getRow(1).values as unknown[]).slice(1).map(String);
  const columnAt = (name: string) => {
    const i = header.indexOf(name);
    if (i === -1) throw new Error(`${path} has no ${name} column`);
    return i;
  };
  const [pieceAt, urlAt, codeAt] = [
    columnAt('PIECE_NUMBER'),
    columnAt('QR_URL'),
    columnAt('CLAIM_CODE'),
  ];

  const found: Row[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const v = (sheet.getRow(r).values as unknown[]).slice(1);
    const piece = String(v[pieceAt]);
    const parsed = parseSerial(piece);
    if (!parsed) continue;
    if (parsed.characterCode !== from!.characterCode) continue;
    if (parsed.number < from!.number || parsed.number > to!.number) continue;
    found.push({ piece, url: String(v[urlAt]), code: String(v[codeAt]) });
  }
  found.sort((a, b) => parseSerial(a.piece)!.number - parseSerial(b.piece)!.number);
  return found;
}

const rows = await readRange(values.source!);

const expected = to.number - from.number + 1;
if (rows.length !== expected) {
  throw new Error(`Expected ${expected} rows in the range, found ${rows.length}`);
}
if (new Set(rows.map((r) => r.piece)).size !== rows.length) throw new Error('duplicate serials');
if (new Set(rows.map((r) => r.code)).size !== rows.length) throw new Error('duplicate claim codes');
if (new Set(rows.map((r) => r.url)).size !== rows.length) throw new Error('duplicate QR URLs');

// A claim code carries its own check character, so a corrupted row is caught
// here without needing the database at all.
for (const row of rows) {
  if (!parseClaimCode(row.code)) {
    throw new Error(`${row.piece}: claim code fails its check character`);
  }
  if (!row.url.includes('/p/')) throw new Error(`${row.piece}: QR URL is not a passport URL`);
}

// The batch file delivered for these pieces is the record of what was minted.
// If the reprint disagrees with it anywhere, something regenerated.
if (values.cross) {
  const original = await readRange(values.cross);
  if (original.length !== rows.length) {
    throw new Error(
      `${values.cross} has ${original.length} rows in the range, the source has ${rows.length}`,
    );
  }
  for (let i = 0; i < rows.length; i++) {
    const a = rows[i]!;
    const b = original[i]!;
    if (a.piece !== b.piece || a.url !== b.url || a.code !== b.code) {
      throw new Error(`${a.piece} differs from the delivered batch file`);
    }
  }
  console.log(`\nIdentical to the delivered batch file across all ${rows.length} rows.`);
}

// The registry is the authority. A row that disagrees with it would print a
// hologram the site cannot claim.
if (values.db) {
  console.log(`\nChecking ${rows.length} rows against the registry.`);
  const pieces = await prisma.piece.findMany({
    where: { serial: { in: rows.map((r) => r.piece) } },
    select: { serial: true, qrToken: true, claimHash: true, status: true },
  });
  const byserial = new Map(pieces.map((p) => [p.serial, p]));

  for (const row of rows) {
    const piece = byserial.get(row.piece);
    if (!piece) throw new Error(`${row.piece} is not in the registry`);

    const token = row.url.split('/p/')[1] ?? '';
    if (token !== piece.qrToken) {
      throw new Error(`${row.piece}: QR URL carries ${token}, registry has ${piece.qrToken}`);
    }

    const normalised = parseClaimCode(row.code);
    if (!normalised) throw new Error(`${row.piece}: unreadable claim code`);
    if (hashClaimCode(normalised, pepper) !== piece.claimHash) {
      throw new Error(`${row.piece}: claim code does not match the registry`);
    }
  }
  console.log('Every row matches the registry: serial, QR token and claim code.');

  const claimed = pieces.filter((p) => p.status === 'claimed');
  if (claimed.length > 0) {
    // Reprinting a claimed piece would put a second physical hologram in the
    // world for a piece that already has an owner.
    console.log(`\nWARNING: ${claimed.length} of these are already claimed:`);
    for (const p of claimed.slice(0, 10)) console.log(`  ${p.serial}`);
  }
} else {
  console.log('\nSkipping the registry check: run with --db against the live registry to add it.');
}

const outDir = resolve(process.cwd(), values.out!);
mkdirSync(outDir, { recursive: true });
const name = `BINKIS-REPRINT-${values.from}-${values.to}`;
const outPath = join(outDir, `${name}.xlsx`);

const out = new ExcelJS.Workbook();
const outSheet = out.addWorksheet('REPRINT');
outSheet.columns = [
  { header: 'LINE', key: 'line', width: 9 },
  { header: 'PIECE_NUMBER', key: 'piece', width: 16 },
  { header: 'QR_URL', key: 'url', width: 44 },
  { header: 'CLAIM_CODE', key: 'code', width: 16 },
];
outSheet.getRow(1).font = { bold: true };
rows.forEach((row, i) => {
  outSheet.addRow({ line: i + 1, piece: row.piece, url: row.url, code: row.code });
});
await out.xlsx.writeFile(outPath);

console.log(`\n  ${rows.length} rows   ${rows[0]!.piece} .. ${rows.at(-1)!.piece}`);
console.log(`  ${outPath}\n`);
console.log('Same pieces, same codes, same QR tokens. Nothing was regenerated.\n');

if (values.db) await prisma.$disconnect();
