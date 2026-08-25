import type { Env } from './index'
import type { Reading, StaleReadingResponse } from '../lib/shared/types'
import { json, methodNotAllowed, notFound } from './http'
import { isValidStationId } from './validate'
import { findStation, getStationIndex } from './station-index'
import { fetchStationFiles } from './ndbc/client'
import { buildReading } from './ndbc/parse'
import {
  LAST_KNOWN_TTL_SECONDS,
  READING_TTL_SECONDS,
  lastKnownKey,
  readCached,
  readingKey,
  writeCached,
} from './cache'

/**
 * Everything under /api. Two public reads of public measurements — there is no
 * write endpoint, no authentication and no private data, by design.
 */
export async function handleApiRequest(
  request: Request,
  url: URL,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return methodNotAllowed()

  if (url.pathname === '/api/health') {
    return json({ ok: true, service: 'the-sea-right-now' }, { headers: { 'cache-control': 'no-store' } })
  }

  if (url.pathname === '/api/stations') return handleStations(env, ctx)

  const stationMatch = /^\/api\/station\/([^/]+)$/.exec(url.pathname)
  if (stationMatch) return handleStation(decodeURIComponent(stationMatch[1] ?? ''), env, ctx)

  return notFound('No such endpoint.')
}

async function handleStations(env: Env, ctx: ExecutionContext): Promise<Response> {
  const index = await getStationIndex(env, ctx)
  return json(index, {
    headers: { 'cache-control': `public, max-age=${READING_TTL_SECONDS}, s-maxage=86400` },
  })
}

async function handleStation(rawId: string, env: Env, ctx: ExecutionContext): Promise<Response> {
  // Validate the shape before anything else, then check membership in the index.
  // The upstream URL is built from the result, never from `rawId`.
  if (!isValidStationId(rawId)) {
    return notFound('That is not a station ID.')
  }

  const index = await getStationIndex(env, ctx)
  const station = findStation(index, rawId)
  if (station === undefined) {
    return notFound('No station with that ID is in the NDBC index.')
  }

  const id = station.id
  const cached = await readCached<Reading>(readingKey(id))
  if (cached !== null) {
    return json(cached.value, { headers: readingHeaders(cached.storedAt) })
  }

  try {
    const files = await fetchStationFiles(id, env.NDBC_USER_AGENT)
    const fetchedAt = new Date().toISOString()
    const reading = buildReading(id, files.txt, files.spec, fetchedAt)

    if (reading === null) {
      // The station is in the index but publishes no current observations. Not
      // an error in the system — an honest fact about that buoy, and the page
      // answers it by offering the nearest station that is reporting.
      return json(
        {
          error: 'not_reporting',
          stationId: id,
          message: 'That station is in the NDBC index but is not publishing current observations.',
        },
        { status: 404, headers: { 'cache-control': `public, max-age=${READING_TTL_SECONDS}` } },
      )
    }

    writeCached(readingKey(id), reading, READING_TTL_SECONDS, ctx, fetchedAt)
    writeCached(lastKnownKey(id), reading, LAST_KNOWN_TTL_SECONDS, ctx, fetchedAt)
    return json(reading, { headers: readingHeaders(fetchedAt) })
  } catch {
    // NDBC is unreachable. Hand back the last reading that did succeed, with its
    // age, so the water keeps moving from real numbers instead of freezing.
    const lastKnown = await readCached<Reading>(lastKnownKey(id))
    if (lastKnown === null) {
      return json(
        {
          error: 'upstream_unavailable',
          stationId: id,
          message: 'NDBC is unreachable and there is no earlier reading for this station.',
        },
        { status: 503, headers: { 'cache-control': 'no-store', 'retry-after': '60' } },
      )
    }

    const staleForSeconds = Math.max(0, Math.round((Date.now() - Date.parse(lastKnown.storedAt)) / 1000))
    const body: StaleReadingResponse = {
      error: 'upstream_unavailable',
      message: 'NDBC is unreachable. This is the last reading that reached us.',
      reading: lastKnown.value,
      staleForSeconds,
    }
    return json(body, { status: 503, headers: { 'cache-control': 'no-store', 'retry-after': '60' } })
  }
}

function readingHeaders(fetchedAt: string): Record<string, string> {
  return {
    'cache-control': `public, max-age=${READING_TTL_SECONDS}`,
    'x-reading-fetched-at': fetchedAt,
  }
}
