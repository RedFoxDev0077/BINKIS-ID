import ExcelJS from 'exceljs';
import type { PrismaClient } from '@prisma/client';

/**
 * Admin export.
 *
 * Deliberately NOT the factory export. That one lives in src/lib/export and
 * carries plaintext claim codes under AES-256. This is the operational view:
 * what exists, who owns it, what state it is in. It carries no claim code, no
 * claim hash, no internal id and no owner email, so it can safely be opened on
 * a laptop, mailed to a colleague, or pasted into a spreadsheet.
 */

export const ADMIN_PIECE_COLUMNS = [
  'SERIAL',
  'QR_TOKEN',
  'CHARACTER',
  'SERIES',
  'EDITION',
  'EDITION_NUMBER',
  'RARITY',
  'STATUS',
  'VERIFIED',
  'BATCH',
  'PRODUCTION_YEAR',
  'COUNTRY',
  'OWNER_HANDLE',
  'OWNED_SINCE',
] as const;

export interface AdminPieceRow {
  SERIAL: string;
  QR_TOKEN: string;
  CHARACTER: string;
  SERIES: string;
  EDITION: string;
  EDITION_NUMBER: number | '';
  RARITY: string;
  STATUS: string;
  VERIFIED: string;
  BATCH: string;
  PRODUCTION_YEAR: number;
  COUNTRY: string;
  OWNER_HANDLE: string;
  OWNED_SINCE: string;
}

export async function collectPieceRows(
  prisma: PrismaClient,
  where: { batchCode?: string; status?: string } = {},
): Promise<AdminPieceRow[]> {
  const pieces = await prisma.piece.findMany({
    where: {
      ...(where.batchCode ? { batch: { code: where.batchCode } } : {}),
      ...(where.status ? { status: where.status as never } : {}),
    },
    orderBy: { serial: 'asc' },
    select: {
      serial: true,
      qrToken: true,
      editionNumber: true,
      status: true,
      verified: true,
      productionYear: true,
      country: true,
      product: {
        select: { character: true, series: true, editionType: true, rarity: true },
      },
      batch: { select: { code: true } },
      ownershipEvents: {
        orderBy: { seq: 'desc' },
        take: 1,
        select: {
          occurredAt: true,
          toCollector: { select: { user: { select: { handle: true } } } },
        },
      },
    },
  });

  return pieces.map((piece) => {
    const latest = piece.ownershipEvents[0];
    return {
      SERIAL: piece.serial,
      QR_TOKEN: piece.qrToken,
      CHARACTER: piece.product.character,
      SERIES: piece.product.series,
      EDITION: piece.product.editionType,
      EDITION_NUMBER: piece.editionNumber ?? '',
      RARITY: piece.product.rarity,
      STATUS: piece.status,
      VERIFIED: piece.verified ? 'YES' : 'NO',
      BATCH: piece.batch.code,
      PRODUCTION_YEAR: piece.productionYear,
      COUNTRY: piece.country,
      // Handle only. An admin export is still not a place for personal data.
      OWNER_HANDLE: latest?.toCollector.user.handle ?? '',
      OWNED_SINCE: latest ? latest.occurredAt.toISOString().slice(0, 10) : '',
    };
  });
}

/** RFC 4180 CSV. Quotes everything that could otherwise break a parser. */
export function toCsv(rows: readonly AdminPieceRow[]): string {
  const escape = (value: unknown): string => {
    const text = value === null || value === undefined ? '' : String(value);
    // A leading =, +, - or @ is interpreted as a formula by Excel. Prefixing
    // an apostrophe stops a serial or handle becoming executable content in
    // someone's spreadsheet.
    const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
  };

  const lines = [ADMIN_PIECE_COLUMNS.join(',')];
  for (const row of rows) {
    lines.push(ADMIN_PIECE_COLUMNS.map((col) => escape(row[col])).join(','));
  }
  // BOM so Excel opens UTF-8 correctly on Windows, which is where the client
  // will open it.
  return `﻿${lines.join('\r\n')}\r\n`;
}

export async function toXlsx(rows: readonly AdminPieceRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BINKIS ID';
  const sheet = workbook.addWorksheet('Pieces');

  sheet.columns = ADMIN_PIECE_COLUMNS.map((key) => ({
    header: key,
    key,
    width: key === 'QR_TOKEN' ? 16 : key.length + 6,
  }));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  for (const row of rows) sheet.addRow(row);

  for (const key of ['SERIAL', 'QR_TOKEN'] as const) {
    const column = sheet.getColumn(key);
    column.font = { name: 'Consolas' };
    column.numFmt = '@';
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
