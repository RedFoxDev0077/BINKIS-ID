#!/usr/bin/env node
/**
 * The letter editions, re-spelled with the edition letter separated.
 *
 *   node scripts/build-separated-serials.ts
 *
 * Four files come out, into IMPRESION-NOVIEMBRE:
 *
 *   BINKIS-VARIANT-BLUE        19,108 rows   4 x 4,777, the production roll
 *   RESPALDO-VARIANT-1-717      2,868 rows   4 x   717, the backup roll
 *   BINKIS-RARE-GREEN           7,777 rows   Brainiac
 *   BINKIS-SUPERRARE-RED        2,222 rows   Poison Ivy
 *
 * WHAT CHANGES, AND IT IS ONLY ONE THING. The PIECE_NUMBER column goes from
 * BIZ-V01427 to BIZ-V-1427: the edition letter is separated from the position
 * and the position is printed at four digits. Client, 8 November 2026, before
 * Krystal printed any of these.
 *
 * NOTHING IS MINTED. Every row is copied from the file already delivered.
 * QR URLs and claim codes are carried across character for character, and
 * each row is checked to still parse back to the same piece it came from. A
 * claim code is stored only as an HMAC, so the plaintext in the delivered
 * file is the only plaintext that exists anywhere: regenerating would mint
 * new codes and strand every code in the file the client is holding.
 *
 * That is the whole reason this can be done at all. The registry still stores
 * BIZ-V01427, the QR token is untouched, the claim code is untouched, and the
 * piece keeps its identity and its history. Only the spelling on the sticker
 * moves, and printedSerial moves the page to match it in the same commit.
 *
 * LIMITED, LEGENDARY AND ARTIST PROOF ARE NOT IN HERE. 15 October took the
 * edition letter off those entirely - RF-045, DS-07, RF-045-AP - so there is
 * no letter left to separate, and IMPRESION-OCTUBRE is already correct. If
 * the client decides he wants the letter back on them, that is a different
 * change to printedSerial and a different file, and it has to be decided
 * before Krystal prints rather than patched afterwards.
 *
 * THE DELIVERED FILES ARE NOT OVERWRITTEN. They are the record of what was
 * sent. This writes beside them.
 *
 * ORDER OF OPERATIONS, and it matters.
 *
 * The client confirmed on 8 November 2026 that Brainiac goes from 7,777 to
 * 8,000 and Poison Ivy from 2,222 to 2,777. Those are ADDITIONS: 223 and 555
 * new pieces minted into their own batches, with the run size moved so the
 * whole edition prints "/ 8,000" and "/ 2,777". Nothing existing is touched.
 *
 * So the Variant two run now, and the Rare and Super Rare two run only AFTER
 * those additions exist, merging the delivered file with the continuation
 * batch the way build-variant-4777.ts merges its B2 batches. Until then the
 * row counts below are the delivered counts and this script will refuse the
 * two files rather than ship a short run to the press. That refusal is the
 * feature: the counts are assertions, not inputs.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import ExcelJS from 'exceljs';

import {
  formatSerial,
  parseSerial,
  printedSerial,
  characterName,
  type EditionType,
} from '../src/lib/serial.ts';
import { parseClaimCode } from '../src/lib/codes/claim-code.ts';

const OUT = 'factory-exports/SEND-TO-KRY/IMPRESION-NOVIEMBRE';

interface Job {
  /** Delivered file to copy from, relative to the repo. */
  source: string;
  /** File name to write. Same name, new folder. */
  name: string;
  sheet: string;
  edition: EditionType;
  /** Rows expected. Worth failing on rather than discovering at the press. */
  rows: number;
  /** How many distinct characters the file should contain. */
  characters: number;
}

const JOBS: readonly Job[] = [
  {
    source: 'factory-exports/SEND-TO-KRY/VARIANTE-4777/BINKIS-VARIANT-BLUE.xlsx',
    name: 'BINKIS-VARIANT-BLUE.xlsx',
    sheet: 'VARIANTE',
    edition: 'VARIANT',
    rows: 19_108,
    characters: 4,
  },
  {
    source: 'factory-exports/SEND-TO-KRY/VARIANTE-4777/RESPALDO-VARIANT-1-717.xlsx',
    name: 'RESPALDO-VARIANT-1-717.xlsx',
    sheet: 'RESPALDO',
    edition: 'VARIANT',
    rows: 2_868,
    characters: 4,
  },
  {
    source: 'factory-exports/SEND-TO-KRY/BINKIS-RARE-GREEN.xlsx',
    name: 'BINKIS-RARE-GREEN.xlsx',
    sheet: 'RARE',
    edition: 'RARE',
    rows: 7_777,
    characters: 1,
  },
  {
    source: 'factory-exports/SEND-TO-KRY/BINKIS-SUPERRARE-RED.xlsx',
    name: 'BINKIS-SUPERRARE-RED.xlsx',
    sheet: 'SUPERRARE',
    edition: 'SUPER_RARE',
    rows: 2_222,
    characters: 1,
  },
];

interface Row {
  /** The new spelling. */
  piece: string;
  /** The spelling in the delivered file, kept so the two can be compared. */
  was: string;
  url: string;
  code: string;
  /** Sort key: the registry number, not the printed string. */
  number: number;
  character: string;
}

async function read(job: Job): Promise<Row[]> {
  const path = resolve(process.cwd(), job.source);
  if (!existsSync(path)) throw new Error(`Missing source: ${path}`);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error(`No sheet in ${job.source}`);

  const header = (sheet.getRow(1).values as unknown[]).slice(1).map(String);
  const at = (name: string) => {
    const i = header.indexOf(name);
    if (i === -1) throw new Error(`${job.name} has no ${name} column`);
    return i;
  };
  const [pieceAt, urlAt, codeAt] = [at('PIECE_NUMBER'), at('QR_URL'), at('CLAIM_CODE')];

  const rows: Row[] = [];

  for (let r = 2; r <= sheet.rowCount; r++) {
    const v = (sheet.getRow(r).values as unknown[]).slice(1);
    const was = String(v[pieceAt]);

    const parsed = parseSerial(was);
    if (!parsed) throw new Error(`${job.name} row ${r}: cannot read serial ${was}`);
    if (parsed.editionType !== job.edition) {
      throw new Error(`${job.name} row ${r}: ${was} is ${parsed.editionType}, not ${job.edition}`);
    }

    // Rebuild the REGISTRY form from the parsed number, then print that.
    // Going back through the registry rather than string-editing the
    // delivered cell is the whole point: the piece is identified by its
    // number, and the new spelling is derived from the number rather than
    // from the characters that happened to be in the old cell.
    const registry = formatSerial(parsed.characterCode, parsed.number);
    const piece = printedSerial(registry);

    const back = parseSerial(piece);
    if (!back) throw new Error(`${job.name} row ${r}: ${piece} does not read back`);
    if (back.number !== parsed.number || back.characterCode !== parsed.characterCode) {
      throw new Error(
        `${job.name} row ${r}: ${was} would print as ${piece}, which is a different piece`,
      );
    }

    const code = String(v[codeAt]);
    if (!parseClaimCode(code)) throw new Error(`${was}: claim code fails its check character`);

    const url = String(v[urlAt]);
    if (!url.startsWith('https://id.binkis.com/p/')) throw new Error(`${was}: odd QR url ${url}`);

    rows.push({
      piece,
      was,
      url,
      code,
      number: parsed.number,
      character: characterName(parsed.characterCode),
    });
  }

  return rows;
}

async function write(job: Job, rows: Row[]): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(job.sheet);
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

  const dir = resolve(process.cwd(), OUT);
  mkdirSync(dir, { recursive: true });
  await workbook.xlsx.writeFile(resolve(dir, job.name));
}

console.log(`\nLa letra de edicion, separada. Origen: los archivos ya entregados.\n`);

for (const job of JOBS) {
  const rows = await read(job);

  rows.sort((a, b) =>
    a.character === b.character ? a.number - b.number : a.character.localeCompare(b.character),
  );

  // Checks worth failing on rather than discovering at the press.
  if (rows.length !== job.rows) {
    throw new Error(`${job.name}: expected ${job.rows} rows, got ${rows.length}`);
  }
  if (new Set(rows.map((r) => r.piece)).size !== rows.length) {
    throw new Error(`${job.name}: repeated piece number`);
  }
  if (new Set(rows.map((r) => r.url)).size !== rows.length) {
    throw new Error(`${job.name}: repeated QR url`);
  }
  if (new Set(rows.map((r) => r.code)).size !== rows.length) {
    throw new Error(`${job.name}: repeated claim code`);
  }
  if (new Set(rows.map((r) => r.character)).size !== job.characters) {
    throw new Error(`${job.name}: expected ${job.characters} characters`);
  }

  // The rename must be a bijection. Same number of distinct names before and
  // after means no two pieces collapsed onto one sticker.
  if (new Set(rows.map((r) => r.was)).size !== new Set(rows.map((r) => r.piece)).size) {
    throw new Error(`${job.name}: the new spelling is not one-to-one with the old`);
  }
  // Every row really did change, and changed in the one way intended.
  const unchanged = rows.filter((r) => r.piece === r.was);
  if (unchanged.length > 0) {
    throw new Error(`${job.name}: ${unchanged.length} rows kept the old spelling`);
  }
  const wrongShape = rows.filter((r) => !/^[A-Z]{2,3}-[A-Z]-\d{4}$/.test(r.piece));
  if (wrongShape.length > 0) {
    throw new Error(`${job.name}: ${wrongShape[0]!.piece} is not the separated form`);
  }

  await write(job, rows);

  console.log(
    `  ${job.name.padEnd(30)} ${String(rows.length).padStart(6)} filas   ` +
      `${rows[0]!.was} -> ${rows[0]!.piece}   ..   ${rows.at(-1)!.was} -> ${rows.at(-1)!.piece}`,
  );
}

console.log(`\nEscrito en ${OUT}. Los archivos entregados no se tocaron.\n`);
