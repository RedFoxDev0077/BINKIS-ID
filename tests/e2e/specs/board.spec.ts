import { test, expect, fixture, takePiece, signIn } from '../fixtures/fixture.ts';

/**
 * The Classic set board.
 *
 * The unit tests already prove the arithmetic. What they cannot prove is that
 * a collector sees eight slots with the right one filled, which is the whole
 * product: the board is there so the gaps are visible.
 *
 * The e2e seed only mints Superman, so a claimed piece fills exactly one slot
 * and leaves seven silhouettes. That is the state almost every real collector
 * is in on the day they start.
 */
test.describe('the Classic board', () => {
  test('shows eight slots and fills only the character you own', async ({ page }) => {
    const { alice } = fixture();
    const piece = takePiece();

    await signIn(page, alice);
    await page.goto(`/p/${piece.qrToken}`);
    await page.getByRole('button', { name: /reveal without scratching/i }).click();
    await page.getByLabel('Secret code from the hologram').fill(piece.claimCode);
    await page.getByRole('button', { name: /register my binkis/i }).click();
    await expect(page.getByText(/it is yours/i).first()).toBeVisible();

    await page.goto('/collection');

    // Eight slots, always, however few are owned.
    const slots = page.locator('ol > li');
    await expect(slots).toHaveCount(8);

    // The one owned character is named; the rest read as missing.
    await expect(page.getByText('Superman').first()).toBeVisible();
    const body = await page.textContent('body');
    expect(body).toMatch(/1\s*(of|de)\s*8/);

    await page.screenshot({ path: 'tests/e2e/.artifacts/collection-board.png', fullPage: false });
  });

  test('does not celebrate a set that is not complete', async ({ page }) => {
    const { bob } = fixture();
    const piece = takePiece();

    await signIn(page, bob);
    await page.goto(`/p/${piece.qrToken}`);
    await page.getByRole('button', { name: /reveal without scratching/i }).click();
    await page.getByLabel('Secret code from the hologram').fill(piece.claimCode);
    await page.getByRole('button', { name: /register my binkis/i }).click();
    await expect(page.getByText(/it is yours/i).first()).toBeVisible();

    await page.goto('/collection');

    // One piece is not a series. Nothing here should congratulate anyone.
    const body = await page.textContent('body');
    expect(body).not.toMatch(/series complete|serie completa/i);
    expect(body).not.toMatch(/matched set|colecci[oó]n alineada/i);
    await expect(page.getByRole('dialog')).toBeHidden();
  });
});

test.describe('the complete set', () => {
  test('eight of eight, all the same number, celebrates once and says the number', async ({
    page,
  }) => {
    const { carol, matchedNumber } = fixture();

    // Signing in lands on the collection, and that first landing IS the
    // moment. Do not clear storage and reload to force it: the flag is written
    // by an effect, so clearing it before hydration finishes races with the
    // page writing it back, and the reload then finds it and shows nothing.
    await signIn(page, carol);
    if (!/collection/.test(page.url())) await page.goto('/collection');

    // Every slot filled, nothing left in silhouette.
    const body = await page.textContent('body');
    expect(body).toMatch(/8\s*(of|de)\s*8/);

    // The rare completion interrupts, once, and names the number.
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(String(matchedNumber).padStart(6, '0'));
    await page.screenshot({ path: 'tests/e2e/.artifacts/matched-set-moment.png' });

    await dialog.getByRole('button').click();
    await expect(dialog).toBeHidden();

    // The banner stays behind it: a standing fact, not a popup.
    await expect(page.getByRole('status')).toContainText(/matched set|colecci[oó]n alineada/i);
    await page.screenshot({ path: 'tests/e2e/.artifacts/matched-set-board.png' });

    // Second visit: the moment does not replay.
    await page.goto('/collection');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByRole('status')).toBeVisible();
  });
});

test.describe('reaching the collection', () => {
  test('the collection is one tap away on a phone, from any page', async ({ page }) => {
    const { carol } = fixture();
    await signIn(page, carol);

    // The passport is where a scan lands, so that is where someone will look
    // for their collection. The header link used to disappear below 640px,
    // which left a phone with no way in at all.
    await page.goto('/');
    const link = page.getByRole('link', { name: /my collection|mi colecci[oó]n/i }).first();
    await expect(link).toBeVisible();

    await link.click();
    await expect(page).toHaveURL(/collection/);
    await page.screenshot({ path: 'tests/e2e/.artifacts/header-mobile.png', clip: { x: 0, y: 0, width: 360, height: 120 } });
  });
});
