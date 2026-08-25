import { useCallback, useMemo, useState } from 'react'
import { FAVOURITES_CAP, loadFavourites, saveFavourites } from '../../lib/storage'

export interface FavouritesState {
  stationIds: string[]
  has: (stationId: string) => boolean
  toggle: (stationId: string) => void
  remove: (stationId: string) => void
  /** True when the last add was refused because the list is full. */
  atCap: boolean
  cap: number
}

/**
 * Favourites, in this browser and nowhere else.
 *
 * There is no account and no server: the list lives in `localStorage` and a URL
 * is how you hand a station to someone else.
 */
export function useFavourites(): FavouritesState {
  const [stationIds, setStationIds] = useState<string[]>(() => loadFavourites().stationIds)
  const [atCap, setAtCap] = useState(false)

  const set = useCallback((ids: string[]) => {
    setStationIds(ids)
    saveFavourites({ schemaVersion: 1, stationIds: ids })
  }, [])

  const has = useCallback(
    (stationId: string) => stationIds.includes(stationId.toUpperCase()),
    [stationIds],
  )

  const toggle = useCallback(
    (stationId: string) => {
      const id = stationId.toUpperCase()
      if (stationIds.includes(id)) {
        setAtCap(false)
        set(stationIds.filter((existing) => existing !== id))
        return
      }
      if (stationIds.length >= FAVOURITES_CAP) {
        // Refuse rather than silently dropping the oldest. Which one would go is
        // not this product's decision to make.
        setAtCap(true)
        return
      }
      setAtCap(false)
      set([...stationIds, id])
    },
    [set, stationIds],
  )

  const remove = useCallback(
    (stationId: string) => {
      const id = stationId.toUpperCase()
      setAtCap(false)
      set(stationIds.filter((existing) => existing !== id))
    },
    [set, stationIds],
  )

  return useMemo(
    () => ({ stationIds, has, toggle, remove, atCap, cap: FAVOURITES_CAP }),
    [stationIds, has, toggle, remove, atCap],
  )
}
