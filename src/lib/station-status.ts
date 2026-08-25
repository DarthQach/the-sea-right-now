/**
 * How fresh a station is, from what we actually know.
 *
 * This project never polls the whole network — NDBC asks that retrievals be kept
 * minimal, and fetching 1,275 stations to colour a map would raise request
 * volume by three orders of magnitude. So the globe reports what the station
 * index itself says, which is NDBC's own `met` flag: whether the station
 * reported meteorological data within the last eight hours.
 *
 * For a station the visitor has actually opened, the exact reading age is known
 * and used instead. The interface never states an age it does not have.
 */
import type { Station } from './shared/types'
import { freshnessOf, type Freshness } from './format'

export type StationStatus = Freshness

export interface StationKnowledge {
  /** Exact reading ages, for stations opened this session. */
  ages: ReadonlyMap<string, number | null>
}

export function stationStatus(station: Station, knownAgeSeconds?: number | null): StationStatus {
  if (knownAgeSeconds !== undefined && knownAgeSeconds !== null) return freshnessOf(knownAgeSeconds)
  if (station.met) return 'live'
  // Not reporting weather, but still reporting something. NDBC lists these
  // separately and they are not dead.
  if (station.currents || station.waterquality) return 'stale'
  return 'dead'
}

/**
 * What the hover label says. Deliberately different wording for a known age and
 * for the index's flag, because they are different claims.
 */
export function stationStatusLabel(station: Station, knownAgeSeconds?: number | null, formatted?: string): string {
  if (knownAgeSeconds !== undefined && knownAgeSeconds !== null && formatted !== undefined) {
    return `Reported ${formatted}`
  }
  if (station.met) return 'Reported within the last 8 hours'
  if (station.currents || station.waterquality) return 'Not reporting weather'
  return 'Not reporting'
}
