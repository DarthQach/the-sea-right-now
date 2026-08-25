import { useCallback, useEffect, useRef, useState } from 'react'
import type { Reading } from '../../lib/shared/types'
import { fetchReading, type ReadingResult } from '../../lib/api'

/**
 * One station's reading, kept current.
 *
 * NDBC publishes roughly hourly, with most data landing around 25 minutes past,
 * so this polls every five minutes — matching the Worker's edge cache, which
 * means most of these requests never leave Cloudflare. Nothing polls stations
 * the visitor is not looking at.
 */
export const REFRESH_INTERVAL_MS = 5 * 60 * 1000

export type ReadingStatus = 'cold' | 'ready' | 'not_reporting' | 'unknown_station' | 'unavailable'

export interface ReadingState {
  status: ReadingStatus
  /** The last reading that arrived. Survives an upstream failure on purpose. */
  reading: Reading | null
  /** Seconds since the Worker last managed to reach NDBC, when it cannot now. */
  staleForSeconds: number | null
  /** True while a retry is in flight after a failure. */
  retrying: boolean
  retry: () => void
}

export function useReading(stationId: string | null, simulateOutage: boolean): ReadingState {
  const [status, setStatus] = useState<ReadingStatus>('cold')
  const [reading, setReading] = useState<Reading | null>(null)
  const [staleForSeconds, setStaleForSeconds] = useState<number | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const lastReading = useRef<Reading | null>(null)

  /**
   * `?simulateOutage=1` exists so the data-problem banner can be reached on
   * demand rather than by waiting for NOAA to have a bad day.
   *
   * It arms a single real failure: the station loads normally, then the next
   * fetch throws before any request is made, and the retry succeeds. That is the
   * whole arc — populated, unreachable, recovered — walked with real data at
   * both ends. It never substitutes a fabricated reading; there is no mock
   * reading anywhere in this project.
   */
  const outageArmed = useRef(simulateOutage)

  const retry = useCallback(() => {
    outageArmed.current = false
    setRetrying(true)
    setAttempt((n) => n + 1)
  }, [])

  useEffect(() => {
    if (stationId === null) {
      setStatus('cold')
      setReading(null)
      lastReading.current = null
      return
    }

    // A new station starts cold. Keeping the previous station's numbers on
    // screen under a new station's name would be a lie.
    setStatus('cold')
    setReading(null)
    lastReading.current = null
  }, [stationId])

  useEffect(() => {
    if (stationId === null) return

    const controller = new AbortController()
    let cancelled = false

    const load = async () => {
      try {
        const failNow = outageArmed.current && lastReading.current !== null
        if (failNow) outageArmed.current = false
        const result: ReadingResult = await fetchReading(stationId, {
          signal: controller.signal,
          simulateOutage: failNow,
        })
        if (cancelled) return
        setRetrying(false)

        switch (result.kind) {
          case 'reading':
            lastReading.current = result.reading
            setReading(result.reading)
            setStaleForSeconds(null)
            setStatus('ready')
            break
          case 'not_reporting':
            setStatus('not_reporting')
            break
          case 'unknown_station':
            setStatus('unknown_station')
            break
          case 'upstream_unavailable':
            // Keep whatever we already had. The water goes on moving from the
            // last real reading rather than freezing or emptying.
            if (result.reading !== null) {
              lastReading.current = result.reading
              setReading(result.reading)
            }
            setStaleForSeconds(result.staleForSeconds)
            setStatus('unavailable')
            break
        }
      } catch (error) {
        if (cancelled || controller.signal.aborted) return
        setRetrying(false)
        setStaleForSeconds(null)
        setStatus('unavailable')
        if (!(error instanceof Error && error.name === 'SimulatedOutageError')) {
          console.warn('The reading request failed.', error)
        }
      }
    }

    void load().then(() => {
      // Walk straight into the induced failure rather than waiting five minutes
      // for the next refresh.
      if (!cancelled && outageArmed.current && lastReading.current !== null) void load()
    })
    const timer = setInterval(() => void load(), REFRESH_INTERVAL_MS)

    return () => {
      cancelled = true
      controller.abort()
      clearInterval(timer)
    }
  }, [stationId, attempt])

  return { status, reading, staleForSeconds, retrying, retry }
}
