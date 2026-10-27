#!/usr/bin/env node
/**
 * The Katana file, in the printed form the client asked for.
 *
 *   node scripts/build-katana-print-file.ts
 *
 * One file comes out:
 *
 *   BINKIS-KATANA-BLACK   10 Legendary + 4 Artist Proof
 *
 * Same shape as BINKIS-LEGENDARY-BLACK, which is what the client asked for
 * on 22 October 2026: "podrias hacer 14 pz mas binkis legendary black...
 * KTN-01 A 10 mas sus cuatro A/P".
 *
 * Nothing is minted here. Every row is copied from the two batches the
 * generator already froze, with one change: the piece number is written the
 * way it will be printed. KTN-00001 becomes KTN-01, KTN-AP00001 becomes
 * KTN-01-AP. The registry keeps its own serials; this is what goes on the
 * hologram and on the piece's page, and the two have to agree or the
 * collector thinks something is wrong.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import ExcelJS from 'exceljs';

import { parseSerial, printedSerial, characterName } from '../src/lib/serial.ts';
import { parseClaimCode } from '../src/lib/codes/claim-code.ts';

const SOURCE = 'factory-exports/KATANA';
const OUT = 'factory-exports/KATANA';

interface Row {
  piece: string;
  url: string;
  code: string;
  /** Sort key: the registry number, not the printed string. */
  number: number;
  character: string;
}

async function read(file: string): Promise<Row[]> {
  const path = resolve(process.cwd(), join(SOURCE, file));
  if (!existsSync(path)) throw new Error(`Missing source: ${path}`);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error(`No sheet in ${file}`);

  const header = (sheet.getRow(1).values as unknown[]).slice(1).map(String);
  const at = (name: string) => {
    const i = header.indexOf(name);
    if (i === -1) throw new Error(`${file} has no ${name} column`);
    return i;
  };
  const [pieceAt, urlAt, codeAt] = [at('PIECE_NUMBER'), at('QR_URL'), at('CLAIM_CODE')];

  const rows: Row[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const v = (sheet.getRow(r).values as unknown[]).slice(1);
    const serial = String(v[pieceAt]);
    const parsed = parseSerial(serial);
    if (!parsed) throw new Error(`${file} row ${r}: cannot read serial ${serial}`);

    const code = String(v[codeAt]);
    if (!parseClaimCode(code)) throw new Error(`${serial}: claim code fails its check character`);

    rows.push({
      piece: printedSerial(serial),
      url: String(v[urlAt]),
      code,
      number: parsed.number,
      character: characterName(parsed.characterCode),
    });
  }
  return rows;
}

async function write(name: string, rows: Row[], sheetName: string): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
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

  mkdirSync(resolve(process.cwd(), OUT), { recursive: true });
  await workbook.xlsx.writeFile(resolve(process.cwd(), OUT, `${name}.xlsx`));

  console.log(
    `  ${name.padEnd(28)} ${String(rows.length).padStart(3)} rows   ` +
      `${rows[0]!.piece} .. ${rows.at(-1)!.piece}`,
  );
}

const legendary = await read('B-2026-KTN-LEGENDARY.xlsx');
const proofs = await read('B-2026-KTN-ARTISTPROOF.xlsx');

// Legendary first, then the proofs, each in its own numeric order. That is
// how BINKIS-LEGENDARY-BLACK reads, and the press works down the file.
const rows = [
  ...legendary.sort((a, b) => a.number - b.number),
  ...proofs.sort((a, b) => a.number - b.number),
];

console.log('\nPara imprimir:\n');
await write('BINKIS-KATANA-BLACK', rows, 'BLACK');

// Checks worth failing on rather than discovering at the press.
if (rows.length !== 14) throw new Error(`expected 14 rows, got ${rows.length}`);
if (new Set(rows.map((r) => r.piece)).size !== 14) throw new Error('repeated piece number');
if (new Set(rows.map((r) => r.code)).size !== 14) throw new Error('repeated claim code');
if (new Set(rows.map((r) => r.url)).size !== 14) throw new Error('repeated QR url');

const expected = [
  ...Array.from({ length: 10 }, (_, i) => `KTN-${String(i + 1).padStart(2, '0')}`),
  ...Array.from({ length: 4 }, (_, i) => `KTN-${String(i + 1).padStart(2, '0')}-AP`),
];
const got = rows.map((r) => r.piece);
if (got.join(',') !== expected.join(',')) {
  throw new Error(`piece numbers are not KTN-01..KTN-10 plus four proofs:\n  ${got.join(', ')}`);
}

console.log(`\n  ${rows.length} piezas: KTN-01 a KTN-10, más KTN-01-AP a KTN-04-AP.`);
console.log('  Mismas piezas que el registro. Nada se regeneró.\n');
