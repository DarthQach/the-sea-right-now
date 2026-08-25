import { useCallback, useState } from 'react'
import { loadPrefs, savePrefs, type Prefs } from '../../lib/storage'

/**
 * Preferences, read on the first render and written on every change.
 *
 * Read synchronously rather than in an effect: anything initialised from a
 * preference — the audio volume most of all — would otherwise be built from the
 * defaults and never corrected. `loadPrefs` is fully guarded, so a private
 * window or disabled site data returns defaults instead of throwing.
 *
 * Nothing here ever leaves the browser.
 */
export function usePrefs(): [Prefs, (patch: Partial<Prefs>) => void] {
  const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs())

  const update = useCallback((patch: Partial<Prefs>) => {
    setPrefs((current) => {
      const next = { ...current, ...patch }
      savePrefs(next)
      return next
    })
  }, [])

  return [prefs, update]
}
