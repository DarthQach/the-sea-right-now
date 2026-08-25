/**
 * The shapes that move through the system. Shared verbatim between the Worker
 * and the page — this file is the contract between them.
 *
 * There is no database. Only `Favourites` and `Prefs` persist, and they persist
 * in the visitor's own browser.
 */

/**
 * Where a value in a `Reading` came from. Set by the Worker, never inferred in
 * the UI, because the UI cannot tell the difference between a measurement and a
 * carried-forward one and must never guess.
 *
 * - `measured` — NDBC reported this value in the row at `observedAt`.
 * - `derived`  — NDBC reported `MM` at `observedAt`, and this value was carried
 *                forward from an earlier row. `fieldObservedAt` says when it was
 *                actually taken. Common: most stations report wind every ten
 *                minutes but waves only two or three times an hour.
 * - `absent`   — no value anywhere in the carry-forward window. Rendered as an
 *                em-dash. Never as zero.
 */
export type FieldSource = 'measured' | 'derived' | 'absent'

/** One buoy, from NDBC's `activestations.xml`. */
export interface Station {
  /** NDBC station ID, e.g. `46042`, or `FPSN7` for a C-MAN land station. Unique. */
  id: string
  /** Human label, e.g. `Monterey Bay, CA`. */
  name: string
  /** Degrees, −90…90. */
  lat: number
  /** Degrees, −180…180. */
  lon: number
  /** Operating agency. */
  owner: string
  /** `buoy` | `fixed` | `dart` | `oilrig` | `tao` | `other` | `usv`. */
  type: string
  /** NDBC's flag: reported meteorological data within the last 8 hours. */
  met: boolean
  currents: boolean
  waterquality: boolean
  /** Tsunami station. No wave data — filtered out of the index. */
  dart: boolean
}

export interface StationIndex {
  /** Roughly 1,275 entries after DART and coordinate-less stations are removed. */
  stations: Station[]
  /** ISO 8601 timestamp of the fetch. */
  builtAt: string
  source: 'live' | 'bundled'
}

/**
 * One station's current state, parsed by the Worker from `realtime2/{id}.txt`
 * and, when present, `realtime2/{id}.spec`.
 *
 * Every numeric field is nullable. A large share of stations report wind but not
 * waves, or the reverse. `MM` maps to `null` — never to zero.
 */
export interface Reading {
  stationId: string
  /** ISO 8601 UTC, from the newest `YY MM DD hh mm` row in the file. */
  observedAt: string

  /** `WVHT`, significant wave height, metres. */
  waveHeightM: number | null
  /** `DPD`, dominant period, seconds. */
  dominantPeriodS: number | null
  /** `APD`, average period, seconds. */
  averagePeriodS: number | null
  /** `MWD`, mean wave direction, degrees from true north. */
  waveDirectionDeg: number | null

  /** `WSPD`, m/s. */
  windSpeedMs: number | null
  /** `GST`, m/s. */
  windGustMs: number | null
  /** `WDIR`, degrees from true north. */
  windDirectionDeg: number | null

  /** `WTMP`, °C. */
  waterTempC: number | null
  /** `ATMP`, °C. */
  airTempC: number | null
  /** `PRES`, hPa. */
  pressureHpa: number | null

  /** From `.spec`, present only for spectral stations. */
  swellHeightM: number | null
  swellPeriodS: number | null
  /** Compass point, e.g. `WSW`. NDBC reports this as text, not degrees. */
  swellDirection: string | null
  windWaveHeightM: number | null
  windWavePeriodS: number | null
  /** `SWELL` | `AVERAGE` | `STEEP` | `VERY_STEEP`. NDBC reports this as text. */
  steepness: string | null

  /** One entry per field above. Drives the readout's provenance treatments. */
  fieldSources: Record<string, FieldSource>
  /** ISO 8601, when each non-absent field's value was actually measured. */
  fieldObservedAt: Record<string, string>
  /** ISO 8601, when the Worker fetched this from NDBC. */
  fetchedAt: string
}

/** The numeric and textual measurement keys of a `Reading`. */
export const READING_FIELDS = [
  'waveHeightM',
  'dominantPeriodS',
  'averagePeriodS',
  'waveDirectionDeg',
  'windSpeedMs',
  'windGustMs',
  'windDirectionDeg',
  'waterTempC',
  'airTempC',
  'pressureHpa',
  'swellHeightM',
  'swellPeriodS',
  'swellDirection',
  'windWaveHeightM',
  'windWavePeriodS',
  'steepness',
] as const

export type ReadingField = (typeof READING_FIELDS)[number]

/** What the Worker answers with when NDBC is unreachable and it has a stale reading. */
export interface StaleReadingResponse {
  error: 'upstream_unavailable'
  message: string
  reading: Reading
  /** Seconds since the Worker last successfully fetched this station. */
  staleForSeconds: number
}
