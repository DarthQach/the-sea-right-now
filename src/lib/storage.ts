/**
 * `localStorage`, wrapped.
 *
 * A private window, disabled site data, a full quota or a value corrupted by a
 * previous version must all produce defaults — never a broken page. Every read
 * and write here is guarded, and an unrecognised `schemaVersion` is discarded
 * rather than migrated blindly.
 *
 * Nothing stored here ever leaves the browser.
 */
import type { AudioMode } from './url-state'

export const FAVOURITES_KEY = 'tsrn.favourites'
export const PREFS_KEY = 'tsrn.prefs'

export const SCHEMA_VERSION = 1
/** Soft cap. Past this, favouriting says so rather than silently dropping one. */
export const FAVOURITES_CAP = 100

export interface Favourites {
  schemaVersion: number
  stationIds: string[]
}

export type MotionOverride = 'auto' | 'full' | 'reduced'

export interface Prefs {
  schemaVersion: number
  audioMode: AudioMode
  /** 0…1. */
  volume: number
  /** Audio never starts without a user gesture regardless of this. */
  muted: boolean
  chromeHidden: boolean
  /** `auto` follows the system `prefers-reduced-motion` setting. */
  motionOverride: MotionOverride
  lastStationId: string | null
}

export const DEFAULT_FAVOURITES: Favourites = { schemaVersion: SCHEMA_VERSION, stationIds: [] }

export const DEFAULT_PREFS: Prefs = {
  schemaVersion: SCHEMA_VERSION,
  audioMode: 'literal',
  volume: 0.6,
  muted: false,
  chromeHidden: false,
  motionOverride: 'auto',
  lastStationId: null,
}

function readRaw(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null
  } catch {
    return null
  }
}

function writeRaw(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value)
  } catch {
    // A full quota or a browser with site data disabled is not an error the
    // visitor can act on. Their favourites simply do not persist.
  }
}

export function loadFavourites(): Favourites {
  const raw = readRaw(FAVOURITES_KEY)
  if (raw === null) return DEFAULT_FAVOURITES

  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_FAVOURITES
    const candidate = parsed as Partial<Favourites>
    if (candidate.schemaVersion !== SCHEMA_VERSION) return DEFAULT_FAVOURITES
    if (!Array.isArray(candidate.stationIds)) return DEFAULT_FAVOURITES

    const stationIds = dedupe(candidate.stationIds.filter((id): id is string => typeof id === 'string'))
    return { schemaVersion: SCHEMA_VERSION, stationIds: stationIds.slice(0, FAVOURITES_CAP) }
  } catch {
    return DEFAULT_FAVOURITES
  }
}

export function saveFavourites(favourites: Favourites): void {
  writeRaw(
    FAVOURITES_KEY,
    JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      stationIds: dedupe(favourites.stationIds).slice(0, FAVOURITES_CAP),
    } satisfies Favourites),
  )
}

export function loadPrefs(): Prefs {
  const raw = readRaw(PREFS_KEY)
  if (raw === null) return DEFAULT_PREFS

  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_PREFS
    const candidate = parsed as Partial<Prefs>
    if (candidate.schemaVersion !== SCHEMA_VERSION) return DEFAULT_PREFS

    return {
      schemaVersion: SCHEMA_VERSION,
      audioMode: candidate.audioMode === 'tuned' ? 'tuned' : 'literal',
      volume: clamp01(typeof candidate.volume === 'number' ? candidate.volume : DEFAULT_PREFS.volume),
      muted: candidate.muted === true,
      chromeHidden: candidate.chromeHidden === true,
      motionOverride:
        candidate.motionOverride === 'full' || candidate.motionOverride === 'reduced'
          ? candidate.motionOverride
          : 'auto',
      lastStationId: typeof candidate.lastStationId === 'string' ? candidate.lastStationId : null,
    }
  } catch {
    return DEFAULT_PREFS
  }
}

export function savePrefs(prefs: Prefs): void {
  writeRaw(PREFS_KEY, JSON.stringify({ ...prefs, schemaVersion: SCHEMA_VERSION } satisfies Prefs))
}

function dedupe(ids: string[]): string[] {
  return [...new Set(ids)]
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_PREFS.volume
  return Math.min(1, Math.max(0, value))
}
