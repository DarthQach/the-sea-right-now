/**
 * Formatting for the readout.
 *
 * Two rules run through all of it. Absent values render as an em-dash, never as
 * zero. And "now" is only ever as fresh as NDBC is — readings land roughly
 * hourly, so nothing here implies second-by-second freshness.
 */
export const EM_DASH = '—'

const KNOTS_PER_METRE_PER_SECOND = 1.943844

export function metresPerSecondToKnots(value: number): number {
  return value * KNOTS_PER_METRE_PER_SECOND
}

export function formatNumber(value: number | null, decimals: number): string {
  if (value === null || !Number.isFinite(value)) return EM_DASH
  return value.toFixed(decimals)
}

/**
 * "14 min ago". Deliberately coarse: NDBC publishes roughly hourly and most data
 * lands around 25 minutes past, so a seconds-resolution age would be a lie about
 * how live this is.
 */
export function formatAge(ageSeconds: number | null): string {
  if (ageSeconds === null || !Number.isFinite(ageSeconds)) return EM_DASH
  if (ageSeconds < 90) return 'just now'

  const minutes = Math.round(ageSeconds / 60)
  if (minutes < 60) return `${minutes} min ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    const remainder = minutes % 60
    return remainder === 0 ? `${hours} h ago` : `${hours} h ${remainder} min ago`
  }

  const days = Math.round(hours / 24)
  return days === 1 ? 'a day ago' : `${days} days ago`
}

export function ageSecondsSince(iso: string | null, now: number = Date.now()): number | null {
  if (iso === null) return null
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return null
  return Math.max(0, Math.round((now - then) / 1000))
}

/** Live within two hours, stale within a day, otherwise dead. Matches the pin states. */
export type Freshness = 'live' | 'stale' | 'dead'

export const LIVE_WITHIN_SECONDS = 2 * 60 * 60
export const STALE_WITHIN_SECONDS = 24 * 60 * 60

export function freshnessOf(ageSeconds: number | null): Freshness {
  if (ageSeconds === null) return 'dead'
  if (ageSeconds <= LIVE_WITHIN_SECONDS) return 'live'
  if (ageSeconds <= STALE_WITHIN_SECONDS) return 'stale'
  return 'dead'
}

const COMPASS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
]

export function compassPoint(degrees: number | null): string {
  if (degrees === null || !Number.isFinite(degrees)) return EM_DASH
  const index = Math.round((((degrees % 360) + 360) % 360) / 22.5) % 16
  return COMPASS[index] ?? EM_DASH
}

/** "36.787° N, 122.408° W" — for the station header and the about panel. */
export function formatCoordinates(lat: number, lon: number): string {
  const ns = lat >= 0 ? 'N' : 'S'
  const ew = lon >= 0 ? 'E' : 'W'
  return `${Math.abs(lat).toFixed(3)}° ${ns}, ${Math.abs(lon).toFixed(3)}° ${ew}`
}

/** "18:40 UTC, 25 Aug" — the exact moment behind a relative age. */
export function formatObservedAt(iso: string | null): string {
  if (iso === null) return EM_DASH
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return EM_DASH
  const time = date.toISOString().slice(11, 16)
  const day = date.getUTCDate()
  const month = date.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })
  return `${time} UTC, ${day} ${month}`
}
