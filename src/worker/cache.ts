/**
 * Edge caching.
 *
 * Two jobs. The first is courtesy: NDBC asks that retrievals be kept minimal,
 * and a five-minute cache collapses a thousand simultaneous visitors on one buoy
 * into a single upstream request. The second is honesty under failure: a second,
 * much longer-lived entry keeps the last reading that did succeed, so when NDBC
 * goes down the page can keep rendering that water and say how old it is instead
 * of freezing or emptying.
 */
export const READING_TTL_SECONDS = 300
export const INDEX_TTL_SECONDS = 24 * 60 * 60
/** How long a reading stays available as the "last known" fallback. */
export const LAST_KNOWN_TTL_SECONDS = 7 * 24 * 60 * 60

/**
 * Cache keys live on a synthetic origin so they never collide with a real
 * request URL and are not reachable from outside.
 */
const KEY_ORIGIN = 'https://cache.the-sea-right-now.internal'

export function readingKey(id: string): Request {
  return new Request(`${KEY_ORIGIN}/reading/${id}`)
}

export function lastKnownKey(id: string): Request {
  return new Request(`${KEY_ORIGIN}/last-known/${id}`)
}

export function indexKey(): Request {
  return new Request(`${KEY_ORIGIN}/station-index`)
}

interface Cached<T> {
  value: T
  /** ISO 8601, when this entry was written. */
  storedAt: string
}

export async function readCached<T>(key: Request): Promise<Cached<T> | null> {
  const hit = await caches.default.match(key)
  if (hit === undefined) return null
  try {
    return (await hit.json()) as Cached<T>
  } catch {
    // A corrupt entry is not worth a failed request; treat it as a miss.
    return null
  }
}

export function writeCached<T>(
  key: Request,
  value: T,
  ttlSeconds: number,
  ctx: ExecutionContext,
  storedAt: string,
): void {
  const body: Cached<T> = { value, storedAt }
  const response = new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `public, max-age=${ttlSeconds}`,
    },
  })
  ctx.waitUntil(caches.default.put(key, response))
}
