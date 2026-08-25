import { expect, test, type Page } from '@playwright/test'
import type { Station, StationIndex } from '../../src/lib/shared/types'

/**
 * Journey 3 — find a station.
 *
 * Spin the globe, see which stations are reporting before clicking anything,
 * search for one by name, and — when a station turns out to be silent — be sent
 * to the nearest one that is not, by name, in a single action.
 */
test('@smoke journey 3: the globe, the search, and never a dead end', async ({ page }) => {
  await page.goto('/?forceWebGL=1')

  const app = page.locator('.app')
  await expect(app).toHaveAttribute('data-mode', 'globe')
  await expect(page.getByTestId('scene-canvas')).toHaveAttribute('data-frames', /\d+/, { timeout: 20_000 })

  // The whole network is plotted, and all three status treatments are present
  // before anything is clicked.
  await expect
    .poll(async () => Number(await app.getAttribute('data-stations')), { timeout: 20_000 })
    .toBeGreaterThan(1000)
  const counts = (await app.getAttribute('data-pin-counts'))?.split(',').map(Number) ?? []
  expect(counts).toHaveLength(3)
  for (const count of counts) expect(count).toBeGreaterThan(0)

  // The three treatments differ in more than colour: fill, size and ring.
  await expect(page.getByTestId('globe-legend').locator('.status-dot')).toHaveCount(3)

  // The line that says whose network this is, without being a modal.
  await expect(page.getByTestId('coverage-note')).toContainText('United States')

  // Search filters as you type, and a row opens that station's water.
  await page.getByTestId('open-search').click()
  await page.getByTestId('station-search').fill('Monterey')
  await expect(page.getByTestId('station-row-46042')).toBeVisible()
  await page.getByTestId('station-row-46042').click()

  await expect(app).toHaveAttribute('data-mode', 'sea')
  await expect(page).toHaveURL(/station=46042/)
  await expect(page.getByTestId('station-id')).toHaveText('46042')

  // A station that is not reporting offers the nearest one that is — named, with
  // its distance — and taking it lands on live water.
  const silent = await findSilentStation(page)
  expect(silent, 'the NDBC index should contain at least one station that is not reporting').not.toBeNull()

  await page.goto(`/?station=${silent!}&forceWebGL=1`)
  const card = page.getByTestId('station-unavailable')
  await expect(card).toBeVisible({ timeout: 30_000 })

  const offer = page.getByTestId('go-nearest')
  await expect(offer).toBeVisible()
  // It names the station it is offering, not just "nearest station".
  await expect(offer).toContainText(/Go to \w+ · /)

  await offer.click()
  await expect(page).not.toHaveURL(new RegExp(`station=${silent}`))
  await expect(page.getByTestId('readout')).toBeVisible()
  await expect(app).toHaveAttribute('data-status', 'ready', { timeout: 30_000 })

  // An ID that does not exist is a card, not a blank page.
  await page.goto('/?station=ZZZZZ&forceWebGL=1')
  await expect(page.getByTestId('unknown-station')).toBeVisible({ timeout: 30_000 })
  await page.getByTestId('card-globe').click()
  await expect(app).toHaveAttribute('data-mode', 'globe')
})

/**
 * Finds a station that really is silent right now and has a reporting one nearby,
 * rather than hardcoding an ID. Which buoys are down changes by the week, so the
 * test asks the live index and probes a few candidates instead of assuming.
 *
 * The variant with no reporting station anywhere near is covered by the unit
 * tests on the nearest-station search, which can put a station in the middle of
 * the Bay of Biscay without waiting for one to fail there.
 */
async function findSilentStation(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const km = (aLat: number, aLon: number, bLat: number, bLon: number) => {
      const rad = (d: number) => (d * Math.PI) / 180
      const h =
        Math.sin(rad(bLat - aLat) / 2) ** 2 +
        Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLon - aLon) / 2) ** 2
      return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)))
    }

    const response = await fetch('/api/stations')
    const index = (await response.json()) as StationIndex
    const reporting = index.stations.filter((s: Station) => s.met)

    const candidates = index.stations.filter(
      (s: Station) =>
        !s.met &&
        !s.currents &&
        !s.waterquality &&
        reporting.some((other: Station) => other.id !== s.id && km(s.lat, s.lon, other.lat, other.lon) < 300),
    )

    for (const candidate of candidates.slice(0, 10)) {
      const probe = await fetch(`/api/station/${candidate.id}`)
      if (probe.status !== 404) continue
      const body = (await probe.json()) as { error?: string }
      if (body.error === 'not_reporting') return candidate.id
    }
    return null
  })
}
