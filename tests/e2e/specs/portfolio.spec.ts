import { test, expect, fixture, takePiece, displayPiece, signIn } from '../fixtures/fixture.ts';

/**
 * Portfolio screenshots, captured against the seeded local build.
 *
 * Not a test. It asserts almost nothing; it exists so the images in a
 * portfolio come from a real running build with seeded data rather than from
 * production, where every collection belongs to an actual person and every
 * passport names a real owner.
 *
 * Run it on its own and delete it afterwards:
 *   npx playwright test specs/portfolio.capture.ts --project=desktop
 */

const SHOTS = 'tests/e2e/.artifacts/portfolio';

/**
 * Scroll the whole page before shooting it.
 *
 * Sections fade in on an IntersectionObserver, so a full-page screenshot of a
 * page nobody has scrolled captures them at opacity 0: present in the DOM,
 * invisible in the image. Walking down and back up leaves every section in
 * its settled state.
 */
async function settle(page: import('@playwright/test').Page) {
  // Hydration first. The observer that reveals each section is set up in an
  // effect, so scrolling before React has hydrated scrolls past sections that
  // are not yet watching and leaves them at opacity 0 for good.
  await page.waitForTimeout(1400);

  const reveals = page.locator('.reveal');
  const count = await reveals.count();
  for (let i = 0; i < count; i++) {
    await reveals.nth(i).scrollIntoViewIfNeeded();
    await page.waitForTimeout(220);
  }

  // Anything still hidden is forced. A portfolio image should show the page
  // as someone sees it after scrolling, not caught mid-animation.
  await page.evaluate(() => {
    document
      .querySelectorAll('.reveal[data-shown="false"]')
      .forEach((el) => el.setAttribute('data-shown', 'true'));
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(800);
}

test.describe('portfolio', () => {
  test('captures the public pages and the collector pages', async ({ page }) => {
    const { alice, carol } = fixture();

    // ---- the front page -------------------------------------------------
    await page.goto('/');
    await settle(page);
    await page.screenshot({ path: `${SHOTS}/01-home.png`, fullPage: true });

    // ---- an unclaimed piece: the scan a shop visitor lands on -----------
    const display = displayPiece();
    await page.goto(`/p/${display.qrToken}`);
    await settle(page);
    await page.screenshot({ path: `${SHOTS}/02-passport-unclaimed.png`, fullPage: true });

    // ---- the claim moment, scratch panel and all ------------------------
    const piece = takePiece();
    await signIn(page, alice);
    await page.goto(`/p/${piece.qrToken}`);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${SHOTS}/03-claim-scratch.png` });

    await page.getByRole('button', { name: /reveal without scratching/i }).click();
    await page.getByLabel('Secret code from the hologram').fill(piece.claimCode);
    await page.screenshot({ path: `${SHOTS}/04-claim-code-entered.png` });

    await page.getByRole('button', { name: /register my binkis/i }).click();
    await expect(page.getByText(/it is yours/i).first()).toBeVisible();
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${SHOTS}/05-claim-success.png` });

    // ---- the claimed passport, certificate open -------------------------
    await page.goto(`/p/${piece.qrToken}`);
    await settle(page);
    await page.screenshot({ path: `${SHOTS}/06-passport-claimed.png`, fullPage: true });

    const certificate = page.locator('details').first();
    await certificate.locator('summary').click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/07-certificate-open.png`, fullPage: true });

    // ---- the display case, partly filled --------------------------------
    await page.goto('/collection');
    await settle(page);
    await page.screenshot({ path: `${SHOTS}/08-collection-case.png`, fullPage: true });

    // ---- a figure opened in place ---------------------------------------
    await page.locator('.vitrina .vt-hit[data-niche="SP"]').click();
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${SHOTS}/09-niche-detail.png` });
    await page.keyboard.press('Escape');

    // ---- the full case, and the matched-set moment ----------------------
    await signIn(page, carol);
    if (!/collection/.test(page.url())) await page.goto('/collection');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SHOTS}/10-matched-set-moment.png` });

    await page.getByRole('dialog').getByRole('button').click();
    await settle(page);
    await page.screenshot({ path: `${SHOTS}/11-collection-complete.png`, fullPage: true });
  });
});
