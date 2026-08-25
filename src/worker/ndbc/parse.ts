/**
 * The NDBC text parser.
 *
 * NDBC publishes plain text at fixed URLs: a two-line comment header naming the
 * columns and their units, then one whitespace-aligned row per observation,
 * newest first. Every column NDBC has no value for reads `MM`.
 *
 * `MM` maps to `null`. Mapping it to `0` would render a flat sea and report a
 * measurement that was never taken; it is the single most damaging parsing bug
 * available in this project, and `tests/unit/ndbc-parse.test.ts` exists to catch
 * it.
 */
import type { Reading, FieldSource } from '../../lib/shared/types'
import { READING_FIELDS } from '../../lib/shared/types'

export interface ParsedFile {
  columns: string[]
  /** Newest first, as NDBC publishes them. */
  rows: ParsedRow[]
}

export interface ParsedRow {
  observedAt: string
  values: Record<string, string>
}

/** Values NDBC uses to mean "no measurement". */
const MISSING = new Set(['MM', 'N/A', '-', '999', '99.0', '999.0'])

/**
 * Only `MM` and `N/A` actually appear as sentinels in `realtime2`; the numeric
 * ones above belong to the older archive formats. Kept narrow on purpose: a
 * real 999 hPa pressure reading is plausible, so pressure is exempted.
 */
const NUMERIC_SENTINEL_EXEMPT = new Set(['PRES', 'BAR'])

export function isMissing(column: string, raw: string): boolean {
  if (raw === 'MM' || raw === 'N/A') return true
  if (NUMERIC_SENTINEL_EXEMPT.has(column)) return false
  return MISSING.has(raw)
}

/**
 * Splits a `realtime2` file into named columns and rows. Reads the column names
 * from the `#YY MM DD ...` header rather than hardcoding offsets, so the `.txt`
 * and `.spec` layouts go through the same code.
 */
export function parseTabularFile(text: string): ParsedFile {
  const lines = text.split('\n')
  let columns: string[] = []
  const rows: ParsedRow[] = []

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (line === '') continue

    if (line.startsWith('#')) {
      // The first comment line names the columns; the second gives units.
      if (columns.length === 0) {
        columns = line.slice(1).trim().split(/\s+/)
      }
      continue
    }

    if (columns.length === 0) continue

    const cells = line.split(/\s+/)
    if (cells.length < 5) continue

    const observedAt = toIsoTimestamp(cells[0], cells[1], cells[2], cells[3], cells[4])
    if (observedAt === null) continue

    const values: Record<string, string> = {}
    for (let i = 5; i < columns.length; i += 1) {
      const name = columns[i]
      const cell = cells[i]
      if (name === undefined || cell === undefined) continue
      values[name] = cell
    }
    rows.push({ observedAt, values })
  }

  return { columns, rows }
}

function toIsoTimestamp(
  yy: string | undefined,
  mm: string | undefined,
  dd: string | undefined,
  hh: string | undefined,
  mi: string | undefined,
): string | null {
  if (yy === undefined || mm === undefined || dd === undefined || hh === undefined || mi === undefined) {
    return null
  }
  const year = Number(yy)
  const month = Number(mm)
  const day = Number(dd)
  const hour = Number(hh)
  const minute = Number(mi)
  if ([year, month, day, hour, minute].some((n) => !Number.isFinite(n))) return null
  if (year < 1970 || month < 1 || month > 12 || day < 1 || day > 31) return null
  if (hour > 23 || minute > 59) return null

  const ms = Date.UTC(year, month - 1, day, hour, minute, 0)
  if (!Number.isFinite(ms)) return null
  return new Date(ms).toISOString()
}

/** Which NDBC column feeds which `Reading` field, and from which file. */
const TXT_COLUMNS: Record<string, string> = {
  WVHT: 'waveHeightM',
  DPD: 'dominantPeriodS',
  APD: 'averagePeriodS',
  MWD: 'waveDirectionDeg',
  WSPD: 'windSpeedMs',
  GST: 'windGustMs',
  WDIR: 'windDirectionDeg',
  WTMP: 'waterTempC',
  ATMP: 'airTempC',
  PRES: 'pressureHpa',
}

const SPEC_COLUMNS: Record<string, string> = {
  WVHT: 'waveHeightM',
  SwH: 'swellHeightM',
  SwP: 'swellPeriodS',
  SwD: 'swellDirection',
  WWH: 'windWaveHeightM',
  WWP: 'windWavePeriodS',
  STEEPNESS: 'steepness',
  APD: 'averagePeriodS',
  MWD: 'waveDirectionDeg',
}

/** Fields NDBC reports as text, not numbers. */
const TEXT_FIELDS = new Set(['swellDirection', 'steepness'])

/**
 * How far back a value may be carried forward when the newest row has `MM` for
 * it. Three hours: NDBC publishes wind every ten minutes but waves only two or
 * three times an hour, so without a window a station reporting a 2 m swell
 * would show an em-dash most of the time. Past three hours the value is stale
 * enough that `absent` is the more honest answer.
 */
export const CARRY_FORWARD_WINDOW_MS = 3 * 60 * 60 * 1000

interface Candidate {
  value: number | string
  observedAt: string
}

/**
 * Builds one `Reading` from the `.txt` file and, when the station has one, the
 * `.spec` file.
 *
 * `observedAt` is the newest row in either file — the station's latest report.
 * Each field takes the newest non-`MM` value within the carry-forward window,
 * and is marked `measured` when that value came from the `observedAt` row and
 * `derived` when it was carried forward from an earlier one.
 */
export function buildReading(
  stationId: string,
  txt: string | null,
  spec: string | null,
  fetchedAt: string,
): Reading | null {
  const collected = new Map<string, Candidate>()
  let newestRowAt: string | null = null

  const ingest = (text: string | null, mapping: Record<string, string>) => {
    if (text === null) return
    const parsed = parseTabularFile(text)
    for (const row of parsed.rows) {
      if (newestRowAt === null || row.observedAt > newestRowAt) newestRowAt = row.observedAt

      for (const [column, field] of Object.entries(mapping)) {
        const raw = row.values[column]
        if (raw === undefined || isMissing(column, raw)) continue

        const value = TEXT_FIELDS.has(field) ? raw : Number(raw)
        if (typeof value === 'number' && !Number.isFinite(value)) continue

        const existing = collected.get(field)
        // Rows arrive newest-first, but the two files interleave, so compare.
        if (existing === undefined || row.observedAt > existing.observedAt) {
          collected.set(field, { value, observedAt: row.observedAt })
        }
      }
    }
  }

  ingest(txt, TXT_COLUMNS)
  ingest(spec, SPEC_COLUMNS)

  if (newestRowAt === null) return null
  const observedAt: string = newestRowAt
  const cutoffMs = Date.parse(observedAt) - CARRY_FORWARD_WINDOW_MS

  const fieldSources: Record<string, FieldSource> = {}
  const fieldObservedAt: Record<string, string> = {}
  const measurements: Record<string, number | string | null> = {}

  for (const field of READING_FIELDS) {
    const candidate = collected.get(field)
    if (candidate === undefined || Date.parse(candidate.observedAt) < cutoffMs) {
      measurements[field] = null
      fieldSources[field] = 'absent'
      continue
    }
    measurements[field] = candidate.value
    fieldSources[field] = candidate.observedAt === observedAt ? 'measured' : 'derived'
    fieldObservedAt[field] = candidate.observedAt
  }

  return {
    stationId,
    observedAt,
    waveHeightM: numberOrNull(measurements.waveHeightM),
    dominantPeriodS: numberOrNull(measurements.dominantPeriodS),
    averagePeriodS: numberOrNull(measurements.averagePeriodS),
    waveDirectionDeg: numberOrNull(measurements.waveDirectionDeg),
    windSpeedMs: numberOrNull(measurements.windSpeedMs),
    windGustMs: numberOrNull(measurements.windGustMs),
    windDirectionDeg: numberOrNull(measurements.windDirectionDeg),
    waterTempC: numberOrNull(measurements.waterTempC),
    airTempC: numberOrNull(measurements.airTempC),
    pressureHpa: numberOrNull(measurements.pressureHpa),
    swellHeightM: numberOrNull(measurements.swellHeightM),
    swellPeriodS: numberOrNull(measurements.swellPeriodS),
    swellDirection: stringOrNull(measurements.swellDirection),
    windWaveHeightM: numberOrNull(measurements.windWaveHeightM),
    windWavePeriodS: numberOrNull(measurements.windWavePeriodS),
    steepness: stringOrNull(measurements.steepness),
    fieldSources,
    fieldObservedAt,
    fetchedAt,
  }
}

function numberOrNull(value: number | string | null | undefined): number | null {
  return typeof value === 'number' ? value : null
}

function stringOrNull(value: number | string | null | undefined): string | null {
  return typeof value === 'string' ? value : null
}

/** A reading with neither waves nor wind is no usable data — see `Reading`. */
export function hasUsableData(reading: Reading): boolean {
  return reading.waveHeightM !== null || reading.windSpeedMs !== null
}
