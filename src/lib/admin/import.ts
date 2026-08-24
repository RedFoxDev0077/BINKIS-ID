import ExcelJS from 'exceljs';
import type { PrismaClient } from '@prisma/client';
import { parseSerial } from '../serial.ts';

/**
 * Admin import.
 *
 * This exists to bring in the legacy inventory and to correct operational
 * fields in bulk. It deliberately CANNOT create or alter identity.
 *
 * Serials, QR tokens and claim hashes are produced by the batch generator and
 * frozen at export. Letting a spreadsheet write them would put the one
 * unrecoverable thing in this system, the mapping between a physical hologram
 * and its record, behind a file that someone edits by hand. So an import can
 * update verification, country, production year and artwork, and nothing else.
 *
 * Every run is a dry run first. Nothing is written until the operator has seen
 * exactly what would change.
 */

export const IMPORTABLE_FIELDS = ['VERIFIED', 'COUNTRY', 'PRODUCTION_YEAR'] as const;

export interface ImportIssue {
  line: number;
  serial: string;
  problem: string;
}

export interface ImportChange {
  serial: string;
  field: string;
  from: string;
  to: string;
}

export interface ImportReport {
  totalRows: number;
  matched: number;
  changes: ImportChange[];
  issues: ImportIssue[];
  applied: boolean;
}

type Row = Record<string, string>;

/** Accepts .csv or .xlsx, and normalises both into the same row shape. */
export async function readRows(file: Buffer, filename: string): Promise<Row[]> {
  if (/\.csv$/i.test(filename)) return readCsv(file.toString('utf8'));

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(file as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const headers: string[] = [];
  const rows: Row[] = [];
  sheet.eachRow((row, index) => {
    const values = (row.values as unknown[]).slice(1).map((v) => String(v ?? '').trim());
    if (index === 1) {
      headers.push(...values.map((v) => v.toUpperCase()));
      return;
    }
    const record: Row = {};
    headers.forEach((header, i) => {
      record[header] = values[i] ?? '';
    });
    rows.push(record);
  });
  return rows;
}

function readCsv(text: string): Row[] {
  const clean = text.replace(/^﻿/, '');
  const lines: string[][] = [];
  let field = '';
  let record: string[] = [];
  let quoted = false;

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i]!;
    if (quoted) {
      if (char === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ',') {
      record.push(field);
      field = '';
    } else if (char === '\n') {
      record.push(field);
      lines.push(record);
      record = [];
      field = '';
    } else if (char !== '\r') field += char;
  }
  if (field.length > 0 || record.length > 0) {
    record.push(field);
    lines.push(record);
  }

  const header = lines.shift();
  if (!header) return [];
  const headers = header.map((h) => h.trim().toUpperCase());

  return lines
    .filter((cells) => cells.some((c) => c.trim() !== ''))
    .map((cells) => {
      const row: Row = {};
      headers.forEach((h, i) => {
        row[h] = (cells[i] ?? '').trim();
      });
      return row;
    });
}

export async function runImport(
  prisma: PrismaClient,
  rows: readonly Row[],
  options: { apply: boolean; actor: string },
): Promise<ImportReport> {
  const issues: ImportIssue[] = [];
  const changes: ImportChange[] = [];
  let matched = 0;

  for (const [index, row] of rows.entries()) {
    const line = index + 2; // header is line 1
    const serial = (row.SERIAL ?? row.PIECE_NUMBER ?? '').toUpperCase();

    if (!serial) {
      issues.push({ line, serial: '', problem: 'No SERIAL column value' });
      continue;
    }
    if (!parseSerial(serial)) {
      issues.push({ line, serial, problem: 'Not a valid serial (expected XX-NNNNNN)' });
      continue;
    }

    const piece = await prisma.piece.findUnique({
      where: { serial },
      select: { serial: true, verified: true, country: true, productionYear: true, status: true },
    });
    if (!piece) {
      issues.push({ line, serial, problem: 'No piece with that serial' });
      continue;
    }
    matched++;

    // A voided piece is a deliberate end state. An import must not quietly
    // resurrect it.
    if (piece.status === 'VOID') {
      issues.push({ line, serial, problem: 'Piece is void and will not be modified' });
      continue;
    }

    const updates: Record<string, unknown> = {};

    if (row.VERIFIED) {
      const wanted = /^(yes|true|1|si|sí)$/i.test(row.VERIFIED);
      if (wanted !== piece.verified) {
        changes.push({
          serial,
          field: 'VERIFIED',
          from: piece.verified ? 'YES' : 'NO',
          to: wanted ? 'YES' : 'NO',
        });
        updates.verified = wanted;
      }
    }

    if (row.COUNTRY && row.COUNTRY !== piece.country) {
      changes.push({ serial, field: 'COUNTRY', from: piece.country, to: row.COUNTRY });
      updates.country = row.COUNTRY;
    }

    if (row.PRODUCTION_YEAR) {
      const year = Number.parseInt(row.PRODUCTION_YEAR, 10);
      if (!Number.isInteger(year) || year < 2000 || year > 2100) {
        issues.push({ line, serial, problem: `Implausible PRODUCTION_YEAR "${row.PRODUCTION_YEAR}"` });
      } else if (year !== piece.productionYear) {
        changes.push({
          serial,
          field: 'PRODUCTION_YEAR',
          from: String(piece.productionYear),
          to: String(year),
        });
        updates.productionYear = year;
      }
    }

    if (options.apply && Object.keys(updates).length > 0) {
      await prisma.$transaction([
        prisma.piece.update({ where: { serial }, data: updates }),
        prisma.auditLog.create({
          data: {
            actor: options.actor,
            action: 'PIECE_IMPORTED',
            entity: `piece:${serial}`,
            before: {
              verified: piece.verified,
              country: piece.country,
              productionYear: piece.productionYear,
            } as never,
            after: updates as never,
          },
        }),
      ]);
    }
  }

  return { totalRows: rows.length, matched, changes, issues, applied: options.apply };
}
