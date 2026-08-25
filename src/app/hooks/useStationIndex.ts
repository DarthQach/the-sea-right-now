import { useEffect, useState } from 'react'
import type { StationIndex } from '../../lib/shared/types'
import { fetchStationIndex } from '../../lib/api'
import snapshot from '../../data/stations.snapshot.json'

/**
 * The station index.
 *
 * A snapshot ships inside the bundle so the globe renders on first paint with no
 * network round trip, then the live index replaces it in the background. NDBC
 * station positions change on the order of months; the `met` flags, which the
 * nearest-live-station search filters on, change daily, which is why the refresh
 * happens at all.
 */
export interface StationIndexState {
  index: StationIndex
  /** True while the live index is still being fetched. */
  refreshing: boolean
  /** True when the live refresh failed and the bundled snapshot is what you see. */
  usingBundled: boolean
}

const BUNDLED: StationIndex = { ...(snapshot as StationIndex), source: 'bundled' }

export function useStationIndex(): StationIndexState {
  const [state, setState] = useState<StationIndexState>({
    index: BUNDLED,
    refreshing: true,
    usingBundled: true,
  })

  useEffect(() => {
    const controller = new AbortController()
    fetchStationIndex(controller.signal)
      .then((index) => setState({ index, refreshing: false, usingBundled: index.source !== 'live' }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setState((current) => ({ ...current, refreshing: false, usingBundled: true }))
        console.warn('The live station index could not be refreshed; using the bundled snapshot.', error)
      })
    return () => controller.abort()
  }, [])

  return state
}
