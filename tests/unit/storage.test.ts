import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_FAVOURITES, DEFAULT_PREFS, FAVOURITES_CAP, FAVOURITES_KEY, PREFS_KEY,
  loadFavourites, loadPrefs, saveFavourites, savePrefs,
} from '../../src/lib/storage'

/**
 * The storage wrappers exist for exactly one reason: a private window, disabled
 * site data, a full quota or a value left behind by an older version must all
 * produce defaults rather than a broken page. That is what these check.
 */
class MemoryStorage {
  private map = new Map<string, string>()
  getItem(key: string): string | null {
    return this.map.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value)
  }
  removeItem(key: string): void {
    this.map.delete(key)
  }
  clear(): void {
    this.map.clear()
  }
}

let storage: MemoryStorage

beforeEach(() => {
  storage = new MemoryStorage()
  vi.stubGlobal('localStorage', storage)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('loadFavourites', () => {
  it('round-trips what was saved', () => {
    saveFavourites({ schemaVersion: 1, stationIds: ['46042', '44008'] })
    expect(loadFavourites().stationIds).toEqual(['46042', '44008'])
  })

  it('returns defaults for a corrupt value rather than throwing', () => {
    storage.setItem(FAVOURITES_KEY, '{not json at all')
    expect(loadFavourites()).toEqual(DEFAULT_FAVOURITES)
  })

  it('discards an unrecognised schema version rather than migrating blindly', () => {
    storage.setItem(FAVOURITES_KEY, JSON.stringify({ schemaVersion: 99, stationIds: ['46042'] }))
    expect(loadFavourites().stationIds).toEqual([])
  })

  it('survives a value of the wrong shape entirely', () => {
    storage.setItem(FAVOURITES_KEY, JSON.stringify(['46042']))
    expect(loadFavourites()).toEqual(DEFAULT_FAVOURITES)
    storage.setItem(FAVOURITES_KEY, JSON.stringify({ schemaVersion: 1, stationIds: 'nope' }))
    expect(loadFavourites()).toEqual(DEFAULT_FAVOURITES)
  })

  it('deduplicates and drops non-strings on the way in', () => {
    storage.setItem(
      FAVOURITES_KEY,
      JSON.stringify({ schemaVersion: 1, stationIds: ['46042', '46042', 7, null, '44008'] }),
    )
    expect(loadFavourites().stationIds).toEqual(['46042', '44008'])
  })

  it('honours the soft cap', () => {
    const many = Array.from({ length: FAVOURITES_CAP + 25 }, (_, i) => `S${i}`)
    saveFavourites({ schemaVersion: 1, stationIds: many })
    expect(loadFavourites().stationIds).toHaveLength(FAVOURITES_CAP)
  })

  // A private window throws on every access, which must not reach the page.
  it('returns defaults when localStorage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new DOMException('denied')
      },
      setItem() {
        throw new DOMException('denied')
      },
    })
    expect(loadFavourites()).toEqual(DEFAULT_FAVOURITES)
    expect(() => saveFavourites({ schemaVersion: 1, stationIds: ['46042'] })).not.toThrow()
  })

  it('returns defaults when there is no localStorage at all', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(loadFavourites()).toEqual(DEFAULT_FAVOURITES)
    expect(loadPrefs()).toEqual(DEFAULT_PREFS)
  })
})

describe('loadPrefs', () => {
  it('round-trips what was saved', () => {
    savePrefs({ ...DEFAULT_PREFS, audioMode: 'tuned', volume: 0.3, lastStationId: '46042' })
    const loaded = loadPrefs()
    expect(loaded.audioMode).toBe('tuned')
    expect(loaded.volume).toBe(0.3)
    expect(loaded.lastStationId).toBe('46042')
  })

  it('repairs individual fields rather than discarding the whole object', () => {
    storage.setItem(
      PREFS_KEY,
      JSON.stringify({
        schemaVersion: 1,
        audioMode: 'symphonic',
        volume: 47,
        muted: 'yes',
        motionOverride: 'sideways',
        lastStationId: 12345,
      }),
    )
    const loaded = loadPrefs()
    expect(loaded.audioMode).toBe('literal')
    expect(loaded.volume).toBe(1)
    expect(loaded.muted).toBe(false)
    expect(loaded.motionOverride).toBe('auto')
    expect(loaded.lastStationId).toBeNull()
  })

  it('falls back to the default volume for a value that is not a number', () => {
    storage.setItem(PREFS_KEY, JSON.stringify({ schemaVersion: 1, volume: Number.NaN }))
    expect(loadPrefs().volume).toBe(DEFAULT_PREFS.volume)
  })

  it('discards an unrecognised schema version', () => {
    storage.setItem(PREFS_KEY, JSON.stringify({ schemaVersion: 2, volume: 0.1 }))
    expect(loadPrefs()).toEqual(DEFAULT_PREFS)
  })
})
