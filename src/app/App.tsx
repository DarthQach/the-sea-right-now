import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Station } from '../lib/shared/types'
import { deriveSpectrumParams, type SpectrumParams } from '../lib/spectrum'
import { nearestReportingStation } from '../lib/geo'
import { ageSecondsSince, formatAge } from '../lib/format'
import { stationStatus } from '../lib/station-status'
import { useUrlState } from './hooks/useUrlState'
import { useStationIndex } from './hooks/useStationIndex'
import { usePrefs } from './hooks/usePrefs'
import { useReading } from './hooks/useReading'
import { useNow } from './hooks/useNow'
import { useAudio } from './hooks/useAudio'
import { useFavourites } from './hooks/useFavourites'
import { shareableUrl } from '../lib/url-state'
import { SceneStage } from './components/SceneStage'
import { SeaChrome } from './views/SeaChrome'
import { GlobeChrome } from './views/GlobeChrome'
import { StationsPanel } from './components/StationsPanel'
import { HoverLabel } from './components/HoverLabel'
import { StationUnavailableCard, UnknownStationCard } from './components/StationCard'
import type { Backend } from '../scene/renderer'

export function App() {
  const [urlState, navigate] = useUrlState()
  const { index, refreshing } = useStationIndex()
  const [prefs, setPrefs] = usePrefs()
  const now = useNow()

  const stationId = urlState.stationId
  const mode = stationId === null ? 'globe' : 'sea'

  const { status, reading, staleForSeconds, retrying, retry } = useReading(stationId, urlState.simulateOutage)

  const station = useMemo(
    () =>
      stationId === null
        ? undefined
        : index.stations.find((candidate) => candidate.id.toUpperCase() === stationId.toUpperCase()),
    [index, stationId],
  )

  const params: SpectrumParams | null = useMemo(
    () => (reading === null ? null : deriveSpectrumParams(reading)),
    [reading],
  )

  const [resetSignal, setResetSignal] = useState(0)
  const [backend, setBackend] = useState<Backend | null>(null)
  const [throttled, setThrottled] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const favourites = useFavourites()
  const [hovered, setHovered] = useState<{ station: Station; screen: { x: number; y: number } } | null>(null)

  // Exact reading ages for stations this visitor has actually opened. Everything
  // else on the globe is coloured from NDBC's own index flag, because polling
  // the whole network to colour a map is out of the question.
  //
  // Accumulated during render rather than in an effect: this is state being
  // adjusted because a prop changed, which React handles in one pass without an
  // extra paint.
  const [knownAges, setKnownAges] = useState<ReadonlyMap<string, number | null>>(() => new Map())
  const [lastReading, setLastReading] = useState(reading)
  if (reading !== lastReading) {
    setLastReading(reading)
    if (reading !== null) {
      const id = reading.stationId.toUpperCase()
      const age = ageSecondsSince(reading.observedAt, now)
      if (knownAges.get(id) !== age) {
        const next = new Map(knownAges)
        next.set(id, age)
        setKnownAges(next)
      }
    }
  }

  const initialAudio = useMemo(
    () => ({ mode: urlState.audioMode ?? prefs.audioMode, volume: prefs.volume, muted: prefs.muted }),
    [urlState.audioMode, prefs.audioMode, prefs.volume, prefs.muted],
  )
  const audio = useAudio(params, initialAudio)

  const statusOf = useCallback(
    (candidate: Station) => stationStatus(candidate, knownAges.get(candidate.id.toUpperCase())),
    [knownAges],
  )

  /**
   * The link the copy control hands over: the station, and the mapping if one
   * was chosen. Nothing personal, and short enough to read down a phone.
   */
  const copyLink = useCallback(
    async (id: string) => {
      const url = shareableUrl(globalThis.location.origin, id, urlState.audioMode)
      try {
        await navigator.clipboard.writeText(url)
        setCopyState('copied')
      } catch {
        // Clipboard access can be refused outright. Put the link where the
        // visitor can still get at it rather than pretending it worked.
        navigate({ stationId: id, audioMode: urlState.audioMode }, true)
        setCopyState('failed')
      }
      globalThis.setTimeout(() => setCopyState('idle'), 3200)
    },
    [navigate, urlState.audioMode],
  )

  // How many stations sit in each status treatment. The globe's pins are GPU
  // instances, so this is what a journey test can read to prove all three
  // treatments are actually on screen.
  const pinCounts = useMemo(() => {
    const counts = { live: 0, stale: 0, dead: 0 }
    for (const candidate of index.stations) counts[statusOf(candidate)] += 1
    return counts
  }, [index.stations, statusOf])

  const openStation = useCallback(
    (next: Station | string) => {
      const id = typeof next === 'string' ? next : next.id
      navigate({ stationId: id.toUpperCase() })
      setPanelOpen(false)
      setHovered(null)
    },
    [navigate],
  )

  useEffect(() => {
    if (stationId !== null && prefs.lastStationId !== stationId) setPrefs({ lastStationId: stationId })
  }, [stationId, prefs.lastStationId, setPrefs])

  useEffect(() => {
    document.title =
      station === undefined ? 'The Sea, Right Now' : `${station.name} — The Sea, Right Now`
  }, [station])

  // The nearest station that is actually reporting, computed on the page from
  // the index already in memory. No server call, no second endpoint.
  const nearest = useMemo(() => {
    if (station === undefined) return null
    return nearestReportingStation(index.stations, station.lat, station.lon, { excludeId: station.id })
  }, [index.stations, station])

  const noUsableData =
    status === 'not_reporting' ||
    (status === 'ready' && reading !== null && reading.waveHeightM === null && reading.windSpeedMs === null)

  const showUnknown = status === 'unknown_station' || (stationId !== null && station === undefined && !refreshing)

  const hoveredAge = hovered === null ? undefined : knownAges.get(hovered.station.id.toUpperCase())

  return (
    <div
      className="app"
      data-testid={mode === 'sea' ? 'sea-view' : 'globe-view'}
      data-mode={mode}
      data-status={status}
      data-backend={backend ?? 'pending'}
      data-throttled={throttled ? 'true' : 'false'}
      data-audio-playing={audio.state.playing ? 'true' : 'false'}
      data-audio-mode={audio.state.mode}
      data-audio-volume={audio.state.volume.toFixed(2)}
      data-audio-context={audio.state.contextState ?? 'none'}
      data-audio-level={audio.state.level.toFixed(4)}
      data-pin-counts={`${pinCounts.live},${pinCounts.stale},${pinCounts.dead}`}
      data-stations={index.stations.length}
    >
      <SceneStage
        mode={mode}
        forceWebGL={urlState.forceWebGL}
        forceThrottled={urlState.forceThrottled}
        motionScale={1}
        resetSignal={resetSignal}
        params={params}
        stations={index.stations}
        statusOf={statusOf}
        pinRevision={knownAges.size}
        focusStation={station}
        onHoverStation={(hoveredStation, screen) =>
          setHovered(hoveredStation === null || screen === null ? null : { station: hoveredStation, screen })
        }
        onSelectStation={openStation}
        onBackend={setBackend}
        onThrottleChange={setThrottled}
      />

      <div className="chrome">
        {mode === 'sea' && stationId !== null ? (
          <SeaChrome
            stationId={stationId}
            station={station}
            reading={reading}
            params={params}
            now={now}
            audio={audio.state}
            onAudioToggle={audio.toggle}
            onAudioMode={(nextMode) => {
              audio.setMode(nextMode)
              setPrefs({ audioMode: nextMode })
              navigate({ audioMode: nextMode }, true)
            }}
            onAudioVolume={(volume) => {
              audio.setVolume(volume)
              setPrefs({ volume })
            }}
            onAudioMuted={(muted) => {
              audio.setMuted(muted)
              setPrefs({ muted })
            }}
            onResetCamera={() => setResetSignal((n) => n + 1)}
            onOpenGlobe={() => navigate({ stationId: null })}
            onOpenSearch={() => setPanelOpen(true)}
            favourited={favourites.has(stationId)}
            onToggleFavourite={() => favourites.toggle(stationId)}
            onCopyLink={() => void copyLink(stationId)}
            copyState={copyState}
          />
        ) : null}

        {mode === 'globe' ? (
          <GlobeChrome
            stationCount={index.stations.length}
            hovered={hovered}
            onOpenSearch={() => setPanelOpen(true)}
          />
        ) : null}

        {showUnknown && stationId !== null ? (
          <div className="slot-centre">
            <UnknownStationCard
              stationId={stationId}
              onGlobe={() => navigate({ stationId: null })}
              onSearch={() => {
                navigate({ stationId: null })
                setPanelOpen(true)
              }}
            />
          </div>
        ) : null}

        {!showUnknown && noUsableData && stationId !== null ? (
          <div className="slot-centre">
            <StationUnavailableCard
              station={station}
              stationId={stationId}
              lastReportedAt={reading?.observedAt ?? null}
              nearest={nearest}
              onGo={openStation}
              onGlobe={() => navigate({ stationId: null })}
            />
          </div>
        ) : null}

        {panelOpen ? (
          <StationsPanel
            stations={index.stations}
            currentStationId={stationId}
            knownAges={knownAges}
            favourites={favourites}
            onSelect={openStation}
            onClose={() => setPanelOpen(false)}
          />
        ) : null}
      </div>

      {hovered !== null && mode === 'globe' ? (
        <HoverLabel
          station={hovered.station}
          screen={hovered.screen}
          knownAge={hoveredAge}
          knownAgeText={hoveredAge === undefined ? undefined : formatAge(hoveredAge)}
        />
      ) : null}

      {status === 'unavailable' ? (
        <div className="banner" role="status" data-testid="data-problem-banner">
          <span className="banner__mark" aria-hidden="true" />
          <span>
            Live data from NOAA NDBC is unavailable.
            {reading === null
              ? ' No earlier reading for this station has reached us.'
              : ` The water is drawn from the last reading that did${
                  staleForSeconds === null ? '' : `, ${Math.round(staleForSeconds / 60)} min ago`
                }.`}
          </span>
          <span className="banner__spacer" />
          <button type="button" className="control" onClick={retry} data-testid="retry-reading">
            {retrying ? 'Retrying…' : 'Retry'}
          </button>
        </div>
      ) : null}
    </div>
  )
}
