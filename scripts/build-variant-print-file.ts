#!/usr/bin/env node
/**
 * The Variant file, with Bizarro written as BIZ.
 *
 *   node scripts/build-variant-print-file.ts
 *
 * One file comes out: BINKIS-VARIANT-BLUE, 11,108 rows, four characters at
 * 2,777 each.
 *
 * Nothing is minted. Every row is copied from the master already delivered,
 * with exactly one change: the 2,777 Bizarro piece numbers go from BZ-V00001
 * to BIZ-V00001. QR URLs and claim codes are carried across untouched,
 * character for character, and BM, HQ and JK are not altered at all.
 *
 * It has to be a copy rather than a regeneration. A claim code is stored only
 * as an HMAC, so the plaintext in the delivered file is the only plaintext
 * that exists anywhere. Regenerating would mint new codes and strand every
 * code in the file the client is holding.
 *
 * Why it is needed: the client renamed the character on 15 October 2026, the
 * registry was renamed on 4 November, and this file was written before
 * either. Left alone it would print BZ-V00001 on a sticker whose page says
 * BIZ-V00001. The QR would still resolve, because the token never changed, so
 * nothing would break loudly - the serial under the collector's thumb would
 * just disagree with the serial on their screen, forever.
 *
 * The delivered file is NOT overwritten. It is the record of what was sent.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import ExcelJS from 'exceljs';

import { parseSerial, printedSerial, characterName } from '../src/lib/serial.ts';
import { parseClaimCode } from '../src/lib/codes/claim-code.ts';

const SOURCE = 'factory-exports/SEND-TO-KRY';
const OUT = 'factory-exports/SEND-TO-KRY/VARIANTE';
const FILE = 'BINKIS-VARIANT-BLUE.xlsx';

/** Bizarro was BZ in everything written before 15 October 2026. */
function toBiz(serial: string): string {
  return serial.startsWith('BZ-') ? `BIZ-${serial.slice(3)}` : serial;
}

interface Row {
  piece: string;
  url: string;
  code: string;
  number: number;
  character: string;
}

const path = resolve(process.cwd(), join(SOURCE, FILE));
if (!existsSync(path)) throw new Error(`Missing source: ${path}`);

const source = new ExcelJS.Workbook();
await source.xlsx.readFile(path);
const sheet = source.worksheets[0];
if (!sheet) throw new Error(`No sheet in ${FILE}`);

const header = (sheet.getRow(1).values as unknown[]).slice(1).map(String);
const at = (name: string) => {
  const i = header.indexOf(name);
  if (i === -1) throw new Error(`${FILE} has no ${name} column`);
  return i;
};
const [pieceAt, urlAt, codeAt] = [at('PIECE_NUMBER'), at('QR_URL'), at('CLAIM_CODE')];

const rows: Row[] = [];
let renamed = 0;

for (let r = 2; r <= sheet.rowCount; r++) {
  const v = (sheet.getRow(r).values as unknown[]).slice(1);
  const was = String(v[pieceAt]);
  const serial = toBiz(was);
  if (serial !== was) renamed++;

  const parsed = parseSerial(serial);
  if (!parsed) throw new Error(`${FILE} row ${r}: cannot read serial ${serial}`);
  if (parsed.editionType !== 'VARIANT') {
    throw new Error(`${FILE} row ${r}: ${serial} is ${parsed.editionType}, not VARIANT`);
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
    character: characterName(parsed.characterCode),
  });
}

rows.sort((a, b) =>
  a.character === b.character ? a.number - b.number : a.character.localeCompare(b.character),
);

// Checks worth failing on rather than discovering at the press.
if (rows.length !== 11_108) throw new Error(`expected 11,108 rows, got ${rows.length}`);
if (renamed !== 2_777) throw new Error(`expected 2,777 Bizarro rows, renamed ${renamed}`);
if (new Set(rows.map((r) => r.piece)).size !== rows.length) throw new Error('repeated piece number');
if (new Set(rows.map((r) => r.url)).size !== rows.length) throw new Error('repeated QR url');
if (new Set(rows.map((r) => r.code)).size !== rows.length) throw new Error('repeated claim code');
if (rows.some((r) => r.piece.startsWith('BZ-'))) throw new Error('a BZ serial survived');

const out = new ExcelJS.Workbook();
const target = out.addWorksheet('VARIANTE');
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

mkdirSync(resolve(process.cwd(), OUT), { recursive: true });
await out.xlsx.writeFile(resolve(process.cwd(), OUT, FILE));

const byCharacter = new Map<string, number>();
for (const row of rows) byCharacter.set(row.character, (byCharacter.get(row.character) ?? 0) + 1);

console.log('\nPara imprimir:\n');
console.log(
  `  ${FILE.padEnd(28)} ${String(rows.length).padStart(6)} rows   ` +
    `${rows[0]!.piece} .. ${rows.at(-1)!.piece}`,
);
for (const [character, n] of [...byCharacter].sort()) {
  console.log(`    ${character.padEnd(16)} ${String(n).padStart(5)}`);
}
console.log(`\n  ${renamed} piezas de Bizarro pasaron de BZ- a BIZ-.`);
console.log('  Mismas piezas, mismos QR, mismos códigos. Nada se regeneró.\n');
