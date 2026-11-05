#!/usr/bin/env node
/**
 * The Variant files at the run the client asked for on 4 November 2026:
 * 4,777 of each character, plus a backup roll of the first 15%.
 *
 *   node scripts/build-variant-4777.ts
 *
 * Two files come out:
 *
 *   BINKIS-VARIANT-BLUE          19,108 rows   4 x 4,777, the production roll
 *   RESPALDO-VARIANT-1-717        2,868 rows   4 x   717, the backup roll
 *
 * Nothing is minted here. Positions 1..2,777 are copied from the file already
 * delivered, and positions 2,778..4,777 are copied from the four B2 batches
 * generated on the server on 5 November. A claim code exists in plaintext
 * only in those files, so a rebuild has to be a copy or every code already
 * committed to would be stranded.
 *
 * On the backup roll. The client asked for "un 15% adicional de cada numero
 * para los faltantes", and 15% of 4,777 is 717. These are DUPLICATES: same
 * piece, same QR, same code, so a backup sticker REPLACES the original it
 * stands in for rather than becoming a second piece. That is the only way a
 * replacement can work here, because the identity lives in the QR token and
 * a fresh token would be a different piece with a different history.
 *
 * It is a SEPARATE roll, and that is not cosmetic. A duplicate mixed into the
 * production roll is indistinguishable from its original: two stickers, one
 * identity, and the second collector to register is told the piece already
 * has an owner. As its own roll it is insurance; inside the production roll
 * it is a defect waiting to ship. Same arrangement as the Classic and
 * Limited runs.
 */

import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import ExcelJS from 'exceljs';

import { parseSerial, printedSerial, characterName } from '../src/lib/serial.ts';
import { parseClaimCode } from '../src/lib/codes/claim-code.ts';

const DELIVERED = 'factory-exports/SEND-TO-KRY/VARIANTE/BINKIS-VARIANT-BLUE.xlsx';
const CONTINUATION = 'factory-exports/_SOURCE-DO-NOT-SEND/VARIANT-B2';
const OUT = 'factory-exports/SEND-TO-KRY/VARIANTE-4777';

const RUN = 4_777;
const CHARACTERS = 4;
/** 15% of the run, for the faltantes. */
const BACKUP = Math.round(RUN * 0.15);

interface Row {
  piece: string;
  url: string;
  code: string;
  number: number;
  position: number;
  character: string;
}

async function read(path: string): Promise<Row[]> {
  const full = resolve(process.cwd(), path);
  if (!existsSync(full)) throw new Error(`Missing source: ${full}`);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(full);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error(`No sheet in ${path}`);

  const header = (sheet.getRow(1).values as unknown[]).slice(1).map(String);
  const at = (name: string) => {
    const i = header.indexOf(name);
    if (i === -1) throw new Error(`${path} has no ${name} column`);
    return i;
  };
  const [pieceAt, urlAt, codeAt] = [at('PIECE_NUMBER'), at('QR_URL'), at('CLAIM_CODE')];

  const rows: Row[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const v = (sheet.getRow(r).values as unknown[]).slice(1);
    const serial = String(v[pieceAt]);
    const parsed = parseSerial(serial);
    if (!parsed) throw new Error(`${path} row ${r}: cannot read serial ${serial}`);
    if (parsed.editionType !== 'VARIANT') {
      throw new Error(`${path} row ${r}: ${serial} is ${parsed.editionType}, not VARIANT`);
    }

    const code = String(v[codeAt]);
    if (!parseClaimCode(code)) throw new Error(`${serial}: claim code fails its check character`);

    const url = String(v[urlAt]);
    if (!url.startsWith('https://id.binkis.com/p/')) throw new Error(`${serial}: odd QR url ${url}`);

    rows.push({
      piece: printedSerial(serial),
      url,
      code,
      number: parsed.number,
      // Variant positions are the last four digits of the number.
      position: parsed.number - 200_000,
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

  const per = new Map<string, number>();
  for (const row of rows) per.set(row.character, (per.get(row.character) ?? 0) + 1);
  console.log(
    `  ${name.padEnd(26)} ${String(rows.length).padStart(6)} filas   ` +
      `${rows[0]!.piece} .. ${rows.at(-1)!.piece}`,
  );
  for (const [character, n] of [...per].sort()) {
    console.log(`    ${character.padEnd(16)} ${String(n).padStart(5)}`);
  }
}

const delivered = await read(DELIVERED);
const continuation: Row[] = [];
for (const file of readdirSync(resolve(process.cwd(), CONTINUATION)).sort()) {
  if (!file.endsWith('.xlsx')) continue;
  continuation.push(...(await read(join(CONTINUATION, file))));
}

const all = [...delivered, ...continuation].sort((a, b) =>
  a.character === b.character ? a.number - b.number : a.character.localeCompare(b.character),
);

// Checks worth failing on rather than discovering at the press.
const expected = RUN * CHARACTERS;
if (all.length !== expected) throw new Error(`expected ${expected} rows, got ${all.length}`);
if (new Set(all.map((r) => r.piece)).size !== all.length) throw new Error('repeated piece number');
if (new Set(all.map((r) => r.url)).size !== all.length) throw new Error('repeated QR url');
if (new Set(all.map((r) => r.code)).size !== all.length) throw new Error('repeated claim code');

// Every character runs 1..4777 with no hole. A hole means a piece exists in
// the registry that nothing will ever be printed for.
const byCharacter = new Map<string, Row[]>();
for (const row of all) {
  const list = byCharacter.get(row.character) ?? [];
  list.push(row);
  byCharacter.set(row.character, list);
}
if (byCharacter.size !== CHARACTERS) {
  throw new Error(`expected ${CHARACTERS} characters, got ${byCharacter.size}`);
}
for (const [character, rows] of byCharacter) {
  if (rows.length !== RUN) throw new Error(`${character}: ${rows.length} rows, expected ${RUN}`);
  for (let i = 0; i < rows.length; i++) {
    if (rows[i]!.position !== i + 1) {
      throw new Error(`${character}: position ${rows[i]!.position} where ${i + 1} was expected`);
    }
  }
}

const backup = all.filter((r) => r.position <= BACKUP);
if (backup.length !== BACKUP * CHARACTERS) {
  throw new Error(`backup should be ${BACKUP * CHARACTERS} rows, got ${backup.length}`);
}

console.log('\nRollo de produccion:\n');
await write('BINKIS-VARIANT-BLUE', all, 'VARIANTE');
console.log('\nRollo aparte, para reponer faltantes. Mismas piezas, mismos codigos:\n');
await write(`RESPALDO-VARIANT-1-${BACKUP}`, backup, 'RESPALDO');
console.log(
  `\n  ${continuation.length} piezas nuevas (2778..${RUN}); ` +
    `${delivered.length} venian del archivo ya entregado.`,
);
console.log('  Nada se regenero.\n');
