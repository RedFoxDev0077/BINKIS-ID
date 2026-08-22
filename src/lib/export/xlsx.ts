import ExcelJS from 'exceljs';
import { formatClaimCode } from '../codes/claim-code.ts';
import { qrPayload } from '../codes/qr-token.ts';
import type { GeneratedPiece } from '../generator.ts';

/**
 * The factory file.
 *
 * This spreadsheet is the only artefact in the world that holds plaintext
 * claim codes. It exists so a printing press in China can put the right code
 * under the right scratch panel on the right sticker, and for no other reason.
 * It is written, hashed, encrypted, and the plaintext is deleted.
 *
 * Note what is NOT in it: no internal database id, no claim hash, no pepper,
 * no owner data. The internal id never leaves the database (non-negotiable 6).
 */

export const FACTORY_COLUMNS = [
  'LINE',
  'PIECE_NUMBER',
  'QR_URL',
  'CLAIM_CODE',
  'CHARACTER',
  'EDITION',
  'BATCH',
] as const;

export interface FactoryRowContext {
  character: string;
  editionLabel: string;
  /** Total pieces in the edition, so a numbered piece reads as "45/777". */
  runSize: number;
  batchCode: string;
  origin: string;
}

export interface FactoryRow {
  LINE: number;
  PIECE_NUMBER: string;
  QR_URL: string;
  CLAIM_CODE: string;
  CHARACTER: string;
  EDITION: string;
  BATCH: string;
}

export function buildFactoryRows(
  pieces: readonly GeneratedPiece[],
  context: FactoryRowContext,
): FactoryRow[] {
  return pieces.map((piece, index) => ({
    LINE: index + 1,
    PIECE_NUMBER: piece.serial,
    QR_URL: qrPayload(piece.qrToken, context.origin),
    CLAIM_CODE: formatClaimCode(piece.claimCode),
    CHARACTER: context.character,
    EDITION:
      piece.editionNumber === null
        ? context.editionLabel
        : `${context.editionLabel} ${piece.editionNumber}/${context.runSize}`,
    BATCH: context.batchCode,
  }));
}

/**
 * Write the .xlsx.
 *
 * Workbook metadata is pinned to the batch's production date rather than
 * "now", so the file describes the batch rather than the moment it was
 * exported.
 *
 * The file is NOT byte-reproducible across runs. An .xlsx is a zip, and the
 * zip's per-entry modification timestamps come from the clock; two runs over
 * identical rows produce identical content in a container that differs in
 * about 32 bytes. That is fine for what the checksum is actually for -
 * proving the archive arrived at the factory intact - but it means the
 * checksum cannot be used to confirm that a regenerated file matches an
 * earlier one. Regenerating a batch is forbidden anyway (non-negotiable 7);
 * the manifest is the record of what was shipped.
 */
export async function writeFactoryWorkbook(
  rows: readonly FactoryRow[],
  filePath: string,
  meta: { batchCode: string; producedAt: Date },
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BINKIS ID batch generator';
  workbook.created = meta.producedAt;
  workbook.modified = meta.producedAt;

  const sheet = workbook.addWorksheet(meta.batchCode.slice(0, 31));

  sheet.columns = [
    { header: 'LINE', key: 'LINE', width: 8 },
    { header: 'PIECE_NUMBER', key: 'PIECE_NUMBER', width: 16 },
    { header: 'QR_URL', key: 'QR_URL', width: 42 },
    { header: 'CLAIM_CODE', key: 'CLAIM_CODE', width: 18 },
    { header: 'CHARACTER', key: 'CHARACTER', width: 18 },
    { header: 'EDITION', key: 'EDITION', width: 22 },
    { header: 'BATCH', key: 'BATCH', width: 14 },
  ];

  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).alignment = { vertical: 'middle' };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  for (const row of rows) sheet.addRow(row);

  // Serials and codes are read character by character off a screen next to a
  // print run. Monospace, no autocorrect, no scientific notation.
  for (const key of ['PIECE_NUMBER', 'QR_URL', 'CLAIM_CODE'] as const) {
    const column = sheet.getColumn(key);
    column.font = { name: 'Consolas' };
    column.numFmt = '@';
  }

  await workbook.xlsx.writeFile(filePath);
}
