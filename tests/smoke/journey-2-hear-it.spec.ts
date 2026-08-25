import { expect, test } from '@playwright/test'

/**
 * Journey 2 — hear it.
 *
 * One click starts the sound. Switching mapping changes it with no reload and no
 * gap. Volume and mapping are remembered, and after a reload the audio is
 * waiting for another click, because a browser will never start it on its own.
 *
 * It asserts on the audio graph's own state and on the RMS of its output — that
 * sound is genuinely being generated, not merely wired up. Whether it is
 * *beautiful* is not something a test can hold an opinion about.
 */
test('@smoke journey 2: one click starts the sea, and the choice is remembered', async ({ page }) => {
  await page.goto('/?station=46042&forceWebGL=1')

  const view = page.getByTestId('sea-view')
  await expect(view).toHaveAttribute('data-status', 'ready', { timeout: 30_000 })

  // Nothing exists until a gesture. No AudioContext, so nothing can make a
  // sound by accident.
  await expect(view).toHaveAttribute('data-audio-playing', 'false')
  await expect(view).toHaveAttribute('data-audio-context', 'none')
  await expect(view).toHaveAttribute('data-audio-mode', 'literal')

  await page.getByTestId('audio-toggle').click()

  await expect(view).toHaveAttribute('data-audio-playing', 'true')
  await expect(view).toHaveAttribute('data-audio-context', 'running')
  await expect(view).toHaveAttribute('data-audio-mode', 'literal')

  // Sound is actually coming out.
  await expect
    .poll(async () => Number(await view.getAttribute('data-audio-level')), { timeout: 15_000 })
    .toBeGreaterThan(0.001)

  // Switching mapping changes the sound, with no reload.
  await page.getByTestId('audio-mode-tuned').click()
  await expect(view).toHaveAttribute('data-audio-mode', 'tuned')
  await expect(view).toHaveAttribute('data-audio-playing', 'true')
  await expect(view).toHaveAttribute('data-audio-context', 'running')
  await expect
    .poll(async () => Number(await view.getAttribute('data-audio-level')), { timeout: 15_000 })
    .toBeGreaterThan(0.001)

  await page.getByTestId('audio-volume').fill('0.3')
  await expect(view).toHaveAttribute('data-audio-volume', '0.30')

  await page.reload()
  await expect(view).toHaveAttribute('data-status', 'ready', { timeout: 30_000 })

  // The choices survived, and the audio is waiting for another gesture.
  await expect(view).toHaveAttribute('data-audio-mode', 'tuned')
  await expect(view).toHaveAttribute('data-audio-volume', '0.30')
  await expect(view).toHaveAttribute('data-audio-playing', 'false')
  await expect(view).toHaveAttribute('data-audio-context', 'none')
})
