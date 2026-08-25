import { env, exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

/**
 * The Worker's two routes, run inside the real workerd runtime.
 *
 * This is the only place the anti-SSRF control and the rate limiter are
 * exercised end to end — through the real handler, the real cache and the real
 * fetch — rather than as functions. Everything here talks to live NDBC, because
 * there is no mock upstream anywhere in this project.
 */
interface WorkerEntrypoint {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response>
}

// `cloudflare:workers` types the exports map loosely; this is the default export
// of src/worker/index.ts, running inside workerd.
const worker = (exports as unknown as { default: WorkerEntrypoint }).default

function request(path: string, ip = '203.0.113.1'): Request {
  return new Request(`https://sea.vicaai.dev${path}`, { headers: { 'cf-connecting-ip': ip } })
}

const ctx = { waitUntil: () => {}, passThroughOnException: () => {} }

async function fetchApi(path: string, ip?: string): Promise<Response> {
  return worker.fetch(request(path, ip), env, ctx)
}

describe('GET /api/station/:id', () => {
  it('answers a real station with a reading that carries its provenance', async () => {
    const response = await fetchApi('/api/station/46042', '203.0.113.10')
    expect(response.status).toBe(200)
    const reading = (await response.json()) as Record<string, unknown>
    expect(reading.stationId).toBe('46042')
    expect(typeof reading.observedAt).toBe('string')
    expect(reading.fieldSources).toBeTypeOf('object')
  }, 30_000)

  it('refuses an ID that is not in the index, without ever reaching upstream', async () => {
    const response = await fetchApi('/api/station/ZZZZZ', '203.0.113.11')
    expect(response.status).toBe(404)
    expect(((await response.json()) as { error: string }).error).toBe('not_found')
  }, 30_000)

  // The anti-SSRF control. An ID that fails the shape check must never be used
  // to build an upstream URL.
  it.each(['../../etc/passwd', 'a', 'toolongforanid', '4604 2', '46042/../..', 'http://x'])(
    'rejects %j on shape alone',
    async (id) => {
      const response = await fetchApi(`/api/station/${encodeURIComponent(id)}`, '203.0.113.12')
      expect(response.status).toBe(404)
    },
    30_000,
  )

  it('only answers GET', async () => {
    const response = await worker.fetch(
      new Request('https://sea.vicaai.dev/api/station/46042', { method: 'POST' }),
      env,
      ctx,
    )
    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toContain('GET')
  })
})

describe('GET /api/stations', () => {
  it('returns the filtered, sorted index', async () => {
    const response = await fetchApi('/api/stations', '203.0.113.13')
    expect(response.status).toBe(200)
    const index = (await response.json()) as { stations: { id: string; dart: boolean }[]; source: string }
    expect(index.stations.length).toBeGreaterThan(1000)
    expect(index.stations.every((station) => !station.dart)).toBe(true)
    const ids = index.stations.map((station) => station.id)
    expect([...ids].sort()).toEqual(ids)
  }, 30_000)
})

describe('rate limiting', () => {
  it('answers 429 with a Retry-After once one client goes past the limit', async () => {
    const ip = '203.0.113.99'
    let limited: Response | null = null
    for (let i = 0; i < 80; i += 1) {
      const response = await fetchApi('/api/health', ip)
      if (response.status === 429) {
        limited = response
        break
      }
    }
    expect(limited).not.toBeNull()
    expect(limited?.headers.get('retry-after')).toBeTruthy()
  })
})

describe('the rest of the Worker', () => {
  it('has no endpoint other than the two it documents', async () => {
    const response = await fetchApi('/api/everything', '203.0.113.14')
    expect(response.status).toBe(404)
  })

  it('sends security headers on every API response', async () => {
    const response = await fetchApi('/api/health', '203.0.113.15')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(response.headers.get('strict-transport-security')).toContain('max-age=')
  })
})
