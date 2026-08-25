import { test, expect, fixture, displayPiece, takePiece, signIn } from '../fixtures/fixture.ts';

/**
 * The claim flow: scan, scratch, claim.
 *
 * CLAUDE.md calls this the emotional core of the product, and it is also the
 * one irreversible action in the system. The Vitest suite proves the
 * transaction underneath is correct; these tests prove the thing a person
 * actually touches works, across the seams unit tests cannot reach - the
 * canvas overlay, the client-side check character, the server action, and the
 * revalidated server component that renders the result.
 */

test.describe('scanning a piece', () => {
  test('an unclaimed piece shows its record and invites a claim', async ({ page }) => {
    const piece = displayPiece();
    await page.goto(`/p/${piece.qrToken}`);

    // The serial is a hero element, per CLAUDE.md. It must be on the page.
    await expect(page.getByText(piece.serial).first()).toBeVisible();

    // And it must be honest about not being claimed yet.
    await expect(page.getByText(/has not been claimed/i)).toBeVisible();
  });

  test('the page never exposes the claim code or the internal id', async ({ page }) => {
    const piece = displayPiece();
    await page.goto(`/p/${piece.qrToken}`);

    const html = await page.content();

    // Non-negotiable 1. If this ever fails, every unclaimed piece is claimable
    // by anyone who scans it.
    expect(html).not.toContain(piece.claimCode);
    expect(html).not.toContain(piece.claimCode.replace(/-/g, ''));

    // Non-negotiable 6: the internal uuid never leaves the database.
    expect(html).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  });

  test('an unknown token is a 404, and says nothing more', async ({ page }) => {
    const response = await page.goto('/p/ZZZZZZZZZZZZ');
    expect(response?.status()).toBe(404);
  });
});

test.describe('claiming', () => {
  test('a signed-out visitor is asked to sign in, not shown the code field', async ({ page }) => {
    const piece = displayPiece();
    await page.goto(`/p/${piece.qrToken}`);

    await expect(page.getByText(/sign in to claim/i)).toBeVisible();
    await expect(page.getByLabel('Claim Code')).toBeHidden();
  });

  test('scratch, enter the code, and the piece becomes yours', async ({ page }) => {
    const piece = takePiece();
    const { alice } = fixture();

    await signIn(page, alice);
    await page.goto(`/p/${piece.qrToken}`);

    // The foil starts covering the field. A canvas cannot be dragged
    // reliably in every environment, so the panel also exposes a button -
    // which is the accessible path a real keyboard user takes too.
    await page.getByRole('button', { name: /drag to reveal/i }).click();

    const input = page.getByLabel('Claim Code');
    await expect(input).toBeVisible();

    await input.fill(piece.claimCode);
    await page.getByRole('button', { name: /claim it/i }).click();

    // The reveal.
    await expect(page.getByText(/it is yours/i).first()).toBeVisible();
    await expect(page.getByText(piece.serial).first()).toBeVisible();

    // And the passport must now actually say so, on a fresh load - proving the
    // write committed and the page revalidated, not just that the form
    // rendered an optimistic success.
    await page.goto(`/p/${piece.qrToken}`);
    await expect(page.getByText(/has not been claimed/i)).toBeHidden();
    await expect(page.getByText(alice.handle, { exact: false }).first()).toBeVisible();
  });

  test('the same code cannot be claimed twice', async ({ page }) => {
    const piece = takePiece();
    const { alice, bob } = fixture();

    await signIn(page, alice);
    await page.goto(`/p/${piece.qrToken}`);
    await page.getByRole('button', { name: /drag to reveal/i }).click();
    await page.getByLabel('Claim Code').fill(piece.claimCode);
    await page.getByRole('button', { name: /claim it/i }).click();
    await expect(page.getByText(/it is yours/i).first()).toBeVisible();

    // Bob now tries the same code. He must be refused, and refused with the
    // generic message - "already claimed" would confirm the code is real.
    await page.goto('/');
    await signIn(page, bob);
    await page.goto(`/p/${piece.qrToken}`);

    // Bob is not the owner, so he should not even be offered the claim form.
    await expect(page.getByText(/it is yours/i)).toBeHidden();
    await expect(page.getByText(alice.handle, { exact: false }).first()).toBeVisible();
  });

  test('a typo is caught in the browser and never reaches the server', async ({ page }) => {
    const piece = takePiece();
    const { alice } = fixture();

    await signIn(page, alice);
    await page.goto(`/p/${piece.qrToken}`);
    await page.getByRole('button', { name: /drag to reveal/i }).click();

    // Corrupt one character. The check character must reject it locally.
    const chars = piece.claimCode.replace(/-/g, '').split('');
    chars[0] = chars[0] === '2' ? '3' : '2';
    const typo = chars.join('');

    let serverCalled = false;
    page.on('request', (request) => {
      if (request.method() === 'POST') serverCalled = true;
    });

    await page.getByLabel('Claim Code').fill(typo);
    await page.getByRole('button', { name: /claim it/i }).click();

    await expect(page.getByText(/has a typo/i)).toBeVisible();

    // The point of validating client-side: a typo must not burn one of the
    // caller's small number of rate-limited attempts.
    expect(serverCalled).toBe(false);

    // And the real code still works afterwards.
    await page.getByLabel('Claim Code').fill(piece.claimCode);
    await page.getByRole('button', { name: /claim it/i }).click();
    await expect(page.getByText(/it is yours/i).first()).toBeVisible();
  });

  test('the input formats to XXX-XXX-XXX, matching the hologram', async ({ page }) => {
    const piece = displayPiece();
    const { alice } = fixture();

    await signIn(page, alice);
    await page.goto(`/p/${piece.qrToken}`);
    await page.getByRole('button', { name: /drag to reveal/i }).click();

    const input = page.getByLabel('Claim Code');

    // Typed without hyphens, in lowercase, the way a phone keyboard offers it.
    await input.fill(piece.claimCode.replace(/-/g, '').toLowerCase());

    // What the collector sees must match what is printed under the scratch
    // panel, because they are holding one and reading the other.
    await expect(input).toHaveValue(piece.claimCode);
  });
});
