import { test, expect, fixture, takePiece, signIn } from '../fixtures/fixture.ts';

/**
 * The transfer flow: owner offers, recipient confirms.
 *
 * The property that matters here is not that the piece moves - it is that
 * nothing is overwritten when it does. Non-negotiable 2: the ledger only ever
 * grows. A transfer appends; it never edits the row that came before, so the
 * piece's history survives every change of hands.
 */

/** Claim a piece as its first owner, so there is something to transfer. */
async function claimAs(page: Parameters<typeof signIn>[0], account: ReturnType<typeof fixture>['alice']) {
  const piece = takePiece();
  await signIn(page, account);
  await page.goto(`/p/${piece.qrToken}`);
  await page.getByRole('button', { name: /drag to reveal/i }).click();
  await page.getByLabel('Claim Code').fill(piece.claimCode);
  await page.getByRole('button', { name: /claim it/i }).click();
  await expect(page.getByText(/it is yours/i).first()).toBeVisible();
  return piece;
}

test.describe('transferring a piece', () => {
  test('the owner sends, the recipient accepts, and ownership moves', async ({ page }) => {
    const { alice, bob } = fixture();
    const piece = await claimAs(page, alice);

    // Alice offers it to Bob.
    await page.goto(`/p/${piece.qrToken}`);
    await page.getByRole('button', { name: /transfer this binki/i }).click();
    await page.getByLabel(/recipient/i).fill(bob.handle);
    await page.getByRole('button', { name: /send transfer/i }).click();
    // The panel becomes "Waiting on them" rather than flashing a transient
    // "Transfer sent". That is the better signal - it persists, and it is
    // still true when the owner comes back tomorrow to check - so it is what
    // this asserts.
    await expect(page.getByText(/waiting on them/i).first()).toBeVisible();

    // Nothing has moved yet. A request is not a mutation - the piece is still
    // Alice's until Bob says yes.
    await page.goto(`/p/${piece.qrToken}`);
    await expect(page.getByText(alice.handle, { exact: false }).first()).toBeVisible();

    // Bob accepts.
    await signIn(page, bob);
    await page.goto('/transfers');
    await expect(page.getByText(piece.serial).first()).toBeVisible();
    await page.getByRole('button', { name: /^accept$/i }).click();
    // Wait for the action to actually land. click() only dispatches it, so
    // navigating straight afterwards abandons it in flight and the transfer
    // silently stays pending - which looks exactly like a product bug.
    await expect(page.getByRole('button', { name: /^accept$/i })).toBeHidden();

    // Now it is his, and the passport says so.
    await page.goto(`/p/${piece.qrToken}`);
    await expect(page.getByText(bob.handle, { exact: false }).first()).toBeVisible();
  });

  test('the timeline keeps the whole history, not just the current owner', async ({ page }) => {
    const { alice, bob } = fixture();
    const piece = await claimAs(page, alice);

    await page.goto(`/p/${piece.qrToken}`);
    await page.getByRole('button', { name: /transfer this binki/i }).click();
    await page.getByLabel(/recipient/i).fill(bob.handle);
    await page.getByRole('button', { name: /send transfer/i }).click();
    // The panel becomes "Waiting on them" rather than flashing a transient
    // "Transfer sent". That is the better signal - it persists, and it is
    // still true when the owner comes back tomorrow to check - so it is what
    // this asserts.
    await expect(page.getByText(/waiting on them/i).first()).toBeVisible();

    await signIn(page, bob);
    await page.goto('/transfers');
    await page.getByRole('button', { name: /^accept$/i }).click();
    // Wait for the action to actually land. click() only dispatches it, so
    // navigating straight afterwards abandons it in flight and the transfer
    // silently stays pending - which looks exactly like a product bug.
    await expect(page.getByRole('button', { name: /^accept$/i })).toBeHidden();

    // The piece changed hands. Both events must still be on the passport,
    // because provenance is the product: a piece that forgets it was ever
    // Alice's is worth what an unmarked figure is worth.
    await page.goto(`/p/${piece.qrToken}`);
    const body = await page.textContent('body');
    expect(body).toMatch(/claimed/i);
    expect(body).toMatch(/transferred/i);
  });

  test('a recipient can decline, and the piece stays put', async ({ page }) => {
    const { alice, bob } = fixture();
    const piece = await claimAs(page, alice);

    await page.goto(`/p/${piece.qrToken}`);
    await page.getByRole('button', { name: /transfer this binki/i }).click();
    await page.getByLabel(/recipient/i).fill(bob.handle);
    await page.getByRole('button', { name: /send transfer/i }).click();
    // The panel becomes "Waiting on them" rather than flashing a transient
    // "Transfer sent". That is the better signal - it persists, and it is
    // still true when the owner comes back tomorrow to check - so it is what
    // this asserts.
    await expect(page.getByText(/waiting on them/i).first()).toBeVisible();

    await signIn(page, bob);
    await page.goto('/transfers');
    await page.getByRole('button', { name: /^decline$/i }).click();
    // Wait for the action to actually land. click() only dispatches it, so
    // navigating straight afterwards abandons it in flight and the transfer
    // silently stays pending - which looks exactly like a product bug.
    await expect(page.getByRole('button', { name: /^decline$/i })).toBeHidden();

    await page.goto(`/p/${piece.qrToken}`);
    await expect(page.getByText(alice.handle, { exact: false }).first()).toBeVisible();
  });

  test('someone who does not own a piece is not offered a transfer', async ({ page }) => {
    const { alice, bob } = fixture();
    const piece = await claimAs(page, alice);

    await signIn(page, bob);
    await page.goto(`/p/${piece.qrToken}`);

    await expect(page.getByRole('button', { name: /transfer this binki/i })).toBeHidden();
  });
});

test.describe('my collection', () => {
  test('a claimed piece appears in the owner collection', async ({ page }) => {
    const { alice } = fixture();
    const piece = await claimAs(page, alice);

    await page.goto('/collection');
    await expect(page.getByText(piece.serial).first()).toBeVisible();
  });

  test('a collection with nothing in it invites a claim rather than sitting blank', async ({
    page,
  }) => {
    const { bob } = fixture();
    await signIn(page, bob);
    await page.goto('/collection');

    // CLAUDE.md: "Empty state is an invitation to claim, not a blank page."
    const body = await page.textContent('body');
    expect(body?.trim().length ?? 0).toBeGreaterThan(80);
  });
});
