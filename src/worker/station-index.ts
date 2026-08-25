/**
 * The station index, as the Worker sees it.
 *
 * Refreshed from NDBC at most once every 24 hours. When NDBC is unreachable the
 * snapshot that ships inside the bundle is used instead and `source` says so —
 * the globe is never empty, and the page never has to guess whether an ID is
 * real.
 */
import type { Env } from './index'
import type { Station, StationIndex } from '../lib/shared/types'
import snapshot from '../data/stations.snapshot.json'
import { fetchActiveStationsXml } from './ndbc/client'
import { parseActiveStations } from './ndbc/stations'
import { INDEX_TTL_SECONDS, indexKey, readCached, writeCached } from './cache'

/** A parsed index with only 500 stations means NDBC served us something broken. */
const MINIMUM_PLAUSIBLE_STATIONS = 500

/**
 * The snapshot is imported at build time rather than fetched from the asset
 * store: it is the same file the page bundles, it is needed on the failure path
 * where an extra round trip is the last thing anyone wants, and importing it
 * means there is exactly one copy of it in the repository.
 */
const BUNDLED: StationIndex = { ...(snapshot as StationIndex), source: 'bundled' }

export async function getStationIndex(env: Env, ctx: ExecutionContext): Promise<StationIndex> {
  const cached = await readCached<StationIndex>(indexKey())
  if (cached !== null) return cached.value

  try {
    const xml = await fetchActiveStationsXml(env.NDBC_USER_AGENT)
    const index = parseActiveStations(xml, new Date().toISOString(), 'live')
    if (index.stations.length < MINIMUM_PLAUSIBLE_STATIONS) {
      throw new Error(`NDBC returned only ${index.stations.length} stations.`)
    }
    writeCached(indexKey(), index, INDEX_TTL_SECONDS, ctx, new Date().toISOString())
    return index
  } catch {
    return BUNDLED
  }
}

export function findStation(index: StationIndex, id: string): Station | undefined {
  const wanted = id.toUpperCase()
  return index.stations.find((station) => station.id.toUpperCase() === wanted)
}
