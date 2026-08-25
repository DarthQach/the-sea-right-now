import { useCallback, useEffect, useState } from 'react'
import { parseUrlState, toSearchString, type UrlState } from '../../lib/url-state'

/**
 * The URL is the application's routing state. Every route is reachable by direct
 * URL, which is what lets a journey be entered at any point rather than clicked
 * into from the start — and what makes a shared link land on the same water.
 */
export function useUrlState(): [UrlState, (next: Partial<UrlState>, replace?: boolean) => void] {
  const [state, setState] = useState<UrlState>(() => parseUrlState(globalThis.location?.search ?? ''))

  useEffect(() => {
    const onPopState = () => setState(parseUrlState(globalThis.location.search))
    globalThis.addEventListener('popstate', onPopState)
    return () => globalThis.removeEventListener('popstate', onPopState)
  }, [])

  const navigate = useCallback((next: Partial<UrlState>, replace = false) => {
    setState((current) => {
      const merged = { ...current, ...next }
      const url = `${globalThis.location.pathname}${toSearchString(merged)}`
      if (replace) globalThis.history.replaceState(null, '', url)
      else globalThis.history.pushState(null, '', url)
      return merged
    })
  }, [])

  return [state, navigate]
}
