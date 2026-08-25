import { useEffect, useMemo } from 'react'
import { useUrlState } from './hooks/useUrlState'
import { useStationIndex } from './hooks/useStationIndex'
import { usePrefs } from './hooks/usePrefs'
import { SeaView } from './views/SeaView'

/**
 * Routing. Every route is a URL, and `?station={id}` is the shareable unit.
 */
const DEFAULT_STATION = '46042'

export function App() {
  const [urlState, navigate] = useUrlState()
  const { index } = useStationIndex()
  const [prefs, setPrefs] = usePrefs()

  const stationId = useMemo(() => {
    if (urlState.stationId !== null) return urlState.stationId
    return prefs.lastStationId ?? DEFAULT_STATION
  }, [urlState.stationId, prefs.lastStationId])

  const station = useMemo(
    () => index.stations.find((candidate) => candidate.id.toUpperCase() === stationId.toUpperCase()),
    [index, stationId],
  )

  // Remember where the visitor was, so opening the bare URL returns them there.
  useEffect(() => {
    if (prefs.lastStationId !== stationId) setPrefs({ lastStationId: stationId })
  }, [stationId, prefs.lastStationId, setPrefs])

  return (
    <SeaView
      stationId={stationId}
      station={station}
      urlState={urlState}
      prefs={prefs}
      onPrefs={setPrefs}
      onAudioMode={(mode) => navigate({ audioMode: mode }, true)}
    />
  )
}
