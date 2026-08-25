import type { AudioState } from '../hooks/useAudio'
import type { AudioMode } from '../../lib/url-state'

/**
 * The audio cluster.
 *
 * In the off state the audio control is the most inviting thing on the page —
 * quietly irresistible without being loud. Sound never starts on its own, so the
 * first click has to feel like an invitation rather than a setting.
 */
export function AudioControls({
  state,
  onToggle,
  onMode,
  onVolume,
  onMuted,
}: {
  state: AudioState
  onToggle: () => void
  onMode: (mode: AudioMode) => void
  onVolume: (volume: number) => void
  onMuted: (muted: boolean) => void
}) {
  return (
    <div className="control-cluster" data-testid="audio-controls">
      <button
        type="button"
        className="control control--audio"
        data-playing={state.playing ? 'true' : 'false'}
        data-testid="audio-toggle"
        aria-pressed={state.playing}
        onClick={onToggle}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          {state.playing ? (
            <>
              <path d="M4 14c2 0 2-3 4-3s2 3 4 3 2-3 4-3 2 3 4 3" />
              <path d="M4 19c2 0 2-3 4-3s2 3 4 3 2-3 4-3 2 3 4 3" />
              <path d="M4 9c2 0 2-3 4-3s2 3 4 3 2-3 4-3 2 3 4 3" />
            </>
          ) : (
            <>
              <path d="M4 15c2 0 2-3 4-3s2 3 4 3 2-3 4-3 2 3 4 3" />
              <path d="M12 4v4" />
              <path d="M9.5 6 12 3.5 14.5 6" />
            </>
          )}
        </svg>
        {state.playing ? 'Sound on' : 'Hear it'}
      </button>

      <div className="segmented" role="group" aria-label="Sonification mapping">
        {(['literal', 'tuned'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            className="segmented__option"
            aria-pressed={state.mode === mode}
            data-testid={`audio-mode-${mode}`}
            onClick={() => onMode(mode)}
          >
            {mode === 'literal' ? 'Literal' : 'Tuned'}
          </button>
        ))}
      </div>

      <div className="volume">
        <button
          type="button"
          className="control control--icon"
          style={{ minWidth: 32, width: 32, minHeight: 32, border: 'none', background: 'none' }}
          aria-pressed={state.muted}
          aria-label={state.muted ? 'Unmute' : 'Mute'}
          data-testid="audio-mute"
          onClick={() => onMuted(!state.muted)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 9v6h4l5 4V5L8 9H4z" />
            {state.muted ? <path d="M17 9l4 6M21 9l-4 6" /> : <path d="M17 8.5a5 5 0 0 1 0 7" />}
          </svg>
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={state.volume}
          aria-label="Volume"
          data-testid="audio-volume"
          onChange={(event) => onVolume(Number(event.target.value))}
        />
      </div>
    </div>
  )
}
