import { expect, test } from '@playwright/test'

/**
 * Journey 4 — keep it and share it.
 *
 * Favourites live in this browser and nowhere else, so the test proves they
 * survive a reload and that removing one really removes it. The link is the
 * whole sharing mechanism, so it is opened in a browser profile that has never
 * seen the site: no account, nothing to dismiss, straight onto that water.
 */
test('@smoke journey 4: favourites persist here, and a link opens the same water anywhere', async ({
  page,
  browser,
}) => {
  await page.goto('/?station=46042&forceWebGL=1')
  const app = page.locator('.app')
  await expect(app).toHaveAttribute('data-status', 'ready', { timeout: 30_000 })

  // Before anything is saved, the favourites tab explains what favouriting does.
  await page.getByTestId('open-search').click()
  await page.getByTestId('segment-favourites').click()
  const empty = page.getByTestId('favourites-empty')
  await expect(empty).toBeVisible()
  await expect(empty).toContainText('Nothing saved yet')
  await expect(empty).toContainText('this device only')
  await page.getByTestId('stations-close').click()

  // Favourite it, and it survives a reload.
  const star = page.getByTestId('favourite-toggle')
  await expect(star).toHaveAttribute('aria-pressed', 'false')
  await star.click()
  await expect(star).toHaveAttribute('aria-pressed', 'true')

  await page.reload()
  await expect(app).toHaveAttribute('data-status', 'ready', { timeout: 30_000 })
  await expect(page.getByTestId('favourite-toggle')).toHaveAttribute('aria-pressed', 'true')

  await page.getByTestId('open-search').click()
  await page.getByTestId('segment-favourites').click()
  await expect(page.getByTestId('station-row-46042')).toBeVisible()

  // Removing it removes it, and that survives a reload too.
  await page.getByTestId('station-star-46042').click()
  await page.reload()
  await expect(app).toHaveAttribute('data-status', 'ready', { timeout: 30_000 })
  await expect(page.getByTestId('favourite-toggle')).toHaveAttribute('aria-pressed', 'false')
  await page.getByTestId('open-search').click()
  await page.getByTestId('segment-favourites').click()
  await expect(page.getByTestId('favourites-empty')).toBeVisible()
  await page.getByTestId('stations-close').click()

  // The copy control puts the shareable URL on the clipboard.
  await page.getByTestId('copy-link').click()
  await expect(page.getByTestId('copy-confirmation')).toContainText('Link copied')
  const copied = await page.evaluate(() => navigator.clipboard.readText())
  expect(copied).toContain('/?station=46042')

  // A browser profile that has never seen this site opens the link and lands on
  // that station's water. No sign-up, no cookie banner, nothing to dismiss.
  const stranger = await browser.newContext()
  const strangerPage = await stranger.newPage()
  await strangerPage.goto(`${copied}&forceWebGL=1`)

  const strangerApp = strangerPage.locator('.app')
  await expect(strangerApp).toHaveAttribute('data-mode', 'sea')
  await expect(strangerApp).toHaveAttribute('data-status', 'ready', { timeout: 30_000 })
  await expect(strangerPage.getByTestId('station-id')).toHaveText('46042')
  await expect(strangerPage.getByTestId('readout')).toBeVisible()

  // Nothing was there to dismiss, and nothing asked who they were.
  await expect(strangerPage.locator('dialog')).toHaveCount(0)
  await expect(strangerPage.locator('input[type="email"], input[type="password"]')).toHaveCount(0)
  await expect(strangerPage.getByTestId('scene-canvas')).toHaveAttribute('data-frames', /\d+/, {
    timeout: 20_000,
  })

  await stranger.close()
})
