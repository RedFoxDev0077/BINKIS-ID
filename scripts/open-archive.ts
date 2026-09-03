#!/usr/bin/env node
/**
 * Open a sealed factory archive back into its plain .xlsx.
 *
 *   node scripts/open-archive.ts --batch B-2026-01
 *
 * The factory asked for the workbook directly rather than the encrypted
 * archive. This unseals the archive that was already produced; it does NOT
 * regenerate anything. That distinction is the whole point: the codes in
 * B-2026-01 are already with the factory, the batch is marked EXPORTED, and
 * re-running the generator would mint different codes for serials that have
 * already been committed to. Non-negotiable 7.
 *
 * It verifies the archive against its own manifest before writing, so a
 * corrupted or substituted file cannot quietly become the thing that gets
 * printed.
 *
 * What comes out is plaintext claim codes. Treat the output as the sensitive
 * file it is: send it over a channel that does not also carry the key, and
 * delete it once the factory confirms receipt.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { parseArgs } from 'node:util';
import { decryptArchive, parseExportKey, sha256, ArchiveError } from '../src/lib/export/archive.ts';

for (const file of ['.env.local', '.env']) {
  const path = resolve(process.cwd(), file);
  if (existsSync(path)) process.loadEnvFile(path);
}

const { values } = parseArgs({
  options: {
    batch: { type: 'string' },
    dir: { type: 'string' },
    out: { type: 'string' },
    simple: { type: 'boolean' },
    help: { type: 'boolean', short: 'h' },
  },
});

if (values.help || !values.batch) {
  console.log(`
Open a sealed BINKIS factory archive back into its plain .xlsx.

  --batch <CODE>   Batch code, e.g. B-2026-01
  --dir <path>     Export directory. Default ./factory-exports
  --out <path>     Where to write the .xlsx. Default: next to the archive.
  --simple         Write only the columns the press actually prints:
                   LINE, PIECE_NUMBER, QR_URL, CLAIM_CODE. The factory
                   asked for this - they could not tell which columns were
                   variable data and which were context, and a printer
                   guessing about that is how a run goes wrong.

Reads FACTORY_EXPORT_KEY from .env. Does not regenerate anything.
`);
  process.exit(values.help ? 0 : 1);
}

const batch = values.batch;
const dir = resolve(values.dir ?? 'factory-exports', batch);
const archivePath = join(dir, `${batch}.xlsx.binkis`);
const manifestPath = join(dir, `${batch}.manifest.json`);

function fail(message: string): never {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

if (!existsSync(archivePath)) fail(`No archive at ${archivePath}`);

const rawKey = process.env.FACTORY_EXPORT_KEY;
if (!rawKey) fail('FACTORY_EXPORT_KEY is not set in .env');

const archive = readFileSync(archivePath);
const archiveHash = sha256(archive);

console.log(`\n  Archive       ${archivePath}`);
console.log(`  SHA-256       ${archiveHash}`);

// Check the archive against its manifest before decrypting. If these disagree
// the file on disk is not the one that was sealed, and nothing below should be
// trusted.
let expectedWorkbookHash: string | null = null;
let expectedRows: number | null = null;

if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    archiveSha256?: string;
    workbookSha256?: string;
    rowCount?: number;
  };
  if (manifest.archiveSha256 && manifest.archiveSha256 !== archiveHash) {
    fail(
      'Archive does not match its manifest checksum. This file is not the one ' +
        'that was sealed. Refusing to open it.',
    );
  }
  expectedWorkbookHash = manifest.workbookSha256 ?? null;
  expectedRows = manifest.rowCount ?? null;
  console.log('  Manifest      checksum matches');
}

let workbook: Buffer;
try {
  workbook = decryptArchive(archive, parseExportKey(rawKey));
} catch (error) {
  if (error instanceof ArchiveError) {
    fail(`${error.message}\n  (Is FACTORY_EXPORT_KEY the key this batch was sealed with?)`);
  }
  throw error;
}

const workbookHash = sha256(workbook);
if (expectedWorkbookHash && expectedWorkbookHash !== workbookHash) {
  fail('Decrypted workbook does not match the manifest. Refusing to write it.');
}

const defaultName = values.simple ? `${batch}-PRINT.xlsx` : `${batch}.xlsx`;
const outPath = resolve(values.out ?? join(dir, defaultName));

if (values.simple) {
  await writeSimplified(workbook, outPath);
} else {
  writeFileSync(outPath, workbook);
}

console.log(`  Workbook SHA  ${workbookHash}${expectedWorkbookHash ? '  (matches manifest)' : ''}`);
if (values.simple) console.log('  Columns       LINE, PIECE_NUMBER, QR_URL, CLAIM_CODE');
if (expectedRows !== null) console.log(`  Rows          ${expectedRows}`);
console.log(`\n  Written       ${outPath}`);
console.log(`
  This file contains ${expectedRows ?? 'the'} claim codes in PLAINTEXT.
  Send it on a channel that does not also carry FACTORY_EXPORT_KEY, and
  delete it once the factory confirms receipt.
`);

/**
 * Re-emit the workbook with only the four columns the press consumes.
 *
 * The factory could not tell which columns were variable data and which were
 * fixed context, and said so plainly: "I only know what the three variable
 * data I marked represent. The rest, I have no idea what they stand for."
 * A printer guessing at that is exactly how a run goes wrong, so the file they
 * receive should contain only what they print, in the order they print it.
 *
 * LINE stays even though it is not printed. It is the collation order, and it
 * is what lets anyone check that row N really is piece N after the file has
 * been through a spreadsheet.
 */
async function writeSimplified(workbook: Buffer, outPath: string): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;

  const source = new ExcelJS.Workbook();
  await source.xlsx.load(workbook as unknown as ArrayBuffer);
  const sheet = source.worksheets[0];
  if (!sheet) throw new Error('The archive workbook has no sheet');

  const header = (sheet.getRow(1).values as unknown[]).slice(1).map(String);
  const at = (name: string) => {
    const index = header.indexOf(name);
    if (index === -1) throw new Error(`Column ${name} not found in the archive`);
    return index;
  };
  const [line, piece, url, code] = [
    at('LINE'),
    at('PIECE_NUMBER'),
    at('QR_URL'),
    at('CLAIM_CODE'),
  ];

  const out = new ExcelJS.Workbook();
  const target = out.addWorksheet(sheet.name);
  target.columns = [
    { header: 'LINE', key: 'line', width: 8 },
    { header: 'PIECE_NUMBER', key: 'piece', width: 16 },
    { header: 'QR_URL', key: 'url', width: 42 },
    { header: 'CLAIM_CODE', key: 'code', width: 16 },
  ];
  target.getRow(1).font = { bold: true };

  for (let r = 2; r <= sheet.rowCount; r++) {
    const values = (sheet.getRow(r).values as unknown[]).slice(1);
    target.addRow({
      line: values[line],
      piece: values[piece],
      url: values[url],
      code: values[code],
    });
  }

  await out.xlsx.writeFile(outPath);
}
