import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { testClient, reset, seedProductAndBatch, seedCollector, TEST_PEPPER } from '../support/fixtures.ts';
import { generatePieces } from '../../src/lib/generator.ts';
import { claimPiece, GENERIC_CLAIM_FAILURE, type ClaimOutcome } from '../../src/lib/db/claim.ts';
import { formatClaimCode, generateClaimCode } from '../../src/lib/codes/claim-code.ts';

// Non-negotiable 3: claiming is a single atomic transaction with a conditional
// write. Two simultaneous claims with the same valid code must produce exactly
// one winner and one deterministic rejection. Never a duplicate ownership row.
//
// Non-negotiable 2: the ownership ledger is append only. There is no
// current_owner column to race on.

let prisma: PrismaClient;

beforeAll(() => {
  prisma = testClient('main');
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await reset(prisma);
});

async function seedOnePiece() {
  const { batch } = await seedProductAndBatch(prisma, { batchCode: 'B-CLAIM-01', quantity: 4 });
  const pieces = await generatePieces({
    prisma,
    batchCode: batch.code,
    quantity: 4,
    pepper: TEST_PEPPER,
    producedAt: new Date('2026-01-15'),
    country: 'CN',
  });
  return pieces;
}

describe('exactly one winner under concurrency', () => {
  it('two simultaneous claims with the same valid code produce one winner and one rejection', async () => {
    const [target] = await seedOnePiece();
    const alice = await seedCollector(prisma, 'alice');
    const bob = await seedCollector(prisma, 'bob');

    // Two independent clients means two real PostgreSQL connections racing,
    // not two awaits on the same one.
    const clientA = testClient('main');
    const clientB = testClient('main');
    try {
      const [a, b] = await Promise.all([
        claimPiece(clientA, {
          qrToken: target!.qrToken,
          submittedCode: target!.claimCode,
          collectorId: alice.id,
          pepper: TEST_PEPPER,
          ip: '10.0.0.1',
        }),
        claimPiece(clientB, {
          qrToken: target!.qrToken,
          submittedCode: target!.claimCode,
          collectorId: bob.id,
          pepper: TEST_PEPPER,
          ip: '10.0.0.2',
        }),
      ]);

      const winners = [a, b].filter((r) => r.ok);
      const losers = [a, b].filter((r) => !r.ok);
      expect(winners).toHaveLength(1);
      expect(losers).toHaveLength(1);
      expect(losers[0]).toEqual({ ok: false, message: GENERIC_CLAIM_FAILURE });
    } finally {
      await clientA.$disconnect();
      await clientB.$disconnect();
    }

    const events = await prisma.ownershipEvent.findMany({ where: { pieceId: undefined } });
    expect(events).toHaveLength(1);
    expect(events[0]!.seq).toBe(1);
    expect(events[0]!.acquiredVia).toBe('CLAIM');
    expect(events[0]!.fromCollectorId).toBeNull();
  });

  it('sixteen simultaneous claims produce exactly one ownership row', async () => {
    const [target] = await seedOnePiece();
    const CONTENDERS = 16;

    const collectors: Array<{ id: string }> = [];
    for (let i = 0; i < CONTENDERS; i++) {
      collectors.push(await seedCollector(prisma, `racer${i}`));
    }

    // Sixteen concurrent connections, but only four Prisma clients. Each
    // client is a full query engine, and sixteen of those is enough to make
    // connection setup itself fail on a modest machine - which tests the
    // harness rather than the claim path. Four clients with a pool of six
    // apiece still puts sixteen genuinely separate PostgreSQL connections on
    // the same row at the same instant, which is what actually matters.
    const CLIENTS = 4;
    const clients = Array.from({ length: CLIENTS }, () => testClient('main', 6));

    try {
      // Connect and warm every client BEFORE the race. Otherwise what gets
      // measured is a burst of connection handshakes rather than a burst of
      // claims, and the contention that matters never actually happens.
      for (const client of clients) {
        await client.$connect();
        await client.$queryRawUnsafe('SELECT 1');
      }

      // Release all sixteen at the same moment.
      let openGate = () => {};
      const gate = new Promise<void>((resolveGate) => {
        openGate = resolveGate;
      });
      const attempts = Array.from({ length: CONTENDERS }, (_, i) =>
        gate.then((): Promise<ClaimOutcome> =>
          claimPiece(clients[i % CLIENTS]!, {
            qrToken: target!.qrToken,
            submittedCode: target!.claimCode,
            collectorId: collectors[i]!.id,
            pepper: TEST_PEPPER,
            ip: `10.0.1.${i}`,
            transaction: { maxWait: 60_000, timeout: 60_000 },
          }),
        ),
      );
      openGate();

      const results = await Promise.all(attempts);

      expect(results.filter((r) => r.ok)).toHaveLength(1);
      // Every single rejection is byte-identical.
      for (const failure of results.filter((r) => !r.ok)) {
        expect(failure).toEqual({ ok: false, message: GENERIC_CLAIM_FAILURE });
      }
    } finally {
      await Promise.all(clients.map((c) => c.$disconnect()));
    }

    const ownership = await prisma.ownershipEvent.findMany();
    expect(ownership).toHaveLength(1);

    const claimed = await prisma.passportEvent.findMany({ where: { type: 'CLAIMED' } });
    expect(claimed).toHaveLength(1);

    const piece = await prisma.piece.findUniqueOrThrow({ where: { qrToken: target!.qrToken } });
    expect(piece.status).toBe('CLAIMED');
  }, 120_000);

  it('the winner is the collector recorded in the ledger, and nobody else', async () => {
    const [target] = await seedOnePiece();
    const collectors = [
      await seedCollector(prisma, 'one'),
      await seedCollector(prisma, 'two'),
      await seedCollector(prisma, 'three'),
    ];

    const clients = collectors.map(() => testClient('main'));
    let winnerCollectorId: string | null = null;
    try {
      const results = await Promise.all(
        clients.map((client, i) =>
          claimPiece(client, {
            qrToken: target!.qrToken,
            submittedCode: target!.claimCode,
            collectorId: collectors[i]!.id,
            pepper: TEST_PEPPER,
            ip: '10.0.2.1',
          }).then((r) => ({ r, collectorId: collectors[i]!.id })),
        ),
      );
      const winner = results.find((x) => x.r.ok);
      expect(winner).toBeDefined();
      winnerCollectorId = winner!.collectorId;
    } finally {
      await Promise.all(clients.map((c) => c.$disconnect()));
    }

    const ownership = await prisma.ownershipEvent.findMany();
    expect(ownership).toHaveLength(1);
    expect(ownership[0]!.toCollectorId).toBe(winnerCollectorId);
  });

  it('leaves no partial state behind when a claim loses the race', async () => {
    const [target] = await seedOnePiece();
    const a = await seedCollector(prisma, 'first');
    const b = await seedCollector(prisma, 'second');

    const clientA = testClient('main');
    const clientB = testClient('main');
    try {
      await Promise.all([
        claimPiece(clientA, { qrToken: target!.qrToken, submittedCode: target!.claimCode, collectorId: a.id, pepper: TEST_PEPPER, ip: '1.1.1.1' }),
        claimPiece(clientB, { qrToken: target!.qrToken, submittedCode: target!.claimCode, collectorId: b.id, pepper: TEST_PEPPER, ip: '1.1.1.2' }),
      ]);
    } finally {
      await clientA.$disconnect();
      await clientB.$disconnect();
    }

    // The loser must not have written a passport event, an ownership event,
    // or flipped anything. One claim, one of each.
    expect(await prisma.ownershipEvent.count()).toBe(1);
    expect(await prisma.passportEvent.count({ where: { type: 'CLAIMED' } })).toBe(1);
    expect(await prisma.piece.count({ where: { status: 'CLAIMED' } })).toBe(1);
  });
});

describe('sequential claims after the first are rejected the same way', () => {
  it('a second claim of an already-claimed piece is rejected', async () => {
    const [target] = await seedOnePiece();
    const a = await seedCollector(prisma, 'owner');
    const b = await seedCollector(prisma, 'latecomer');

    const first = await claimPiece(prisma, {
      qrToken: target!.qrToken, submittedCode: target!.claimCode,
      collectorId: a.id, pepper: TEST_PEPPER, ip: '2.2.2.2',
    });
    expect(first.ok).toBe(true);

    const second = await claimPiece(prisma, {
      qrToken: target!.qrToken, submittedCode: target!.claimCode,
      collectorId: b.id, pepper: TEST_PEPPER, ip: '2.2.2.3',
    });
    expect(second).toEqual({ ok: false, message: GENERIC_CLAIM_FAILURE });
    expect(await prisma.ownershipEvent.count()).toBe(1);
  });

  it('never UPDATEs or DELETEs an ownership row', async () => {
    const [target] = await seedOnePiece();
    const a = await seedCollector(prisma, 'ledger-owner');

    await claimPiece(prisma, {
      qrToken: target!.qrToken, submittedCode: target!.claimCode,
      collectorId: a.id, pepper: TEST_PEPPER, ip: '3.3.3.3',
    });

    const before = await prisma.ownershipEvent.findMany();
    // A losing claim, a wrong code and a repeat all run against the same row.
    const b = await seedCollector(prisma, 'intruder');
    await claimPiece(prisma, { qrToken: target!.qrToken, submittedCode: target!.claimCode, collectorId: b.id, pepper: TEST_PEPPER, ip: '3.3.3.4' });
    await claimPiece(prisma, { qrToken: target!.qrToken, submittedCode: generateClaimCode(), collectorId: b.id, pepper: TEST_PEPPER, ip: '3.3.3.5' });

    const after = await prisma.ownershipEvent.findMany();
    expect(after).toEqual(before);
  });
});

describe('the claim endpoint is not an oracle', () => {
  it('wrong code, already claimed, and right-code-wrong-piece are indistinguishable', async () => {
    const pieces = await seedOnePiece();
    const [pieceA, pieceB] = pieces;
    const collector = await seedCollector(prisma, 'prober');
    const other = await seedCollector(prisma, 'legit');

    // Claim piece A so we have an "already claimed" case.
    await claimPiece(prisma, {
      qrToken: pieceA!.qrToken, submittedCode: pieceA!.claimCode,
      collectorId: other.id, pepper: TEST_PEPPER, ip: '4.4.4.4',
    });

    const wrongCode = await claimPiece(prisma, {
      qrToken: pieceB!.qrToken, submittedCode: generateClaimCode(), // valid shape, correct check character, no such code
      collectorId: collector.id, pepper: TEST_PEPPER, ip: '4.4.4.5',
    });

    const alreadyClaimed = await claimPiece(prisma, {
      qrToken: pieceA!.qrToken, submittedCode: pieceA!.claimCode,
      collectorId: collector.id, pepper: TEST_PEPPER, ip: '4.4.4.6',
    });

    // A real, live claim code - but for a different piece. This is the
    // dangerous one: leaking that the code exists turns the endpoint into a
    // code oracle across the whole production run.
    const rightCodeWrongPiece = await claimPiece(prisma, {
      qrToken: pieceB!.qrToken, submittedCode: pieces[2]!.claimCode,
      collectorId: collector.id, pepper: TEST_PEPPER, ip: '4.4.4.7',
    });

    const unknownToken = await claimPiece(prisma, {
      qrToken: 'ZZZZZZZZZZZZ', submittedCode: pieceB!.claimCode,
      collectorId: collector.id, pepper: TEST_PEPPER, ip: '4.4.4.8',
    });

    const expected = { ok: false, message: GENERIC_CLAIM_FAILURE };
    expect(wrongCode).toEqual(expected);
    expect(alreadyClaimed).toEqual(expected);
    expect(rightCodeWrongPiece).toEqual(expected);
    expect(unknownToken).toEqual(expected);

    // And the near-miss must not have consumed the real piece.
    const pieceC = await prisma.piece.findUniqueOrThrow({ where: { qrToken: pieces[2]!.qrToken } });
    expect(pieceC.status).toBe('UNCLAIMED');
  });

  it('records the true reason internally for audit while telling the caller nothing', async () => {
    const pieces = await seedOnePiece();
    const collector = await seedCollector(prisma, 'auditee');

    await claimPiece(prisma, {
      qrToken: pieces[0]!.qrToken, submittedCode: generateClaimCode(),
      collectorId: collector.id, pepper: TEST_PEPPER, ip: '5.5.5.5',
    });

    const attempts = await prisma.claimAttempt.findMany();
    expect(attempts).toHaveLength(1);
    expect(attempts[0]!.succeeded).toBe(false);
    expect(attempts[0]!.ip).toBe('5.5.5.5');

    const audit = await prisma.auditLog.findMany({ where: { action: 'CLAIM_FAILED' } });
    expect(audit.length).toBeGreaterThan(0);
    // The internal record is specific; the caller-facing message was not.
    expect(JSON.stringify(audit[0]!.after)).toMatch(/no_matching_code/);
  });

  it('never writes the submitted plaintext code into the audit trail', async () => {
    const pieces = await seedOnePiece();
    const collector = await seedCollector(prisma, 'no-plaintext');
    const submitted = pieces[0]!.claimCode;

    await claimPiece(prisma, {
      qrToken: pieces[0]!.qrToken, submittedCode: submitted,
      collectorId: collector.id, pepper: TEST_PEPPER, ip: '6.6.6.6',
    });

    const audit = JSON.stringify(await prisma.auditLog.findMany());
    const attempts = JSON.stringify(await prisma.claimAttempt.findMany());
    expect(audit).not.toContain(submitted);
    expect(attempts).not.toContain(submitted);
    expect(audit).not.toContain(formatClaimCode(submitted));
  });

  it('rejects a code that fails the check character without touching the database', async () => {
    const pieces = await seedOnePiece();
    const collector = await seedCollector(prisma, 'typo');
    const before = await prisma.claimAttempt.count();

    // Last character mangled, so the check character no longer validates.
    const good = pieces[0]!.claimCode;
    const badChar = good[10] === 'Z' ? 'Y' : 'Z';
    const typo = good.slice(0, 10) + badChar;

    const result = await claimPiece(prisma, {
      qrToken: pieces[0]!.qrToken, submittedCode: typo,
      collectorId: collector.id, pepper: TEST_PEPPER, ip: '7.7.7.7',
    });

    expect(result).toEqual({ ok: false, message: GENERIC_CLAIM_FAILURE });
    // A typo must not burn a rate-limited attempt.
    expect(await prisma.claimAttempt.count()).toBe(before);
    expect(await prisma.piece.count({ where: { status: 'CLAIMED' } })).toBe(0);
  });
});
