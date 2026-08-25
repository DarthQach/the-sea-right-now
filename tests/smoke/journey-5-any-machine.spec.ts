import { expect, test } from '@playwright/test'

/**
 * Journey 5 — honest and usable on any machine.
 *
 * The reduced renderer is a complete product, not a broken page: the readout,
 * the spectrum plot and the audio all work exactly as they do on the fast path.
 * Rendering throttles deliberately and says so. When NOAA is unreachable the
 * water keeps moving from the last real reading, the banner gives its age, and
 * the retry works.
 */
test('@smoke journey 5: the reduced path, the throttle, and NOAA being unreachable', async ({ page }) => {
  // ── The reduced renderer, with everything else intact ────────────────────
  await page.goto('/?station=46042&forceWebGL=1')
  const app = page.locator('.app')
  await expect(app).toHaveAttribute('data-status', 'ready', { timeout: 30_000 })
  await expect(app).toHaveAttribute('data-backend', 'webgl')

  await expect(page.getByTestId('reduced-capability-notice')).toBeVisible()
  await expect(page.getByTestId('readout')).toBeVisible()
  await expect(page.getByTestId('spectrum-plot')).toHaveAttribute('data-drawn', 'true')
  const canvas = page.getByTestId('scene-canvas')
  await expect(canvas).toHaveAttribute('data-frames', /\d+/, { timeout: 20_000 })

  // Audio works the same on this path.
  await page.getByTestId('audio-toggle').click()
  await expect(app).toHaveAttribute('data-audio-context', 'running')
  await expect
    .poll(async () => Number(await app.getAttribute('data-audio-level')), { timeout: 15_000 })
    .toBeGreaterThan(0.001)

  // The notice is dismissible, and the product carries on without it.
  await page.getByTestId('dismiss-notice').click()
  await expect(page.getByTestId('reduced-capability-notice')).toHaveCount(0)
  await expect(page.getByTestId('readout')).toBeVisible()

  // ── Throttling, deliberately and visibly ─────────────────────────────────
  await page.goto('/?station=46042&forceWebGL=1&forceThrottled=1')
  await expect(app).toHaveAttribute('data-status', 'ready', { timeout: 30_000 })
  await expect(app).toHaveAttribute('data-throttled', 'true')
  await expect(page.getByTestId('throttle-marker')).toBeVisible()
  // Still rendering, just less of it.
  const throttledFrames = Number(await canvas.getAttribute('data-frames'))
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-frames')), { timeout: 15_000 })
    .toBeGreaterThan(throttledFrames)

  // ── Reduced motion, automatic and overridable ────────────────────────────
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?station=46042&forceWebGL=1')
  await expect(app).toHaveAttribute('data-status', 'ready', { timeout: 30_000 })
  await expect(app).toHaveAttribute('data-reduced-motion', 'true')

  await page.getByTestId('open-settings').click()
  await page.getByTestId('settings-motion-full').click()
  await expect(app).toHaveAttribute('data-reduced-motion', 'false')
  await page.getByTestId('settings-motion-auto').click()
  await expect(app).toHaveAttribute('data-reduced-motion', 'true')
  await page.getByTestId('settings-close').click()
  await page.emulateMedia({ reducedMotion: 'no-preference' })

  // ── Hiding the interface, and getting it back ────────────────────────────
  await page.getByTestId('hide-chrome').click()
  await expect(app).toHaveAttribute('data-chrome-hidden', 'true')
  await page.keyboard.press('Escape')
  await expect(app).toHaveAttribute('data-chrome-hidden', 'false')

  // ── NOAA unreachable ─────────────────────────────────────────────────────
  await page.goto('/?station=46042&forceWebGL=1&simulateOutage=1')
  const banner = page.getByTestId('data-problem-banner')
  await expect(banner).toBeVisible({ timeout: 30_000 })
  // The age of the last reading that did reach us, not a spinner.
  await expect(page.getByTestId('banner-age')).not.toBeEmpty()
  // The water is still moving from it.
  await expect(page.getByTestId('readout')).toBeVisible()
  const duringOutage = Number(await canvas.getAttribute('data-frames'))
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-frames')), { timeout: 15_000 })
    .toBeGreaterThan(duringOutage)

  // And the retry works.
  await page.getByTestId('retry-reading').click()
  await expect(app).toHaveAttribute('data-status', 'ready', { timeout: 30_000 })
  await expect(page.getByTestId('data-problem-banner')).toHaveCount(0)
})
