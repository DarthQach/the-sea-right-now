import type { MotionOverride, Prefs } from '../../lib/storage'
import type { AudioState } from '../hooks/useAudio'
import type { AudioMode } from '../../lib/url-state'

export interface SettingsPanelProps {
  prefs: Prefs
  audio: AudioState
  systemPrefersReducedMotion: boolean
  onAudioMode: (mode: AudioMode) => void
  onVolume: (volume: number) => void
  onMotion: (override: MotionOverride) => void
  onHideChrome: () => void
  onResetCamera: () => void
  onClose: () => void
}

/**
 * Settings.
 *
 * Plain labelled rows, no icon-only controls. Everything here reads and writes
 * local settings, so there is nothing that can fail and no error state to build.
 */
export function SettingsPanel(props: SettingsPanelProps) {
  return (
    <aside className="panel settings-panel" data-testid="settings-panel" aria-label="Settings">
      <div className="settings-panel__head">
        <h2 className="settings-panel__title">Settings</h2>
        <button
          type="button"
          className="control control--icon"
          onClick={props.onClose}
          aria-label="Close settings"
          data-testid="settings-close"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div className="settings-row">
        <span className="settings-row__label">Sound</span>
        <div className="segmented" role="group" aria-label="Sonification mapping">
          {(['literal', 'tuned'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className="segmented__option"
              aria-pressed={props.audio.mode === mode}
              data-testid={`settings-audio-${mode}`}
              onClick={() => props.onAudioMode(mode)}
            >
              {mode === 'literal' ? 'Literal' : 'Tuned'}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-row">
        <label className="settings-row__label" htmlFor="settings-volume">
          Volume
        </label>
        <input
          id="settings-volume"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={props.audio.volume}
          data-testid="settings-volume"
          onChange={(event) => props.onVolume(Number(event.target.value))}
        />
      </div>

      <div className="settings-row settings-row--stacked">
        <span className="settings-row__label">Motion</span>
        <div className="segmented" role="group" aria-label="How much the sea moves">
          {(['auto', 'full', 'reduced'] as const).map((option) => (
            <button
              key={option}
              type="button"
              className="segmented__option"
              aria-pressed={props.prefs.motionOverride === option}
              data-testid={`settings-motion-${option}`}
              onClick={() => props.onMotion(option)}
            >
              {option === 'auto' ? 'Auto' : option === 'full' ? 'Full' : 'Reduced'}
            </button>
          ))}
        </div>
        <p className="settings-row__note secondary">
          Auto follows this device, which currently asks for{' '}
          {props.systemPrefersReducedMotion ? 'reduced motion' : 'full motion'}.
        </p>
      </div>

      <div className="settings-row">
        <span className="settings-row__label">Camera</span>
        <button type="button" className="control" onClick={props.onResetCamera} data-testid="settings-reset-camera">
          Reset to the default framing
        </button>
      </div>

      <div className="settings-row">
        <span className="settings-row__label">Interface</span>
        <button type="button" className="control" onClick={props.onHideChrome} data-testid="settings-hide-chrome">
          Hide everything but the water
        </button>
      </div>
    </aside>
  )
}
