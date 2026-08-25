import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { test as base, expect, type Page } from '@playwright/test';
import type { E2EFixture, E2EAccount, E2EPiece } from './seed-e2e.ts';
import { FIXTURE_PATH } from './seed-e2e.ts';

/**
 * Shared fixture access and sign-in helper.
 *
 * The seed writes plaintext claim codes to disk for the duration of the run.
 * That is the only place in this system where plaintext exists outside the
 * factory export, and it exists because there is no other way to drive a real
 * claim through a real browser. The file is deleted on teardown.
 */

const COUNTER_PATH = resolve(process.cwd(), 'tests/e2e/.next-piece');

let cached: E2EFixture | null = null;

export function fixture(): E2EFixture {
  cached ??= JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as E2EFixture;
  return cached;
}

/**
 * A piece that is never claimed by any test.
 *
 * Reserved so the "unclaimed piece" assertions have something to look at that
 * cannot be pulled out from under them by a test that runs earlier.
 */
export function displayPiece(): E2EPiece {
  return fixture().pieces[0]!;
}

/**
 * Hand out a fresh piece, one per caller.
 *
 * Claiming is a one-way door - that is the entire point of the system - so no
 * two tests may share a piece. The counter lives in a file rather than in
 * module scope because Playwright restarts its worker process after a failure,
 * which would silently reset an in-memory counter and hand the next test a
 * piece that is already claimed. The second failure would then look like a
 * product bug instead of a consequence of the first.
 */
export function takePiece(): E2EPiece {
  const pieces = fixture().pieces;

  const current = existsSync(COUNTER_PATH)
    ? Number(readFileSync(COUNTER_PATH, 'utf8').trim())
    : 1; // index 0 is reserved for displayPiece()

  const index = Number.isFinite(current) && current >= 1 ? current : 1;
  writeFileSync(COUNTER_PATH, String(index + 1));

  const piece = pieces[index];
  if (!piece) {
    throw new Error(
      `The e2e fixture ran out of pieces (${pieces.length} seeded, wanted index ${index}). ` +
        'Raise SEED_QUANTITY in seed-e2e.ts.',
    );
  }
  return piece;
}

export async function signIn(page: Page, account: E2EAccount): Promise<void> {
  // Start from a clean session.
  //
  // Several tests hand a piece from one collector to another, so they sign in
  // twice in the same browser context. Without this the second sign-in lands
  // on /login already authenticated as the first collector, gets redirected
  // away - correctly, that is what /login should do - and then fails looking
  // for a form that is not on the page.
  await page.context().clearCookies();

  await page.goto('/login');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Landing anywhere other than /login means the session cookie was set and
  // accepted. This is the assertion that would have caught the Secure-cookie
  // bug that made sign-in silently fail over plain HTTP.
  await expect(page).not.toHaveURL(/\/login/);
}

export const test = base;
export { expect };
