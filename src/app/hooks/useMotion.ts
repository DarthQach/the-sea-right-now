import { useEffect, useState } from 'react'
import type { MotionOverride } from '../../lib/storage'

/**
 * Whether the sea should run calm.
 *
 * `auto` follows the browser's own `prefers-reduced-motion`, which is a setting
 * the visitor made once at the operating-system level and should not have to
 * make again here. The manual override in the settings panel wins over it,
 * because someone who arrived by that route asked for it deliberately.
 */
export function useReducedMotion(override: MotionOverride): { reduced: boolean; systemPrefers: boolean } {
  const [systemPrefers, setSystemPrefers] = useState(() => matchesReducedMotion())

  useEffect(() => {
    const query = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (query === undefined) return
    const onChange = () => setSystemPrefers(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const reduced = override === 'auto' ? systemPrefers : override === 'reduced'
  return { reduced, systemPrefers }
}

function matchesReducedMotion(): boolean {
  try {
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  } catch {
    return false
  }
}

/**
 * The calmer sea. Not a different sea — the same reported one, with its
 * amplitude scaled down so the frame is not in constant large motion.
 */
export const REDUCED_MOTION_SCALE = 0.35
