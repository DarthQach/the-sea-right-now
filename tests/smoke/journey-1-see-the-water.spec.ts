import { expect, test } from '@playwright/test'

/**
 * Journey 1 — see one station's water.
 *
 * A person opens a station's URL and lands on that patch of ocean: water moving
 * from a live reading, the numbers it was built from in the corners, the
 * spectrum it came from drawn, and a camera they can move and put back.
 *
 * Runs against `?forceWebGL=1` because WebGPU in headless browsers is
 * unreliable. It asserts on the DOM, the readout values and the canvas
 * painting — never on pixels. That the water agrees with the reading is proved
 * by the unit tests on the spectrum maths, not here.
 */
test('@smoke journey 1: a station URL opens on that station\'s live water', async ({ page }) => {
  await page.goto('/?station=46042&forceWebGL=1')

  // The station identifies itself, and says how old its reading is.
  await expect(page.getByTestId('station-id')).toHaveText('46042')
  await expect(page.getByTestId('station-header')).toContainText('Monterey', { ignoreCase: true })
  await expect(page.getByTestId('reading-age')).not.toBeEmpty()

  const view = page.getByTestId('sea-view')
  await expect(view).toHaveAttribute('data-status', 'ready', { timeout: 30_000 })
  await expect(view).toHaveAttribute('data-backend', 'webgl')

  // The readout is populated from a real reading. Which fields a buoy reports
  // varies by station and by hour, so this asserts the honest invariant: every
  // value declares its provenance, and at least one is a real measurement.
  const values = page.locator('.value')
  await expect(values).toHaveCount(4)
  const sources = await values.evaluateAll((nodes) => nodes.map((n) => (n as HTMLElement).dataset.source))
  expect(sources.every((s) => s === 'measured' || s === 'derived' || s === 'absent')).toBe(true)
  expect(sources.some((s) => s === 'measured' || s === 'derived')).toBe(true)

  // Absent values are an em-dash, never a zero.
  const numbers = await values.evaluateAll((nodes) =>
    nodes.map((n) => ({
      source: (n as HTMLElement).dataset.source,
      text: n.querySelector('.value__number')?.textContent?.trim() ?? '',
    })),
  )
  for (const value of numbers) {
    if (value.source === 'absent') expect(value.text).toBe('—')
    else expect(value.text).not.toBe('—')
  }

  // The spectrum the water is built from is drawn.
  await expect(page.getByTestId('spectrum-plot')).toHaveAttribute('data-drawn', 'true')

  // The water is moving: the canvas is painting frames.
  const canvas = page.getByTestId('scene-canvas')
  await expect(canvas).toHaveAttribute('data-frames', /\d+/, { timeout: 20_000 })
  const firstFrames = Number(await canvas.getAttribute('data-frames'))
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-frames')), { timeout: 15_000 })
    .toBeGreaterThan(firstFrames)

  // The camera orbits, and one action puts it back.
  const defaultCamera = await canvas.getAttribute('data-camera')
  expect(defaultCamera).toBeTruthy()

  const box = await canvas.boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await page.mouse.down()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2 + 180, { steps: 12 })
  await page.mouse.up()

  await expect.poll(async () => canvas.getAttribute('data-camera'), { timeout: 10_000 }).not.toBe(defaultCamera)

  await page.getByTestId('reset-camera').click()
  await expect.poll(async () => canvas.getAttribute('data-camera'), { timeout: 10_000 }).toBe(defaultCamera)
})
