import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { testClient, reset, seedProductAndBatch, TEST_PEPPER } from '../support/fixtures.ts';
import { generatePieces } from '../../src/lib/generator.ts';
import { getPassportByToken, type PublicPassport } from '../../src/lib/passport.ts';

/**
 * Dates must survive the cache.
 *
 * unstable_cache stores its result as JSON. A Date goes in and an ISO string
 * comes out, and nothing complains on the way: the value is truthy, it prints
 * fine in a template, and TypeScript still believes it is a Date because the
 * cast says so. It fails at the first thing that does real date arithmetic,
 * which took the whole passport page down with "RangeError: Invalid time
 * value" on every scan.
 *
 * The unit tests all passed while that was live, because none of them render
 * the page. These are the tests that would have caught it: they assert the
 * shape survives a JSON round trip, and they fail if a new Date field is
 * added to PublicPassport without being revived.
 */

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

async function seedOne() {
  const { batch } = await seedProductAndBatch(prisma, { batchCode: 'B-CACHE-01', quantity: 1 });
  const [piece] = await generatePieces({
    prisma,
    batchCode: batch.code,
    quantity: 1,
    pepper: TEST_PEPPER,
    producedAt: new Date('2026-02-01'),
    country: 'MX',
  });
  const row = await prisma.piece.findUniqueOrThrow({ where: { serial: piece!.serial } });
  await prisma.passportEvent.create({
    data: {
      pieceId: row.id,
      seq: 1,
      type: 'BORN',
      title: 'Manufactured in Mexico',
      occurredAt: new Date('2026-02-01'),
    },
  });
  return piece!;
}

/** Exactly what unstable_cache does to a value on the way in and out. */
function throughJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Every path on PublicPassport that holds a Date. Keep in step with revive(). */
function datePathsOf(passport: PublicPassport): Array<[string, unknown]> {
  return [
    ['producedAt', passport.producedAt],
    ...passport.events.map(
      (e, i) => [`events[${i}].occurredAt`, e.occurredAt] as [string, unknown],
    ),
  ];
}

describe('the cached read path', () => {
  it('finds every Date the passport carries', async () => {
    const piece = await seedOne();
    const passport = await getPassportByToken(piece.qrToken, prisma);
    expect(passport).not.toBeNull();

    // Walk the real object and count Dates, then compare against the list
    // revive() maintains. If someone adds a Date field and forgets to revive
    // it, these two disagree and this test fails.
    const found: string[] = [];
    const walk = (value: unknown, path: string) => {
      if (value instanceof Date) {
        found.push(path);
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((v, i) => walk(v, `${path}[${i}]`));
        return;
      }
      if (value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) walk(v, path ? `${path}.${k}` : k);
      }
    };
    walk(passport, '');

    const declared = datePathsOf(passport!).map(([p]) => p.replace(/\[(\d+)\]\./g, '[$1].'));
    expect(found.sort()).toEqual(declared.sort());
  });

  it('a JSON round trip turns every Date into a string, which is the bug', async () => {
    const piece = await seedOne();
    const passport = (await getPassportByToken(piece.qrToken, prisma))!;

    const roundTripped = throughJson(passport);

    // This is what the page received while it was broken.
    expect(typeof roundTripped.producedAt).toBe('string');
    expect(roundTripped.producedAt).not.toBeInstanceOf(Date);
    expect(() => new Date(roundTripped.producedAt).toISOString()).not.toThrow();
  });

  it('reviving restores real Dates with the same instants', async () => {
    const piece = await seedOne();
    const passport = (await getPassportByToken(piece.qrToken, prisma))!;
    const roundTripped = throughJson(passport);

    // Mirror of revive() in passport-cache.ts.
    const revived: PublicPassport = {
      ...roundTripped,
      producedAt: new Date(roundTripped.producedAt),
      events: roundTripped.events.map((e) => ({ ...e, occurredAt: new Date(e.occurredAt) })),
    };

    expect(revived.producedAt).toBeInstanceOf(Date);
    expect(revived.producedAt.getTime()).toBe(passport.producedAt.getTime());
    for (const [i, event] of revived.events.entries()) {
      expect(event.occurredAt).toBeInstanceOf(Date);
      expect(event.occurredAt.getTime()).toBe(passport.events[i]!.occurredAt.getTime());
    }
  });

  it('the formatting the page actually does succeeds on a revived passport', async () => {
    const piece = await seedOne();
    const passport = (await getPassportByToken(piece.qrToken, prisma))!;
    const revived = {
      ...throughJson(passport),
      producedAt: new Date(throughJson(passport).producedAt),
    };

    // toLocaleDateString on a string is exactly what threw RangeError.
    expect(() =>
      new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(
        revived.producedAt,
      ),
    ).not.toThrow();
  });
});
