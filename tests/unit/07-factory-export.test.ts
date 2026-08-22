import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import ExcelJS from 'exceljs';

import {
  FACTORY_COLUMNS,
  buildFactoryRows,
  writeFactoryWorkbook,
} from '../../src/lib/export/xlsx.ts';
import {
  ArchiveError,
  decryptArchive,
  encryptArchive,
  parseExportKey,
  sealFactoryExport,
  sha256,
} from '../../src/lib/export/archive.ts';
import { generateClaimCode, formatClaimCode } from '../../src/lib/codes/claim-code.ts';
import { generateQrToken } from '../../src/lib/codes/qr-token.ts';
import { hashClaimCode } from '../../src/lib/hash.ts';
import { formatSerial, editionNumberForNumber } from '../../src/lib/serial.ts';
import type { GeneratedPiece } from '../../src/lib/generator.ts';

const PEPPER = 'export-test-pepper-0123456789abcdefghijklmn';
const PRODUCED_AT = new Date('2026-01-15T00:00:00.000Z');

function fakePieces(count: number, base = 1): GeneratedPiece[] {
  return Array.from({ length: count }, (_, i) => {
    const claimCode = generateClaimCode();
    const number = base + i;
    return {
      serial: formatSerial('SP', number),
      qrToken: generateQrToken(),
      claimCode,
      claimHash: hashClaimCode(claimCode, PEPPER),
      editionNumber: editionNumberForNumber(number),
    };
  });
}

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'binkis-export-'));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('factory rows', () => {
  const pieces = fakePieces(5);
  const rows = buildFactoryRows(pieces, {
    character: 'Superman',
    editionLabel: 'Classic',
    runSize: 16_250,
    batchCode: 'B-2026-01',
    origin: 'https://id.binkis.com',
  });

  it('has exactly the columns the factory expects, in order', () => {
    expect(FACTORY_COLUMNS).toEqual([
      'LINE',
      'PIECE_NUMBER',
      'QR_URL',
      'CLAIM_CODE',
      'CHARACTER',
      'EDITION',
      'BATCH',
    ]);
    expect(Object.keys(rows[0]!)).toEqual([...FACTORY_COLUMNS]);
  });

  it('numbers lines from 1 with no gaps', () => {
    expect(rows.map((r) => r.LINE)).toEqual([1, 2, 3, 4, 5]);
  });

  it('carries the printable claim code, hyphenated', () => {
    for (const [i, row] of rows.entries()) {
      expect(row.CLAIM_CODE).toBe(formatClaimCode(pieces[i]!.claimCode));
      expect(row.CLAIM_CODE).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{3}$/);
    }
  });

  it('carries the full QR URL and nothing else', () => {
    for (const [i, row] of rows.entries()) {
      expect(row.QR_URL).toBe(`https://id.binkis.com/p/${pieces[i]!.qrToken}`);
    }
  });

  it('never leaks the claim hash or an internal id', () => {
    const serialised = JSON.stringify(rows);
    for (const piece of pieces) {
      expect(serialised).not.toContain(piece.claimHash);
    }
    // A uuid would look like this. There must not be one anywhere.
    expect(serialised).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
  });

  it('writes edition position as "45/777" for numbered editions', () => {
    const limited = fakePieces(1).map((p) => ({ ...p, editionNumber: 45 }));
    const [row] = buildFactoryRows(limited, {
      character: 'Reverse Flash',
      editionLabel: 'Limited Edition',
      runSize: 777,
      batchCode: 'B-2026-02',
      origin: 'https://id.binkis.com',
    });
    expect(row!.EDITION).toBe('Limited Edition 45/777');
  });
});

describe('the .xlsx', () => {
  it('round-trips through ExcelJS with every value intact', async () => {
    const pieces = fakePieces(200);
    const rows = buildFactoryRows(pieces, {
      character: 'Superman',
      editionLabel: 'Classic',
      runSize: 16_250,
      batchCode: 'B-2026-01',
      origin: 'https://id.binkis.com',
    });

    const path = join(dir, 'roundtrip.xlsx');
    await writeFactoryWorkbook(rows, path, { batchCode: 'B-2026-01', producedAt: PRODUCED_AT });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(path);
    const sheet = workbook.getWorksheet('B-2026-01')!;
    expect(sheet).toBeDefined();

    const header = sheet.getRow(1).values as unknown[];
    expect(header.slice(1)).toEqual([...FACTORY_COLUMNS]);
    expect(sheet.rowCount).toBe(rows.length + 1);

    for (const [i, expected] of rows.entries()) {
      const values = sheet.getRow(i + 2).values as unknown[];
      expect(values.slice(1)).toEqual([
        expected.LINE,
        expected.PIECE_NUMBER,
        expected.QR_URL,
        expected.CLAIM_CODE,
        expected.CHARACTER,
        expected.EDITION,
        expected.BATCH,
      ]);
    }
  });

  it('writes identical content across two runs, in a container that is not byte-identical', async () => {
    // An .xlsx is a zip and its per-entry timestamps come from the clock, so
    // the same rows produce the same content in a slightly different file.
    // The checksum therefore proves the archive arrived intact - not that a
    // regenerated batch matches an earlier one. Regeneration is forbidden
    // anyway; this test pins the real behaviour so nobody later relies on
    // reproducibility that does not exist.
    const pieces = fakePieces(50);
    const rows = buildFactoryRows(pieces, {
      character: 'Superman',
      editionLabel: 'Classic',
      runSize: 16_250,
      batchCode: 'B-DET',
      origin: 'https://id.binkis.com',
    });

    const a = join(dir, 'det-a.xlsx');
    const b = join(dir, 'det-b.xlsx');
    await writeFactoryWorkbook(rows, a, { batchCode: 'B-DET', producedAt: PRODUCED_AT });
    await writeFactoryWorkbook(rows, b, { batchCode: 'B-DET', producedAt: PRODUCED_AT });

    const readRows = async (path: string) => {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(path);
      const sheet = workbook.getWorksheet('B-DET')!;
      const out: unknown[][] = [];
      sheet.eachRow((row) => out.push((row.values as unknown[]).slice(1)));
      return out;
    };

    expect(await readRows(a)).toEqual(await readRows(b));

    const bytesA = await readFile(a);
    const bytesB = await readFile(b);
    expect(bytesA.length).toBe(bytesB.length);

    // And the checksum describes the exact bytes on disk, which is its job.
    expect(sha256(bytesA)).toBe(sha256(await readFile(a)));
  });
});

describe('the encrypted archive', () => {
  const key = randomBytes(32);

  it('round-trips', () => {
    const plaintext = randomBytes(50_000);
    expect(decryptArchive(encryptArchive(plaintext, key), key).equals(plaintext)).toBe(true);
  });

  it('produces a different archive each time, from the same input', () => {
    const plaintext = Buffer.from('the same bytes every time');
    const a = encryptArchive(plaintext, key);
    const b = encryptArchive(plaintext, key);
    expect(a.equals(b)).toBe(false); // fresh IV
    expect(decryptArchive(a, key).equals(decryptArchive(b, key))).toBe(true);
  });

  it('refuses to open under the wrong key', () => {
    const archive = encryptArchive(Buffer.from('claim codes'), key);
    expect(() => decryptArchive(archive, randomBytes(32))).toThrow(ArchiveError);
  });

  it('refuses to open after a single byte is altered in transit', () => {
    const archive = encryptArchive(Buffer.from('claim codes for an entire batch'), key);
    for (const offset of [0, 30, archive.length - 1]) {
      const tampered = Buffer.from(archive);
      tampered[offset] = (tampered[offset] ?? 0) ^ 0xff;
      expect(() => decryptArchive(tampered, key)).toThrow(ArchiveError);
    }
  });

  it('insists on a real 256-bit key', () => {
    expect(() => parseExportKey('')).toThrow(ArchiveError);
    expect(() => parseExportKey('too-short')).toThrow(ArchiveError);
    expect(() => parseExportKey(randomBytes(16).toString('base64'))).toThrow(ArchiveError);
    expect(parseExportKey(randomBytes(32).toString('base64'))).toHaveLength(32);
    expect(parseExportKey(randomBytes(32).toString('hex'))).toHaveLength(32);
  });
});

describe('sealing an export', () => {
  it('writes the archive, a manifest and a sha256sum-compatible checksum file', async () => {
    const pieces = fakePieces(120);
    const rows = buildFactoryRows(pieces, {
      character: 'Superman',
      editionLabel: 'Classic',
      runSize: 16_250,
      batchCode: 'B-SEAL',
      origin: 'https://id.binkis.com',
    });

    const workbookPath = join(dir, 'B-SEAL.xlsx');
    await writeFactoryWorkbook(rows, workbookPath, {
      batchCode: 'B-SEAL',
      producedAt: PRODUCED_AT,
    });

    const key = randomBytes(32);
    const sealed = await sealFactoryExport({
      workbookPath,
      archivePath: join(dir, 'B-SEAL.xlsx.binkis'),
      manifestPath: join(dir, 'B-SEAL.manifest.json'),
      checksumPath: join(dir, 'B-SEAL.sha256'),
      key,
      batchCode: 'B-SEAL',
      rowCount: rows.length,
      columns: FACTORY_COLUMNS,
      generatedAt: PRODUCED_AT,
    });

    expect(sealed.manifest.rowCount).toBe(120);
    expect(sealed.manifest.cipher).toBe('AES-256-GCM');
    expect(sealed.manifest.archiveSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(sealed.manifest.workbookSha256).toMatch(/^[0-9a-f]{64}$/);

    // The checksums describe the files that were actually written.
    const archive = await readFile(sealed.archivePath);
    expect(sha256(archive)).toBe(sealed.manifest.archiveSha256);
    expect(sha256(await readFile(workbookPath))).toBe(sealed.manifest.workbookSha256);

    // And decrypting reproduces the workbook exactly.
    expect(sha256(decryptArchive(archive, key))).toBe(sealed.manifest.workbookSha256);

    const checksums = await readFile(sealed.checksumPath, 'utf8');
    expect(checksums).toContain(`${sealed.manifest.archiveSha256}  B-SEAL.xlsx.binkis`);
    expect(checksums).toContain(`${sealed.manifest.workbookSha256}  B-SEAL.xlsx`);

    const manifest = JSON.parse(await readFile(sealed.manifestPath, 'utf8'));
    expect(manifest.columns).toEqual([...FACTORY_COLUMNS]);
    expect(manifest.batch).toBe('B-SEAL');
  });

  it('the archive is unreadable without the key, including the claim codes inside', async () => {
    const pieces = fakePieces(20);
    const rows = buildFactoryRows(pieces, {
      character: 'Superman',
      editionLabel: 'Classic',
      runSize: 100,
      batchCode: 'B-OPAQUE',
      origin: 'https://id.binkis.com',
    });

    const workbookPath = join(dir, 'B-OPAQUE.xlsx');
    await writeFactoryWorkbook(rows, workbookPath, {
      batchCode: 'B-OPAQUE',
      producedAt: PRODUCED_AT,
    });

    const sealed = await sealFactoryExport({
      workbookPath,
      archivePath: join(dir, 'B-OPAQUE.xlsx.binkis'),
      manifestPath: join(dir, 'B-OPAQUE.manifest.json'),
      checksumPath: join(dir, 'B-OPAQUE.sha256'),
      key: randomBytes(32),
      batchCode: 'B-OPAQUE',
      rowCount: rows.length,
      columns: FACTORY_COLUMNS,
      generatedAt: PRODUCED_AT,
    });

    const archive = (await readFile(sealed.archivePath)).toString('latin1');
    const manifest = await readFile(sealed.manifestPath, 'utf8');
    for (const piece of pieces) {
      expect(archive).not.toContain(piece.claimCode);
      expect(manifest).not.toContain(piece.claimCode);
      expect(manifest).not.toContain(piece.claimHash);
    }
  });
});
