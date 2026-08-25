import type { Reading, Station } from '../../lib/shared/types'
import type { SpectrumParams } from '../../lib/spectrum'
import { ageSecondsSince } from '../../lib/format'
import { StationHeader } from '../components/StationHeader'
import { Readout, readoutValues } from '../components/Readout'
import { SpectrumPlot } from '../components/SpectrumPlot'
import { AudioControls } from '../components/AudioControls'
import type { AudioState } from '../hooks/useAudio'
import type { AudioMode } from '../../lib/url-state'
import { Star } from '../components/StationsPanel'

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
  onOpenSearch: () => void
  favourited: boolean
  onToggleFavourite: () => void
  onCopyLink: () => void
  /** Set for a few seconds after the link is copied. */
  copyState: 'idle' | 'copied' | 'failed'
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
              aria-pressed={props.favourited}
              onClick={props.onToggleFavourite}
              title={props.favourited ? 'Remove from favourites' : 'Add to favourites'}
              aria-label={props.favourited ? 'Remove from favourites' : 'Add to favourites'}
              data-testid="favourite-toggle"
            >
              <Star filled={props.favourited} />
            </button>

            <button
              type="button"
              className="control control--icon"
              onClick={props.onCopyLink}
              title="Copy a link to this station"
              aria-label="Copy a link to this station"
              data-testid="copy-link"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1" />
                <path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" />
              </svg>
            </button>

            <button
              type="button"
              className="control control--icon"
              onClick={props.onOpenSearch}
              title="Search stations"
              aria-label="Search stations"
              data-testid="open-search"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="6" />
                <path d="M20 20l-4.5-4.5" />
              </svg>
            </button>

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

          {/* A quiet inline confirmation, never a full-width banner. */}
          {props.copyState === 'idle' ? null : (
            <p className="copy-confirmation" role="status" data-testid="copy-confirmation">
              {props.copyState === 'copied'
                ? 'Link copied. It opens on this water.'
                : 'Could not reach the clipboard — the link is in the address bar.'}
            </p>
          )}
        </div>
      </div>
    </>
  )
}
