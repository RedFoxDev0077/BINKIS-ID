#!/usr/bin/env node
/**
 * Split a master file into one file per character, for the press.
 *
 *   node scripts/split-by-character.ts factory-exports/SEND-TO-KRY/BINKIS-CLASSIC-SILVER.xlsx
 *
 * The factory prints the eight Classics as eight separate jobs and asked for
 * the data the same way: one folder, one file, one character, each carrying
 * its own press buffer. One 140,000 row workbook is the same data, but it
 * makes the operator do the splitting, and splitting 140,000 rows by hand on
 * the day of the run is where a row shift comes from.
 *
 * This only cuts the file. It never renumbers a piece, never mints anything,
 * and refuses to write if the pieces it read do not account for every row of
 * the master. LINE restarts at 1 in each file because it is the press's own
 * counter, not part of the piece's identity.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { parseArgs } from 'node:util';
import ExcelJS from 'exceljs';

import { parseSerial } from '../src/lib/serial.ts';
import { parseClaimCode } from '../src/lib/codes/claim-code.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: 'string', default: 'factory-exports/SEND-TO-KRY/POR-PERSONAJE' },
  },
});

const source = positionals[0];
if (!source) {
  console.log('\n  node scripts/split-by-character.ts <master .xlsx> [--out dir]\n');
  process.exit(1);
}

interface Row {
  piece: string;
  url: string;
  code: string;
  number: number;
}

const sourcePath = resolve(process.cwd(), source);
if (!existsSync(sourcePath)) throw new Error(`Missing file: ${sourcePath}`);

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(sourcePath);
const sheet = workbook.worksheets[0];
if (!sheet) throw new Error(`No sheet in ${source}`);

const header = (sheet.getRow(1).values as unknown[]).slice(1).map(String);
const columnAt = (name: string) => {
  const i = header.indexOf(name);
  if (i === -1) throw new Error(`${source} has no ${name} column`);
  return i;
};
const [pieceAt, urlAt, codeAt] = [
  columnAt('PIECE_NUMBER'),
  columnAt('QR_URL'),
  columnAt('CLAIM_CODE'),
];

const byCharacter = new Map<string, Row[]>();
let read = 0;

for (let r = 2; r <= sheet.rowCount; r++) {
  const v = (sheet.getRow(r).values as unknown[]).slice(1);
  const piece = String(v[pieceAt]);
  const parsed = parseSerial(piece);
  if (!parsed) throw new Error(`Row ${r}: cannot read serial ${piece}`);

  const row: Row = {
    piece,
    url: String(v[urlAt]),
    code: String(v[codeAt]),
    number: parsed.number,
  };
  if (!parseClaimCode(row.code)) throw new Error(`${piece}: claim code fails its check character`);
  if (!row.url.includes('/p/')) throw new Error(`${piece}: QR URL is not a passport URL`);

  const list = byCharacter.get(parsed.characterCode) ?? [];
  list.push(row);
  byCharacter.set(parsed.characterCode, list);
  read++;
}

if (read !== sheet.rowCount - 1) {
  throw new Error(`Read ${read} rows but the sheet has ${sheet.rowCount - 1}`);
}

// Nothing may be lost or duplicated by the split, and that is checked against
// the whole master rather than file by file.
const everySerial = new Set<string>();
const everyCode = new Set<string>();
const everyUrl = new Set<string>();
for (const rows of byCharacter.values()) {
  for (const row of rows) {
    everySerial.add(row.piece);
    everyCode.add(row.code);
    everyUrl.add(row.url);
  }
}
if (everySerial.size !== read) throw new Error('duplicate piece numbers across the split');
if (everyCode.size !== read) throw new Error('duplicate claim codes across the split');
if (everyUrl.size !== read) throw new Error('duplicate QR URLs across the split');

const outDir = resolve(process.cwd(), values.out!);
mkdirSync(outDir, { recursive: true });

// Biggest run first, which is the order the press works in.
const order = [...byCharacter.entries()].sort((a, b) => b[1].length - a[1].length);

console.log(`\n  ${read} rows from ${source}\n`);
let written = 0;
let index = 0;

for (const [code, rows] of order) {
  rows.sort((a, b) => a.number - b.number);

  // A contiguous block is what lets the operator see at a glance that a folder
  // is whole, so say plainly when it is not.
  const first = rows[0]!.number;
  const last = rows.at(-1)!.number;
  const contiguous = last - first + 1 === rows.length;

  const out = new ExcelJS.Workbook();
  const target = out.addWorksheet(code);
  target.columns = [
    { header: 'LINE', key: 'line', width: 9 },
    { header: 'PIECE_NUMBER', key: 'piece', width: 16 },
    { header: 'QR_URL', key: 'url', width: 44 },
    { header: 'CLAIM_CODE', key: 'code', width: 16 },
  ];
  target.getRow(1).font = { bold: true };
  rows.forEach((row, i) => {
    target.addRow({ line: i + 1, piece: row.piece, url: row.url, code: row.code });
  });

  index += 1;
  const folder = join(outDir, `${String(index).padStart(2, '0')}-${code}`);
  mkdirSync(folder, { recursive: true });
  const file = join(folder, `BINKIS-${code}-CLASSIC.xlsx`);
  await out.xlsx.writeFile(file);
  written += rows.length;

  console.log(
    `  ${String(index).padStart(2, '0')}-${code}  ${String(rows.length).padStart(6)} rows   ` +
      `${rows[0]!.piece} .. ${rows.at(-1)!.piece}${contiguous ? '' : '   NOT CONTIGUOUS'}`,
  );
}

if (written !== read) throw new Error(`Wrote ${written} rows but read ${read}`);
console.log(`\n  ${written} rows written to ${outDir}, all accounted for.\n`);
