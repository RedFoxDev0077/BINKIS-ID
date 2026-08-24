#!/usr/bin/env node
/**
 * Development seed.
 *
 * Creates a product, a batch, a handful of pieces and a demo collector so the
 * passport and claim flows can be exercised locally. It uses the real
 * generator, so the pieces it creates are indistinguishable from production
 * ones apart from living in a throwaway database.
 *
 * Refuses to run against a database that already holds a real batch, so it
 * cannot be pointed at production by accident.
 */
import { PrismaClient } from '@prisma/client';
import { generatePieces } from '../src/lib/generator.ts';
import { hashPassword } from '../src/lib/auth/password.ts';
import { formatClaimCode } from '../src/lib/codes/claim-code.ts';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

for (const file of ['.env.local', '.env']) {
  const path = resolve(process.cwd(), file);
  if (existsSync(path)) process.loadEnvFile(path);
}

const prisma = new PrismaClient();

async function main() {
  const pepper = process.env.CLAIM_CODE_PEPPER;
  if (!pepper) throw new Error('CLAIM_CODE_PEPPER is not set');

  const exported = await prisma.batch.count({ where: { status: 'EXPORTED' } });
  if (exported > 0) {
    throw new Error(
      `This database holds ${exported} exported batch(es). Refusing to seed over real production data.`,
    );
  }

  const product = await prisma.product.upsert({
    where: {
      characterCode_editionType_series: {
        characterCode: 'RF',
        editionType: 'LIMITED',
        series: 'Series 1',
      },
    },
    update: {},
    create: {
      character: 'Reverse Flash',
      characterCode: 'RF',
      editionType: 'LIMITED',
      series: 'Series 1',
      rarity: 'Legendary',
      runSize: 777,
    },
  });

  // Idempotent: clear a previous seed batch child-first. Deleting the batch
  // on its own violates pieces_batch_id_fkey, which is the foreign key doing
  // exactly its job - a batch must never be removable out from under the
  // pieces that were manufactured from it.
  const batchCode = 'B-SEED-01';
  const previous = await prisma.piece.findMany({
    where: { batch: { code: batchCode } },
    select: { id: true },
  });
  const previousIds = previous.map((piece) => piece.id);
  if (previousIds.length > 0) {
    await prisma.transfer.deleteMany({ where: { pieceId: { in: previousIds } } });
    await prisma.passportEvent.deleteMany({ where: { pieceId: { in: previousIds } } });
    await prisma.ownershipEvent.deleteMany({ where: { pieceId: { in: previousIds } } });
    await prisma.piece.deleteMany({ where: { id: { in: previousIds } } });
  }
  await prisma.batch.deleteMany({ where: { code: batchCode } });
  const batch = await prisma.batch.create({
    data: { code: batchCode, productId: product.id, quantity: 6, status: 'GENERATED' },
  });

  const pieces = await generatePieces({
    prisma,
    batchCode: batch.code,
    quantity: 6,
    pepper,
    producedAt: new Date('2026-02-01'),
    country: 'MX',
  });

  // A BORN event, so the timeline is not empty on a fresh piece.
  for (const piece of pieces) {
    const row = await prisma.piece.findUniqueOrThrow({ where: { serial: piece.serial } });
    await prisma.passportEvent.create({
      data: {
        pieceId: row.id,
        seq: 1,
        type: 'BORN',
        title: 'Manufactured in Mexico',
        body: `${product.character}, ${product.series}, piece ${piece.editionNumber} of ${product.runSize}.`,
        occurredAt: new Date('2026-02-01'),
      },
    });
  }

  // Same story for the demo account: CollectorId is onDelete: Restrict, so a
  // user cannot be removed while a collector profile points at them. That is
  // deliberate - a collector who owns pieces must never vanish and orphan the
  // ownership ledger - so the seed clears the profile explicitly.
  const email = 'demo@binkis.test';
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) {
    await prisma.collectorId.deleteMany({ where: { userId: existing.id } });
    await prisma.session.deleteMany({ where: { userId: existing.id } });
    await prisma.user.delete({ where: { id: existing.id } });
  }
  const user = await prisma.user.create({
    data: { email, handle: 'demo', passwordHash: await hashPassword('demo-password-1234') },
  });
  await prisma.collectorId.create({ data: { userId: user.id, displayName: 'Demo Collector' } });

  console.log('\nSeeded.\n');
  console.log(`  sign in    ${email} / demo-password-1234`);
  console.log('  passports:');
  for (const piece of pieces) {
    console.log(`    ${piece.serial}  /p/${piece.qrToken}   code ${formatClaimCode(piece.claimCode)}`);
  }
  console.log('');
}

main()
  .catch((error) => {
    console.error(`\nSeed failed: ${(error as Error).message}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
