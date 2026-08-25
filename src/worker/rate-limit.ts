/**
 * A token bucket, per IP, in memory.
 *
 * This is defence in depth and nothing more. It lives in one isolate, and
 * Cloudflare runs many isolates in many places, so the effective limit is some
 * multiple of the number below rather than the number itself. It exists to stop
 * a single client hammering one colo, not to enforce a global budget.
 *
 * The hard limit is a Cloudflare Rate Limiting Rule on `sea.vicaai.dev/api/*`,
 * configured in the dashboard. `README.md` says it must exist before the URL is
 * shared publicly.
 */
const REQUESTS_PER_MINUTE = 60
const WINDOW_MS = 60_000
/** Stop the map growing without bound in a long-lived isolate. */
const MAX_TRACKED_CLIENTS = 20_000

interface Bucket {
  tokens: number
  lastRefillMs: number
}

const buckets = new Map<string, Bucket>()

export function rateLimit(request: Request, nowMs: number = Date.now()): Response | null {
  const client = clientKey(request)
  if (client === null) return null

  let bucket = buckets.get(client)
  if (bucket === undefined) {
    if (buckets.size >= MAX_TRACKED_CLIENTS) evictStale(nowMs)
    bucket = { tokens: REQUESTS_PER_MINUTE, lastRefillMs: nowMs }
    buckets.set(client, bucket)
  }

  // Refill continuously rather than in steps, so a client is never made to wait
  // out a whole window for one token.
  const elapsed = Math.max(0, nowMs - bucket.lastRefillMs)
  bucket.tokens = Math.min(REQUESTS_PER_MINUTE, bucket.tokens + (elapsed / WINDOW_MS) * REQUESTS_PER_MINUTE)
  bucket.lastRefillMs = nowMs

  if (bucket.tokens < 1) {
    const secondsUntilOneToken = Math.ceil((1 - bucket.tokens) * (WINDOW_MS / REQUESTS_PER_MINUTE / 1000))
    const retryAfter = Math.max(1, secondsUntilOneToken)
    return new Response(
      JSON.stringify({
        error: 'rate_limited',
        message: `More than ${REQUESTS_PER_MINUTE} requests a minute. Try again shortly.`,
      }),
      {
        status: 429,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'retry-after': String(retryAfter),
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
        },
      },
    )
  }

  bucket.tokens -= 1
  return null
}

/**
 * The client's address, as Cloudflare reports it. It is used as a bucket key and
 * for nothing else: it is never logged, never stored beyond this counter, and
 * never forwarded upstream.
 */
function clientKey(request: Request): string | null {
  return request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for') ?? null
}

function evictStale(nowMs: number): void {
  for (const [key, bucket] of buckets) {
    if (nowMs - bucket.lastRefillMs > WINDOW_MS * 2) buckets.delete(key)
  }
  // Still full of active clients: drop the oldest half rather than refuse to
  // track anyone new.
  if (buckets.size >= MAX_TRACKED_CLIENTS) {
    const entries = [...buckets.entries()].sort((a, b) => a[1].lastRefillMs - b[1].lastRefillMs)
    for (const [key] of entries.slice(0, Math.floor(entries.length / 2))) buckets.delete(key)
  }
}

/** Test seam: the bucket map is module state and outlives a single test. */
export function resetRateLimiter(): void {
  buckets.clear()
}
