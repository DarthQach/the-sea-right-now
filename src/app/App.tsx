import { useMemo } from 'react'
import { useUrlState } from './hooks/useUrlState'
import { useStationIndex } from './hooks/useStationIndex'
import { SeaView } from './views/SeaView'
import { loadPrefs } from '../lib/storage'

/**
 * Routing. Every route is a URL, and `?station={id}` is the shareable unit.
 */
const DEFAULT_STATION = '46042'

export function App() {
  const [urlState] = useUrlState()
  const { index } = useStationIndex()

  const stationId = useMemo(() => {
    if (urlState.stationId !== null) return urlState.stationId
    return loadPrefs().lastStationId ?? DEFAULT_STATION
  }, [urlState.stationId])

  const station = useMemo(
    () => index.stations.find((candidate) => candidate.id.toUpperCase() === stationId.toUpperCase()),
    [index, stationId],
  )

  return <SeaView stationId={stationId} station={station} urlState={urlState} />
}
