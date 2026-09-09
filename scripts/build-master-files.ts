#!/usr/bin/env node
/**
 * Three master files, one per hologram design.
 *
 *   SILVER  Classic      130,000
 *   GOLD    Limited + Artist Proof for those five characters
 *   BLACK   Legendary + its Artist Proof
 *
 * The factory asked for exactly this and said so plainly: "Just send the
 * design pictures and the corresponding data." They print by design, not by
 * character, so a file per character was making them do a join in their head
 * across twenty-six spreadsheets. One file per design is how they work.
 *
 * The first 400 Superman are folded in here too, so there is one official
 * Classic dataset rather than a master file plus two earlier samples that
 * someone has to remember to also print.
 *
 * Nothing is generated. Every row comes from a batch that was already minted,
 * verified and exported, and this only merges and renumbers LINE. Regenerating
 * would mint different codes for serials already committed to. Non-negotiable
 * 7.
 *
 *   node scripts/build-master-files.ts
 */

import ExcelJS from 'exceljs';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { parseClaimCode } from '../src/lib/codes/claim-code.ts';
import { parseSerial, formatSerial, EDITION_RANGES } from '../src/lib/serial.ts';
import { parseQrToken } from '../src/lib/codes/qr-token.ts';

const ROOT = resolve('factory-exports');

/**
 * Two folders, named so nobody has to remember which is which.
 *
 * SEND-TO-KRY holds the six files the factory receives, one per hologram
 * design. Everything else lives under _SOURCE-DO-NOT-SEND: the per-character
 * exports these are merged from, the earlier 400-piece Superman samples, and
 * the encrypted archives. All of it is superseded for sending and none of it
 * should ever reach the factory, because sending a stale file is how the
 * wrong batch gets printed.
 */
const SOURCE = join(ROOT, '_SOURCE-DO-NOT-SEND');
const FULL = join(SOURCE, 'FULL-RUN', 'deliver');
const OUT = join(ROOT, 'SEND-TO-KRY');

interface Row {
  piece: string;
  url: string;
  code: string;
}

interface MasterFile {
  name: string;
  colour: string;
  description: string;
  sources: string[];
  expected: number;
}

/**
 * Superman's 400 come first and in order, because they are SP-000001 to
 * SP-000400 and the rest of Superman continues from SP-000401. Ordering the
 * file by character then serial means the press runs a character at a time,
 * which is how the boxes are packed.
 */
const MASTERS: MasterFile[] = [
  {
    name: 'BINKIS-CLASSIC-SILVER',
    colour: 'SILVER',
    description: 'Classic, 8 characters',
    sources: [
      join(SOURCE, 'B-2026-01', 'B-2026-01-PRINT.xlsx'),
      join(SOURCE, 'B-2026-02', 'B-2026-02-PRINT.xlsx'),
      join(FULL, '1-CLASSIC', 'B-2026-SP-CLASSIC-PRINT.xlsx'),
      join(FULL, '1-CLASSIC', 'B-2026-BM-CLASSIC-PRINT.xlsx'),
      join(FULL, '1-CLASSIC', 'B-2026-HQ-CLASSIC-PRINT.xlsx'),
      join(FULL, '1-CLASSIC', 'B-2026-FL-CLASSIC-PRINT.xlsx'),
      join(FULL, '1-CLASSIC', 'B-2026-WW-CLASSIC-PRINT.xlsx'),
      join(FULL, '1-CLASSIC', 'B-2026-JK-CLASSIC-PRINT.xlsx'),
      join(FULL, '1-CLASSIC', 'B-2026-SG-CLASSIC-PRINT.xlsx'),
      join(FULL, '1-CLASSIC', 'B-2026-CY-CLASSIC-PRINT.xlsx'),
    ],
    expected: 130_000,
  },
  {
    name: 'BINKIS-LIMITED-GOLD',
    colour: 'GOLD',
    description: 'Limited Edition 777 each, plus Artist Proof',
    sources: [
      join(FULL, '2-LIMITED', 'B-2026-RF-LIMITED-PRINT.xlsx'),
      join(FULL, '2-LIMITED', 'B-2026-BZ-LIMITED-PRINT.xlsx'),
      join(FULL, '2-LIMITED', 'B-2026-CH-LIMITED-PRINT.xlsx'),
      join(FULL, '2-LIMITED', 'B-2026-RD-LIMITED-PRINT.xlsx'),
      join(FULL, '2-LIMITED', 'B-2026-GL-LIMITED-PRINT.xlsx'),
      join(FULL, '3-ARTIST-PROOF', 'B-2026-RF-ARTISTPROOF-PRINT.xlsx'),
      join(FULL, '3-ARTIST-PROOF', 'B-2026-BZ-ARTISTPROOF-PRINT.xlsx'),
      join(FULL, '3-ARTIST-PROOF', 'B-2026-CH-ARTISTPROOF-PRINT.xlsx'),
      join(FULL, '3-ARTIST-PROOF', 'B-2026-RD-ARTISTPROOF-PRINT.xlsx'),
      join(FULL, '3-ARTIST-PROOF', 'B-2026-GL-ARTISTPROOF-PRINT.xlsx'),
    ],
    expected: 4_385,
  },
  {
    name: 'BINKIS-VARIANT-BLUE',
    colour: 'BLUE',
    // One design across all four characters. The client said so plainly:
    // "usamos el mismo tipo de holograma para los 4 personajes; solamente
    // cambia la abreviatura y numeracion." So it is one file, and the serial
    // is what keeps the four apart.
    description: 'Variant, 4 characters at 2,777 each',
    sources: [
      join(FULL, '5-VARIANT', 'B-2026-BZ-VARIANT-PRINT.xlsx'),
      join(FULL, '5-VARIANT', 'B-2026-BM-VARIANT-PRINT.xlsx'),
      join(FULL, '5-VARIANT', 'B-2026-HQ-VARIANT-PRINT.xlsx'),
      join(FULL, '5-VARIANT', 'B-2026-JK-VARIANT-PRINT.xlsx'),
    ],
    expected: 11_108,
  },
  {
    name: 'BINKIS-RARE-GREEN',
    colour: 'GREEN',
    description: 'Rare, Brainiac',
    sources: [join(FULL, '6-RARE-SUPERRARE', 'B-2026-BR-RARE-PRINT.xlsx')],
    expected: 7_777,
  },
  {
    name: 'BINKIS-SUPERRARE-RED',
    colour: 'RED',
    description: 'Super Rare, Poison Ivy',
    sources: [join(FULL, '6-RARE-SUPERRARE', 'B-2026-PI-SUPERRARE-PRINT.xlsx')],
    expected: 2_222,
  },
  {
    name: 'BINKIS-LEGENDARY-BLACK',
    colour: 'BLACK',
    // Deathstroke's four Artist Proofs travel with the Legendary, not the
    // Gold file: they are Deathstroke pieces and share its design.
    description: 'Legendary 10, plus its 4 Artist Proof',
    sources: [
      join(FULL, '4-LEGENDARY', 'B-2026-DS-LEGENDARY-PRINT.xlsx'),
      join(FULL, '3-ARTIST-PROOF', 'B-2026-DS-ARTISTPROOF-PRINT.xlsx'),
    ],
    expected: 14,
  },
];

/**
 * Bring a serial up to the current printed format.
 *
 * The batches were exported when Legendary printed as DS-G00007 and an Artist
 * Proof as RF-P00045. On 9 September the client asked for DS-00007 and
 * RF-AP00045, before either had been printed, and the production database was
 * migrated to match.
 *
 * The exported files still hold the old strings, so they are converted here
 * rather than by editing the exports: the piece is the same piece, only its
 * printed name changed. It is rebuilt through formatSerial so the file and the
 * registry cannot drift apart - if the rule changes again, this follows.
 */
const LEGACY = /^([A-Z]{2})-([GP])(\d{5})$/;

function normaliseSerial(serial: string): string {
  if (parseSerial(serial)) return serial;

  const match = LEGACY.exec(serial);
  if (!match) throw new Error(`Cannot read serial ${serial}`);

  const [, code, legacy, digits] = match;
  const type = legacy === 'G' ? 'LEGENDARY' : 'ARTIST_PROOF';
  const number = EDITION_RANGES[type].min + Number.parseInt(digits!, 10) - 1;
  return formatSerial(code!, number);
}

async function readRows(path: string): Promise<Row[]> {
  if (!existsSync(path)) throw new Error(`Missing source: ${path}`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const sheet = wb.worksheets[0];
  if (!sheet) throw new Error(`No sheet in ${path}`);

  const header = (sheet.getRow(1).values as unknown[]).slice(1).map(String);
  const at = (name: string) => {
    const i = header.indexOf(name);
    if (i === -1) throw new Error(`${path} has no ${name} column`);
    return i;
  };
  const [p, u, c] = [at('PIECE_NUMBER'), at('QR_URL'), at('CLAIM_CODE')];

  const rows: Row[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const v = (sheet.getRow(r).values as unknown[]).slice(1);
    rows.push({
      piece: normaliseSerial(String(v[p])),
      url: String(v[u]),
      code: String(v[c]),
    });
  }
  return rows;
}

async function build(master: MasterFile): Promise<void> {
  const rows: Row[] = [];
  for (const source of master.sources) rows.push(...(await readRows(source)));

  // Every check that matters, before anything is written. A merge is exactly
  // where a duplicated or dropped row would appear, and it would not be
  // visible by looking at the file.
  const serials = new Set(rows.map((r) => r.piece));
  const codes = new Set(rows.map((r) => r.code));
  const urls = new Set(rows.map((r) => r.url));

  if (serials.size !== rows.length) throw new Error(`${master.name}: duplicate piece numbers`);
  if (codes.size !== rows.length) throw new Error(`${master.name}: duplicate claim codes`);
  if (urls.size !== rows.length) throw new Error(`${master.name}: duplicate QR URLs`);
  if (rows.length !== master.expected) {
    throw new Error(`${master.name}: expected ${master.expected} rows, got ${rows.length}`);
  }
  for (const row of rows) {
    if (!parseSerial(row.piece)) throw new Error(`${master.name}: bad serial ${row.piece}`);
    if (!parseClaimCode(row.code)) throw new Error(`${master.name}: bad claim code on ${row.piece}`);
    if (!parseQrToken(row.url.split('/p/')[1] ?? '')) {
      throw new Error(`${master.name}: bad QR URL on ${row.piece}`);
    }
  }

  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet(master.colour);
  sheet.columns = [
    { header: 'LINE', key: 'line', width: 9 },
    { header: 'PIECE_NUMBER', key: 'piece', width: 16 },
    { header: 'QR_URL', key: 'url', width: 44 },
    { header: 'CLAIM_CODE', key: 'code', width: 16 },
  ];
  sheet.getRow(1).font = { bold: true };
  rows.forEach((row, i) => {
    sheet.addRow({ line: i + 1, piece: row.piece, url: row.url, code: row.code });
  });

  mkdirSync(OUT, { recursive: true });
  const outPath = join(OUT, `${master.name}.xlsx`);
  await wb.xlsx.writeFile(outPath);

  console.log(`  ${master.colour.padEnd(7)} ${String(rows.length).padStart(7)} rows   ` +
    `${rows[0]!.piece} .. ${rows.at(-1)!.piece}`);
  console.log(`          ${outPath}`);
}

console.log('\nBuilding the three master files, one per hologram design.\n');
for (const master of MASTERS) await build(master);
console.log('\nEvery row came from a batch already minted and verified. Nothing was regenerated.\n');
