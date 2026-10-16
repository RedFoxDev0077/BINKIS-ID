#!/usr/bin/env node
/**
 * The Limited and Legendary files, in the printed form the client asked for.
 *
 *   node scripts/build-print-files.ts
 *
 * Three files come out:
 *
 *   BINKIS-LIMITED-GOLD      777 x 5 Limited + 100 x 5 Artist Proof
 *   BINKIS-LEGENDARY-BLACK   10 Legendary + 4 Artist Proof
 *   RESPALDO-LIMITED-1-120   1..120 of each Limited character
 *
 * Nothing is minted. Every row is copied from the master files already
 * delivered, with two changes: the piece number is written the way it will be
 * printed from now on (RF-045, RF-045-AP, DS-07), and Bizarro is BIZ.
 *
 * The spares are deliberately NOT in the Gold file. The client wants the first
 * 120 of each Limited duplicated as insurance against the press skipping
 * numbers, and a duplicate mixed into the production roll is indistinguishable
 * from its original: two stickers, one identity, and the second customer to
 * register is told the piece already has an owner. As a separate roll it is
 * insurance; inside the same roll it is a defect waiting to ship. Same
 * arrangement that was used for the Classic run.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import ExcelJS from 'exceljs';

import { parseSerial, printedSerial, characterName } from '../src/lib/serial.ts';
import { parseClaimCode } from '../src/lib/codes/claim-code.ts';

const SOURCE = 'factory-exports/SEND-TO-KRY';
const OUT = 'factory-exports/SEND-TO-KRY/IMPRESION-OCTUBRE';

/** Bizarro was BZ in everything written before 15 October 2026. */
function toBiz(serial: string): string {
  return serial.startsWith('BZ-') ? `BIZ-${serial.slice(3)}` : serial;
}

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
    const serial = toBiz(String(v[pieceAt]));
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

  const characters = [...new Set(rows.map((r) => r.character))].length;
  console.log(
    `  ${name.padEnd(28)} ${String(rows.length).padStart(5)} rows   ` +
      `${rows[0]!.piece} .. ${rows.at(-1)!.piece}   ${characters} personajes`,
  );
}

const gold = await read('BINKIS-LIMITED-GOLD.xlsx');
const black = await read('BINKIS-LEGENDARY-BLACK.xlsx');

const byPrinted = (a: Row, b: Row) =>
  a.character === b.character ? a.number - b.number : a.character.localeCompare(b.character);

// Limited and its proofs. Spares leave the production file: see the note above.
const limited = gold.filter((r) => !r.piece.includes('-X')).sort(byPrinted);
const spares = gold.filter((r) => r.piece.includes('-X'));

// The backup roll: the first 120 of each Limited character, copied exactly.
// Same piece, same QR, same code, so a backup sticker replaces the original
// it stands in for rather than becoming a second piece.
const backup = limited
  .filter((r) => /^[A-Z]{2,3}-(\d{3})$/.test(r.piece) && Number(r.piece.split('-')[1]) <= 120)
  .sort(byPrinted);

console.log('\nPara imprimir:\n');
await write('BINKIS-LIMITED-GOLD', limited, 'GOLD');
await write('BINKIS-LEGENDARY-BLACK', black.sort(byPrinted), 'BLACK');
console.log('\nRollo aparte, guardado cerrado:\n');
await write('RESPALDO-LIMITED-1-120', backup, 'RESPALDO');

// Checks worth failing on rather than discovering at the press.
const printed = new Set(limited.concat(black).map((r) => r.piece));
if (printed.size !== limited.length + black.length) throw new Error('repeated piece number');
if (backup.length !== 600) throw new Error(`backup should be 600 rows, got ${backup.length}`);
if (limited.length !== 4_385) throw new Error(`Gold should be 4,385 rows, got ${limited.length}`);
if (black.length !== 14) throw new Error(`Black should be 14 rows, got ${black.length}`);

console.log(`\n  ${spares.length} repuestos quedaron fuera del archivo de producción.`);
console.log('  Mismas piezas, mismos códigos. Nada se regeneró.\n');
