#!/usr/bin/env node
/**
 * BINKIS ID batch generator.
 *
 * Milestone 1. This is the deliverable that blocks physical manufacturing:
 * it mints the serials, QR tokens and claim codes for a production batch,
 * proves each one works before anything is printed, and hands the factory an
 * encrypted spreadsheet with a checksum.
 *
 * The pipeline, in order, and it stops at the first failure:
 *
 *   1  allocate a contiguous serial range inside the right edition block
 *   2  mint tokens and codes, insert them behind database unique constraints
 *   3  render every QR to SVG and machine-decode every one back
 *   4  claim every code against a staging database, assert it opens its own
 *      piece, then wipe staging
 *   5  write the .xlsx, encrypt it to an AES-256-GCM archive, checksum it
 *   6  freeze the batch
 *
 * Usage:
 *   node scripts/generate-batch.ts \
 *     --character SP --edition classic --quantity 200 --batch B-2026-01
 */

import { parseArgs } from 'node:util';
import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

import { generatePieces, nextFreeSequence } from '../src/lib/generator.ts';
import {
  CHARACTER_CODES,
  EDITION_RANGES,
  allocateSerialNumbers,
  planProduction,
  characterName,
  formatSerial,
  isCharacterCode,
  type EditionType,
} from '../src/lib/serial.ts';
import { assertPepper } from '../src/lib/hash.ts';
import { renderAndVerifyQrCodes } from '../src/lib/verify/qr-roundtrip.ts';
import { rehearseClaims } from '../src/lib/verify/staging-claims.ts';
import { FACTORY_COLUMNS, buildFactoryRows, writeFactoryWorkbook } from '../src/lib/export/xlsx.ts';
import { parseExportKey, sealFactoryExport } from '../src/lib/export/archive.ts';
import type { ErrorCorrectionLevel } from '../src/lib/qr/encode.ts';

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

for (const file of ['.env.local', '.env']) {
  const path = resolve(process.cwd(), file);
  if (existsSync(path)) process.loadEnvFile(path);
}

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

const EDITION_ALIASES: Record<string, EditionType> = {
  classic: 'CLASSIC',
  limited: 'LIMITED',
  'limited-edition': 'LIMITED',
  legendary: 'LEGENDARY',
  spare: 'SPARE',
  'artist-proof': 'ARTIST_PROOF',
  ap: 'ARTIST_PROOF',
};

const argsSchema = z.object({
  character: z
    .string()
    .transform((value) => value.toUpperCase())
    .refine(isCharacterCode, {
      message: `Unknown character code. Expected one of: ${Object.keys(CHARACTER_CODES).join(', ')}`,
    }),
  edition: z
    .string()
    .transform((value) => value.toLowerCase())
    .refine((value) => value in EDITION_ALIASES, {
      message: `Unknown edition. Expected one of: ${Object.keys(EDITION_ALIASES).join(', ')}`,
    })
    .transform((value) => EDITION_ALIASES[value]!),
  quantity: z.coerce.number().int().positive(),
  overage: z.coerce.number().min(0).max(200).default(0),
  batch: z.string().regex(/^[A-Z0-9-]{3,32}$/, 'Batch code must be uppercase letters, digits and hyphens'),
  from: z.coerce.number().int().positive().optional(),
  series: z.string().min(1).default('Series 1'),
  rarity: z.string().min(1).default('Common'),
  runSize: z.coerce.number().int().positive().optional(),
  country: z.string().min(2).max(32).default('CN'),
  producedAt: z.coerce.date().default(() => new Date()),
  origin: z.string().url().default(process.env.PUBLIC_ORIGIN || 'https://id.binkis.com'),
  ec: z.enum(['L', 'M', 'Q', 'H']).default('M'),
  out: z.string().default('./factory-exports'),
  keepPlaintext: z.boolean().default(false),
  skipQr: z.boolean().default(false),
  skipStaging: z.boolean().default(false),
  yes: z.boolean().default(false),
});

function readArgs() {
  const { values } = parseArgs({
    options: {
      character: { type: 'string' },
      edition: { type: 'string' },
      quantity: { type: 'string' },
      overage: { type: 'string' },
      batch: { type: 'string' },
      from: { type: 'string' },
      series: { type: 'string' },
      rarity: { type: 'string' },
      'run-size': { type: 'string' },
      country: { type: 'string' },
      'produced-at': { type: 'string' },
      origin: { type: 'string' },
      ec: { type: 'string' },
      out: { type: 'string' },
      'keep-plaintext': { type: 'boolean' },
      'skip-qr-verification': { type: 'boolean' },
      'skip-staging-verification': { type: 'boolean' },
      yes: { type: 'boolean', short: 'y' },
      help: { type: 'boolean', short: 'h' },
    },
    strict: true,
  });

  if (values.help) {
    printHelp();
    process.exit(0);
  }

  const parsed = argsSchema.safeParse({
    character: values.character,
    edition: values.edition,
    quantity: values.quantity,
    overage: values.overage,
    batch: values.batch,
    from: values.from,
    series: values.series,
    rarity: values.rarity,
    runSize: values['run-size'],
    country: values.country,
    producedAt: values['produced-at'],
    origin: values.origin,
    ec: values.ec,
    out: values.out,
    keepPlaintext: values['keep-plaintext'],
    skipQr: values['skip-qr-verification'],
    skipStaging: values['skip-staging-verification'],
    yes: values.yes,
  });

  if (!parsed.success) {
    console.error('\nInvalid arguments:\n');
    for (const issue of parsed.error.issues) {
      console.error(`  --${String(issue.path[0] ?? '?')}: ${issue.message}`);
    }
    console.error('');
    printHelp();
    process.exit(2);
  }

  return parsed.data;
}

function printHelp(): void {
  console.log(`
BINKIS ID batch generator

  --character <XX>        Character code (${Object.keys(CHARACTER_CODES).join(', ')})
  --edition <type>        ${Object.keys(EDITION_ALIASES).join(' | ')}
  --quantity <n>          Number of SELLABLE pieces
  --overage <percent>     Extra rows on top, for press setup and waste.
                          The hologram factory asked for 30. Refused on
                          edition-numbered runs, where a gap cannot be repaired.
  --batch <CODE>          Batch code, e.g. B-2026-01

  --from <n>              1-based start position in the edition range
                          (default: continues from the last existing piece)
  --series <name>         Default "Series 1"
  --rarity <name>         Default "Common"
  --run-size <n>          Total edition size, for "45/777". Default: quantity
  --country <code>        Country of production. Default "CN"
  --produced-at <date>    ISO date. Default: today
  --origin <url>          QR origin. Default \$PUBLIC_ORIGIN or https://id.binkis.com
  --ec <L|M|Q|H>          QR error correction. Default M (see src/lib/qr/encode.ts)
  --out <dir>             Output directory. Default ./factory-exports

  --keep-plaintext        Keep the unencrypted .xlsx next to the archive.
                          It contains live claim codes. Off by default.
  --skip-qr-verification         DANGEROUS. Skips machine-decoding every QR.
  --skip-staging-verification    DANGEROUS. Skips claiming every code.
  -y, --yes               Do not prompt for confirmation

Environment (.env):
  DATABASE_URL, STAGING_DATABASE_URL, CLAIM_CODE_PEPPER, FACTORY_EXPORT_KEY
`);
}

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

let stepNumber = 0;
function step(title: string): void {
  stepNumber++;
  console.log(`\n[${stepNumber}] ${title}`);
}
function detail(text: string): void {
  console.log(`    ${text}`);
}
function progress(label: string) {
  const interactive = process.stdout.isTTY === true;
  // A carriage return only redraws on a terminal. Piped into a log or a CI
  // job it produces one enormous unreadable line, so step down to a handful
  // of ordinary lines instead.
  const stride = interactive ? 1 : 10;
  let lastPercent = -1;

  return (completed: number, total: number) => {
    const percent = Math.floor((completed / total) * 100);
    const done = completed === total;
    if (!done && Math.floor(percent / stride) === Math.floor(lastPercent / stride)) return;
    lastPercent = percent;

    if (interactive) {
      process.stdout.write(`\r    ${label}: ${completed}/${total} (${percent}%)   `);
      if (done) process.stdout.write('\n');
    } else {
      console.log(`    ${label}: ${completed}/${total} (${percent}%)`);
    }
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = readArgs();

  const pepper = process.env.CLAIM_CODE_PEPPER ?? '';
  assertPepper(pepper);

  const exportKey = parseExportKey(process.env.FACTORY_EXPORT_KEY ?? '');

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not set');

  const stagingUrl = process.env.STAGING_DATABASE_URL;
  if (!stagingUrl && !args.skipStaging) {
    throw new Error(
      'STAGING_DATABASE_URL is not set. The generator claims every code against a ' +
        'staging database before export. Set it, or pass --skip-staging-verification ' +
        'and accept that untested codes may reach the factory.',
    );
  }
  if (stagingUrl === databaseUrl) {
    throw new Error(
      'STAGING_DATABASE_URL and DATABASE_URL point at the same database. The ' +
        'rehearsal claims every piece; running it against the live registry would ' +
        'burn the entire batch.',
    );
  }

  const runSize = args.runSize ?? args.quantity;
  const character = characterName(args.character);
  const range = EDITION_RANGES[args.edition];

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  const outputDir = resolve(process.cwd(), args.out, args.batch);
  const workbookPath = join(outputDir, `${args.batch}.xlsx`);
  const archivePath = join(outputDir, `${args.batch}.xlsx.binkis`);
  const manifestPath = join(outputDir, `${args.batch}.manifest.json`);
  const checksumPath = join(outputDir, `${args.batch}.sha256`);
  const qrDir = join(outputDir, 'qr');

  try {
    // -- plan ---------------------------------------------------------------

    step('Plan');

    const existingBatch = await prisma.batch.findUnique({ where: { code: args.batch } });
    if (existingBatch) {
      throw new Error(
        `Batch ${args.batch} already exists (status ${existingBatch.status}). ` +
          'Generated production data is immutable; use a new batch code.',
      );
    }

    const product = await prisma.product.upsert({
      where: {
        characterCode_editionType_series: {
          characterCode: args.character,
          editionType: args.edition,
          series: args.series,
        },
      },
      update: {},
      create: {
        character,
        characterCode: args.character,
        editionType: args.edition,
        series: args.series,
        rarity: args.rarity,
        runSize,
      },
    });

    // Refuses overage on an edition-numbered run before anything is written.
    const plan = planProduction(args.edition, args.quantity, args.overage);

    const from = args.from ?? (await nextFreeSequence(prisma, args.character, args.edition));
    // Throws before anything is written if the range cannot hold the batch.
    const numbers = allocateSerialNumbers(args.edition, from, plan.total);
    const firstSerial = formatSerial(args.character, numbers[0]!);
    const lastSerial = formatSerial(args.character, numbers.at(-1)!);

    detail(`Character   ${args.character}  ${character}`);
    detail(`Edition     ${args.edition}  (range ${range.min}-${range.max})`);
    detail(`Batch       ${args.batch}`);
    detail(`Sellable    ${plan.sellable}`);
    if (plan.overage > 0) {
      detail(`Overage     ${plan.overage}  (${args.overage}% for press setup and waste)`);
      detail(`Rows        ${plan.total}`);
    }
    detail(`Serials     ${firstSerial} .. ${lastSerial}`);
    detail(`QR origin   ${args.origin}`);
    detail(`Output      ${outputDir}`);

    if (args.skipQr || args.skipStaging) {
      console.log('');
      if (args.skipQr) detail('WARNING: QR machine-decode verification is DISABLED');
      if (args.skipStaging) detail('WARNING: staging claim verification is DISABLED');
    }

    if (!args.yes && process.stdin.isTTY) {
      const ok = await confirm('\n    Proceed? [y/N] ');
      if (!ok) {
        console.log('    Aborted.');
        return;
      }
    }

    await mkdir(outputDir, { recursive: true });

    const batch = await prisma.batch.create({
      data: {
        code: args.batch,
        productId: product.id,
        quantity: plan.total,
        status: 'DRAFT',
      },
    });

    // -- generate -----------------------------------------------------------

    step('Generate serials, QR tokens and claim codes');

    const pieces = await generatePieces({
      prisma,
      batchCode: batch.code,
      quantity: plan.total,
      pepper,
      producedAt: args.producedAt,
      country: args.country,
      startSequence: from,
      onProgress: progress('inserted'),
    });

    await prisma.batch.update({
      where: { id: batch.id },
      data: { status: 'GENERATED' },
    });

    detail(`${pieces.length} pieces written. Only the HMAC of each claim code is stored.`);

    // -- verify QR ----------------------------------------------------------

    if (args.skipQr) {
      step('Render QR codes (verification skipped)');
      detail('Skipped by flag.');
    } else {
      step('Render every QR to SVG and machine-decode it back');
      const qr = await renderAndVerifyQrCodes(pieces, {
        origin: args.origin,
        errorCorrectionLevel: args.ec as ErrorCorrectionLevel,
        outputDir: qrDir,
        onProgress: progress('verified'),
      });
      detail(
        `${qr.verified}/${pieces.length} decoded back to their own URL ` +
          `(version ${qr.version}, ${qr.symbolSize}x${qr.symbolSize} modules, EC ${qr.errorCorrectionLevel})`,
      );
      detail(`SVGs in ${qr.outputDir}`);
    }

    // -- verify claims ------------------------------------------------------

    if (args.skipStaging) {
      step('Staging claim rehearsal (skipped)');
      detail('Skipped by flag.');
    } else {
      step('Claim every generated code against staging, then reset');
      const staging = await rehearseClaims(pieces, {
        stagingUrl: stagingUrl!,
        pepper,
        characterCode: args.character,
        character,
        editionType: args.edition,
        batchCode: args.batch,
        producedAt: args.producedAt,
        country: args.country,
        onProgress: progress('claimed'),
      });
      detail(
        `${staging.claimed}/${pieces.length} claimed, each resolving to its own piece. ` +
          `${staging.ownershipRows} ownership rows, ${staging.passportRows} CLAIMED events.`,
      );
      detail('Staging database wiped.');
    }

    // -- export -------------------------------------------------------------

    step('Write the factory export');

    const rows = buildFactoryRows(pieces, {
      character,
      editionLabel: range.label,
      runSize,
      batchCode: args.batch,
      origin: args.origin,
    });

    await writeFactoryWorkbook(rows, workbookPath, {
      batchCode: args.batch,
      producedAt: args.producedAt,
    });
    detail(`${rows.length} rows: ${FACTORY_COLUMNS.join(' | ')}`);

    const sealed = await sealFactoryExport({
      workbookPath,
      archivePath,
      manifestPath,
      checksumPath,
      key: exportKey,
      batchCode: args.batch,
      rowCount: rows.length,
      columns: FACTORY_COLUMNS,
      generatedAt: new Date(),
    });

    if (!args.keepPlaintext) {
      await rm(workbookPath, { force: true });
      detail('Plaintext .xlsx removed. The archive is the deliverable.');
    } else {
      detail('WARNING: plaintext .xlsx kept on disk. It contains live claim codes.');
    }

    // -- freeze -------------------------------------------------------------

    step('Freeze the batch');

    await prisma.batch.update({
      where: { id: batch.id },
      data: {
        status: 'EXPORTED',
        exportedAt: new Date(),
        checksum: sealed.manifest.archiveSha256,
      },
    });

    await prisma.auditLog.create({
      data: {
        actor: 'cli:generate-batch',
        action: 'BATCH_EXPORTED',
        entity: `batch:${args.batch}`,
        after: {
          sellable: plan.sellable,
          overage: plan.overage,
          quantity: plan.total,
          firstSerial,
          lastSerial,
          rowCount: sealed.manifest.rowCount,
          archiveSha256: sealed.manifest.archiveSha256,
          workbookSha256: sealed.manifest.workbookSha256,
        },
      },
    });

    detail('Batch marked EXPORTED. Its serials, tokens and hashes are now immutable.');

    // -- summary ------------------------------------------------------------

    console.log(`
--------------------------------------------------------------------
  BATCH ${args.batch} READY FOR THE FACTORY
--------------------------------------------------------------------
  Rows            ${sealed.manifest.rowCount}
  Serials         ${firstSerial} .. ${lastSerial}
  Archive         ${sealed.manifest.archiveFile}
  SHA-256         ${sealed.manifest.archiveSha256}
  Workbook SHA    ${sealed.manifest.workbookSha256}
  Cipher          ${sealed.manifest.cipher}
  Manifest        ${sealed.manifest.archiveFile.replace(/\.xlsx\.binkis$/, '.manifest.json')}

  Send the archive and the checksum. Send the key separately, never in
  the same message.
--------------------------------------------------------------------
`);
  } finally {
    await prisma.$disconnect();
  }
}

async function confirm(prompt: string): Promise<boolean> {
  process.stdout.write(prompt);
  const answer = await new Promise<string>((resolveAnswer) => {
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', (data) => resolveAnswer(String(data).trim().toLowerCase()));
  });
  process.stdin.pause();
  return answer === 'y' || answer === 'yes';
}

main().catch((error: unknown) => {
  console.error(`\n  FAILED: ${(error as Error).message}\n`);
  if (process.env.DEBUG) console.error(error);
  process.exitCode = 1;
});
