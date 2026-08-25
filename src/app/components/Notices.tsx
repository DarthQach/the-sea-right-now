import type { Backend } from '../../scene/renderer'

/**
 * The quiet lines that explain a reduced experience without apologising for it.
 */
export function ReducedCapabilityNotice({
  backend,
  forced,
  onDismiss,
}: {
  backend: Backend
  forced: boolean
  onDismiss: () => void
}) {
  if (backend !== 'webgl') return null
  return (
    <div className="notice" role="status" data-testid="reduced-capability-notice">
      <span>
        {forced
          ? 'Showing the simplified ocean because this page was opened with the reduced renderer.'
          : 'This browser has no WebGPU, so the ocean is drawn a simpler way. It is the same reading, and everything else works the same.'}
      </span>
      <button type="button" className="notice__dismiss" onClick={onDismiss} data-testid="dismiss-notice">
        Dismiss
      </button>
    </div>
  )
}

/**
 * The throttle marker. Small and unalarming: rendering was reduced on purpose,
 * and saying so is the difference between a considerate product and a broken
 * one.
 */
export function ThrottleMarker({ reasons }: { reasons: string[] }) {
  if (reasons.length === 0) return null
  return (
    <span className="throttle-marker" role="status" data-testid="throttle-marker">
      <span className="throttle-marker__mark" aria-hidden="true" />
      {describe(reasons)}
    </span>
  )
}

function describe(reasons: string[]): string {
  if (reasons.includes('hidden')) return 'Rendering slowed — tab in the background'
  if (reasons.includes('battery')) return 'Rendering eased — on battery'
  return 'Rendering slowed'
}
