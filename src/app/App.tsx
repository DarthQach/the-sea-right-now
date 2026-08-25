import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { REDUCED_MOTION_SCALE, useReducedMotion } from './hooks/useMotion'
import { useOnBattery } from './hooks/useBattery'
import { SettingsPanel } from './components/SettingsPanel'
import { AboutPanel } from './components/AboutPanel'
import { ReducedCapabilityNotice } from './components/Notices'
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
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [noticeDismissed, setNoticeDismissed] = useState(false)
  const [throttleReasons, setThrottleReasons] = useState<string[]>([])
  const [pointerAwake, setPointerAwake] = useState(false)
  const noticesRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<HTMLDivElement>(null)
  const [forcedWebGL, setForcedWebGL] = useState(false)
  const favourites = useFavourites()

  const { reduced, systemPrefers } = useReducedMotion(prefs.motionOverride)
  const onBattery = useOnBattery()

  // The motion preference reaches the interface's own transitions through the
  // document, so one setting governs both the water and the panels.
  useEffect(() => {
    document.documentElement.dataset.motion = prefs.motionOverride === 'auto' ? '' : prefs.motionOverride
  }, [prefs.motionOverride])

  // Anything docked to the top edge — the data-problem banner, the
  // reduced-capability notice — reserves its own height so it cannot land on the
  // station name. On a phone the two are the same width and would otherwise sit
  // exactly on top of each other.
  useEffect(() => {
    const notices = noticesRef.current
    const app = appRef.current
    if (notices === null || app === null) return
    const apply = () => {
      const height = notices.getBoundingClientRect().height
      app.style.setProperty('--top-notice-height', `${Math.ceil(height)}px`)
    }
    const observer = new ResizeObserver(apply)
    observer.observe(notices)
    apply()
    return () => observer.disconnect()
  }, [])

  // With the interface hidden, pointer movement brings the readout back for a
  // moment and then lets it fade again.
  useEffect(() => {
    if (!prefs.chromeHidden) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const wake = () => {
      setPointerAwake(true)
      clearTimeout(timer)
      timer = setTimeout(() => setPointerAwake(false), 2400)
    }
    globalThis.addEventListener('pointermove', wake)
    globalThis.addEventListener('keydown', wake)
    return () => {
      clearTimeout(timer)
      globalThis.removeEventListener('pointermove', wake)
      globalThis.removeEventListener('keydown', wake)
    }
  }, [prefs.chromeHidden])

  // Escape brings the interface back, so it can never be hidden irrecoverably.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (prefs.chromeHidden) setPrefs({ chromeHidden: false })
      setSettingsOpen(false)
      setPanelOpen(false)
      if (urlState.about) navigate({ about: false }, true)
    }
    globalThis.addEventListener('keydown', onKey)
    return () => globalThis.removeEventListener('keydown', onKey)
  }, [prefs.chromeHidden, setPrefs, urlState.about, navigate])
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
      ref={appRef}
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
      data-reduced-motion={reduced ? 'true' : 'false'}
      data-chrome-hidden={prefs.chromeHidden ? 'true' : 'false'}
      data-throttle-reasons={throttleReasons.join(',')}
    >
      <SceneStage
        mode={mode}
        forceWebGL={urlState.forceWebGL}
        throttle={{ requested: urlState.forceThrottled, battery: onBattery }}
        motionScale={reduced ? REDUCED_MOTION_SCALE : 1}
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
        onBackend={(value, forced) => {
          setBackend(value)
          setForcedWebGL(forced)
        }}
        onThrottleChange={(value, reasons) => {
          setThrottled(value)
          setThrottleReasons(reasons)
        }}
      />

      <div
        className="chrome"
        data-hidden={prefs.chromeHidden ? 'true' : 'false'}
        data-pointer-active={pointerAwake ? 'true' : 'false'}
        data-side-panel={settingsOpen || urlState.about ? 'right' : panelOpen ? 'left' : 'none'}
      >
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
            onOpenSettings={() => setSettingsOpen(true)}
            chromeHidden={prefs.chromeHidden}
            onToggleChrome={() => setPrefs({ chromeHidden: !prefs.chromeHidden })}
            onOpenAbout={() => navigate({ about: true }, true)}
            throttleReasons={throttleReasons}
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
            onOpenAbout={() => navigate({ about: true }, true)}
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

        {settingsOpen ? (
          <SettingsPanel
            prefs={prefs}
            audio={audio.state}
            systemPrefersReducedMotion={systemPrefers}
            onAudioMode={(nextMode) => {
              audio.setMode(nextMode)
              setPrefs({ audioMode: nextMode })
            }}
            onVolume={(volume) => {
              audio.setVolume(volume)
              setPrefs({ volume })
            }}
            onMotion={(motionOverride) => setPrefs({ motionOverride })}
            onHideChrome={() => {
              setPrefs({ chromeHidden: true })
              setSettingsOpen(false)
            }}
            onResetCamera={() => setResetSignal((n) => n + 1)}
            onClose={() => setSettingsOpen(false)}
          />
        ) : null}

        {urlState.about ? <AboutPanel onClose={() => navigate({ about: false }, true)} /> : null}

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

      {/* Everything that speaks up from the top edge, stacked so two of them
          can never land on top of each other. */}
      <div ref={noticesRef} className="top-notices" data-hidden={prefs.chromeHidden && !pointerAwake ? 'true' : 'false'}>
      {status === 'unavailable' ? (
          <div className="banner" role="status" data-testid="data-problem-banner">
            <span className="banner__mark" aria-hidden="true" />
            <span>
              Live data from NOAA NDBC is unavailable.
              {reading === null ? (
                ' No earlier reading for this station has reached us.'
              ) : (
                <>
                  {' The water is still moving from the last reading that reached us, taken '}
                  <span data-testid="banner-age">
                    {formatAge(staleForSeconds ?? ageSecondsSince(reading.observedAt, now))}
                  </span>
                  .
                </>
              )}
            </span>
            <span className="banner__spacer" />
            <button type="button" className="control" onClick={retry} data-testid="retry-reading">
              {retrying ? 'Retrying…' : 'Retry'}
            </button>
          </div>
        ) : null}

        {backend !== null && !noticeDismissed ? (
          <ReducedCapabilityNotice
            backend={backend}
            forced={forcedWebGL}
            onDismiss={() => setNoticeDismissed(true)}
          />
        ) : null}
      </div>
    </div>
  )
}
