import type { Reading, Station } from '../../lib/shared/types'
import type { SpectrumParams } from '../../lib/spectrum'
import { ageSecondsSince } from '../../lib/format'
import { StationHeader } from '../components/StationHeader'
import { Readout, readoutValues } from '../components/Readout'
import { SpectrumPlot } from '../components/SpectrumPlot'
import { AudioControls } from '../components/AudioControls'
import type { AudioState } from '../hooks/useAudio'
import type { AudioMode } from '../../lib/url-state'

export interface SeaChromeProps {
  stationId: string
  station: Station | undefined
  reading: Reading | null
  params: SpectrumParams | null
  now: number
  audio: AudioState
  onAudioToggle: () => void
  onAudioMode: (mode: AudioMode) => void
  onAudioVolume: (volume: number) => void
  onAudioMuted: (muted: boolean) => void
  onResetCamera: () => void
  onOpenGlobe: () => void
}

/**
 * The interface that sits over the water.
 *
 * Small panels anchored to the corners; the centre of the screen is always
 * water. Everything here exists to be read at a glance and then ignored.
 */
export function SeaChrome(props: SeaChromeProps) {
  const ageSeconds = ageSecondsSince(props.reading?.observedAt ?? null, props.now)

  return (
    <>
      <div className="slot-top-left">
        <StationHeader
          station={props.station}
          stationId={props.stationId}
          ageSeconds={ageSeconds}
          observedAt={props.reading?.observedAt ?? null}
        />
      </div>

      <div className="slot-top-right">
        <button
          type="button"
          className="control control--icon"
          onClick={props.onOpenGlobe}
          title="Back to the globe"
          aria-label="Back to the globe"
          data-testid="open-globe"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18" />
            <path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18" />
          </svg>
        </button>
      </div>

      <div className="slot-bottom-left">
        <Readout values={readoutValues(props.reading)}>
          <SpectrumPlot params={props.params} />
        </Readout>
      </div>

      <div className="slot-bottom-right">
        <div className="controls">
          <AudioControls
            state={props.audio}
            onToggle={props.onAudioToggle}
            onMode={props.onAudioMode}
            onVolume={props.onAudioVolume}
            onMuted={props.onAudioMuted}
          />
          <div className="control-cluster">
            <button
              type="button"
              className="control control--icon"
              onClick={props.onResetCamera}
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
    </>
  )
}
