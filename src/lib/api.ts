/**
 * Talking to the Worker. The page never talks to NDBC directly — NDBC sends no
 * CORS headers, so the request would be blocked before the page saw a response.
 */
import type { Reading, StaleReadingResponse, StationIndex } from './shared/types'

export type ReadingResult =
  | { kind: 'reading'; reading: Reading }
  /** The station is in the index but publishes no current observations. */
  | { kind: 'not_reporting'; stationId: string }
  /** No station with that ID exists. */
  | { kind: 'unknown_station'; stationId: string }
  /** NDBC is unreachable. `reading` is the last one that reached us, if any. */
  | { kind: 'upstream_unavailable'; reading: Reading | null; staleForSeconds: number | null }

export class SimulatedOutageError extends Error {
  constructor() {
    super('Upstream fetch was made to fail on purpose, to reach the data-problem banner.')
    this.name = 'SimulatedOutageError'
  }
}

export async function fetchStationIndex(signal?: AbortSignal): Promise<StationIndex> {
  const response = await fetch('/api/stations', { signal })
  if (!response.ok) throw new Error(`The station index request failed with ${response.status}.`)
  return (await response.json()) as StationIndex
}

/**
 * `simulateOutage` makes this throw before any request is made. It induces a
 * real failure of the real code path — it does not substitute fake data, and
 * there is no mock reading anywhere in this project.
 */
export async function fetchReading(
  stationId: string,
  options: { signal?: AbortSignal; simulateOutage?: boolean } = {},
): Promise<ReadingResult> {
  if (options.simulateOutage === true) throw new SimulatedOutageError()

  const response = await fetch(`/api/station/${encodeURIComponent(stationId)}`, { signal: options.signal })

  if (response.ok) {
    return { kind: 'reading', reading: (await response.json()) as Reading }
  }

  if (response.status === 404) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null
    if (body?.error === 'not_reporting') return { kind: 'not_reporting', stationId }
    return { kind: 'unknown_station', stationId }
  }

  if (response.status === 503) {
    const body = (await response.json().catch(() => null)) as Partial<StaleReadingResponse> | null
    return {
      kind: 'upstream_unavailable',
      reading: body?.reading ?? null,
      staleForSeconds: body?.staleForSeconds ?? null,
    }
  }

  throw new Error(`The reading request failed with ${response.status}.`)
}
