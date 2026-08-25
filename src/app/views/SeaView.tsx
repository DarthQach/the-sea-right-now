import { useEffect, useMemo, useState } from 'react'
import type { Station } from '../../lib/shared/types'
import { deriveSpectrumParams, type SpectrumParams } from '../../lib/spectrum'
import { ageSecondsSince } from '../../lib/format'
import type { UrlState } from '../../lib/url-state'
import { SceneCanvas } from '../components/SceneCanvas'
import { StationHeader } from '../components/StationHeader'
import { Readout, readoutValues } from '../components/Readout'
import { SpectrumPlot } from '../components/SpectrumPlot'
import { useReading } from '../hooks/useReading'
import { useNow } from '../hooks/useNow'
import { useAudio } from '../hooks/useAudio'
import { AudioControls } from '../components/AudioControls'
import type { Prefs } from '../../lib/storage'
import type { AudioMode } from '../../lib/url-state'
import type { Backend } from '../../scene/renderer'

export interface SeaViewProps {
  stationId: string
  station: Station | undefined
  urlState: UrlState
  prefs: Prefs
  onPrefs: (patch: Partial<Prefs>) => void
  onAudioMode: (mode: AudioMode) => void
}

/**
 * The sea view — the hero.
 *
 * A full-frame ocean whose spectrum comes from this station's live reading, with
 * the numbers it was built from sitting quietly in the corners.
 */
export function SeaView({ stationId, station, urlState, prefs, onPrefs, onAudioMode }: SeaViewProps) {
  const { status, reading, staleForSeconds, retrying, retry } = useReading(stationId, urlState.simulateOutage)
  const now = useNow()
  const [resetSignal, setResetSignal] = useState(0)
  const [backend, setBackend] = useState<Backend | null>(null)
  const [throttled, setThrottled] = useState(false)

  const params: SpectrumParams | null = useMemo(
    () => (reading === null ? null : deriveSpectrumParams(reading)),
    [reading],
  )

  const ageSeconds = ageSecondsSince(reading?.observedAt ?? null, now)
  const values = readoutValues(reading)

  // The URL wins over the stored preference, so a shared link that names a
  // mapping opens in that mapping.
  const initialAudio = useMemo(
    () => ({ mode: urlState.audioMode ?? prefs.audioMode, volume: prefs.volume, muted: prefs.muted }),
    [urlState.audioMode, prefs.audioMode, prefs.volume, prefs.muted],
  )
  const audio = useAudio(params, initialAudio)

  useEffect(() => {
    document.title = station === undefined ? 'The Sea, Right Now' : `${station.name} — The Sea, Right Now`
  }, [station])

  return (
    <div
      className="app"
      data-testid="sea-view"
      data-status={status}
      data-backend={backend ?? 'pending'}
      data-throttled={throttled ? 'true' : 'false'}
      data-audio-playing={audio.state.playing ? 'true' : 'false'}
      data-audio-mode={audio.state.mode}
      data-audio-volume={audio.state.volume.toFixed(2)}
      data-audio-context={audio.state.contextState ?? 'none'}
      data-audio-level={audio.state.level.toFixed(4)}
    >
      <SceneCanvas
        params={params}
        motionScale={1}
        forceWebGL={urlState.forceWebGL}
        resetSignal={resetSignal}
        forceThrottled={urlState.forceThrottled}
        onBackend={(value) => setBackend(value)}
        onThrottleChange={setThrottled}
      />

      <div className="chrome">
        <div className="slot-top-left">
          <StationHeader
            station={station}
            stationId={stationId}
            ageSeconds={ageSeconds}
            observedAt={reading?.observedAt ?? null}
          />
        </div>

        <div className="slot-bottom-left">
          <Readout values={values}>
            <SpectrumPlot params={params} />
          </Readout>
        </div>

        <div className="slot-bottom-right">
          <div className="controls">
            <AudioControls
              state={audio.state}
              onToggle={audio.toggle}
              onMode={(mode) => {
                audio.setMode(mode)
                onPrefs({ audioMode: mode })
                onAudioMode(mode)
              }}
              onVolume={(volume) => {
                audio.setVolume(volume)
                onPrefs({ volume })
              }}
              onMuted={(muted) => {
                audio.setMuted(muted)
                onPrefs({ muted })
              }}
            />
            <div className="control-cluster">
              <button
                type="button"
                className="control control--icon"
                onClick={() => setResetSignal((n) => n + 1)}
                title="Reset the camera to the default framing"
                aria-label="Reset the camera to the default framing"
                data-testid="reset-camera"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 9a8 8 0 0 1 13.7-4.3L20 7" />
                  <path d="M20 3v4h-4" />
                  <path d="M20 15a8 8 0 0 1-13.7 4.3L4 17" />
                  <path d="M4 21v-4h4" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

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
