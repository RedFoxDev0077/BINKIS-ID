import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

/**
 * The encrypted factory archive.
 *
 * The .xlsx inside contains plaintext claim codes for an entire production
 * batch. It travels by email, by USB stick, through someone's downloads
 * folder. It is encrypted at rest with AES-256-GCM, which is authenticated:
 * a tampered archive fails to open rather than opening with altered codes.
 *
 * Layout:
 *
 *   magic      8 bytes   "BINKISA1"
 *   ivLength   1 byte
 *   iv         12 bytes
 *   tag        16 bytes
 *   ciphertext rest
 */

const MAGIC = Buffer.from('BINKISA1', 'ascii');
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export class ArchiveError extends Error {
  override name = 'ArchiveError';
}

/** Accepts base64 or hex, and insists on a real 256-bit key. */
export function parseExportKey(raw: string): Buffer {
  if (!raw) {
    throw new ArchiveError(
      'FACTORY_EXPORT_KEY is not set. Refusing to write plaintext claim codes ' +
        'to disk unencrypted. Generate one with: openssl rand -base64 32',
    );
  }

  const key = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, 'hex')
    : Buffer.from(raw, 'base64');

  if (key.length !== 32) {
    throw new ArchiveError(
      `FACTORY_EXPORT_KEY decodes to ${key.length} bytes; AES-256 needs exactly 32.`,
    );
  }
  return key;
}

export function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

export function encryptArchive(plaintext: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([MAGIC, Buffer.from([IV_LENGTH]), iv, tag, ciphertext]);
}

export function decryptArchive(archive: Buffer, key: Buffer): Buffer {
  if (!archive.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new ArchiveError('Not a BINKIS factory archive');
  }
  const ivLength = archive[MAGIC.length]!;
  if (ivLength !== IV_LENGTH) {
    throw new ArchiveError(`Unexpected IV length ${ivLength}`);
  }

  let offset = MAGIC.length + 1;
  const iv = archive.subarray(offset, offset + ivLength);
  offset += ivLength;
  const tag = archive.subarray(offset, offset + TAG_LENGTH);
  offset += TAG_LENGTH;
  const ciphertext = archive.subarray(offset);

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    // GCM authentication failure. Do not fall back, do not partially decode.
    throw new ArchiveError(
      'Archive failed authentication. It was corrupted or tampered with in transit.',
    );
  }
}

export interface ArchiveManifest {
  format: string;
  batch: string;
  rowCount: number;
  workbookFile: string;
  archiveFile: string;
  /** SHA-256 of the .xlsx before encryption. This is the one to check after decrypting. */
  workbookSha256: string;
  /** SHA-256 of the archive as shipped. This is the one to check on receipt. */
  archiveSha256: string;
  cipher: 'AES-256-GCM';
  generatedAt: string;
  columns: readonly string[];
}

export interface SealResult {
  manifest: ArchiveManifest;
  archivePath: string;
  manifestPath: string;
  checksumPath: string;
}

/**
 * Encrypt the workbook, write the archive, and write the checksum and manifest
 * beside it. Returns everything the handover note needs to quote.
 */
export async function sealFactoryExport(args: {
  workbookPath: string;
  archivePath: string;
  manifestPath: string;
  checksumPath: string;
  key: Buffer;
  batchCode: string;
  rowCount: number;
  columns: readonly string[];
  generatedAt: Date;
}): Promise<SealResult> {
  const workbook = await readFile(args.workbookPath);
  const workbookSha256 = sha256(workbook);

  const archive = encryptArchive(workbook, args.key);
  const archiveSha256 = sha256(archive);
  await writeFile(args.archivePath, archive);

  const manifest: ArchiveManifest = {
    format: 'BINKISA1',
    batch: args.batchCode,
    rowCount: args.rowCount,
    workbookFile: basename(args.workbookPath),
    archiveFile: basename(args.archivePath),
    workbookSha256,
    archiveSha256,
    cipher: 'AES-256-GCM',
    generatedAt: args.generatedAt.toISOString(),
    columns: args.columns,
  };

  await writeFile(args.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  // sha256sum-compatible, so the factory can verify with a standard tool.
  await writeFile(
    args.checksumPath,
    `${archiveSha256}  ${manifest.archiveFile}\n${workbookSha256}  ${manifest.workbookFile}\n`,
    'utf8',
  );

  return {
    manifest,
    archivePath: args.archivePath,
    manifestPath: args.manifestPath,
    checksumPath: args.checksumPath,
  };
}

function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}
