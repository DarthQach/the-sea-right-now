import { beforeEach, describe, expect, it } from 'vitest'
import { rateLimit, resetRateLimiter } from '../../src/worker/rate-limit'

function requestFrom(ip: string): Request {
  return new Request('https://sea.vicaai.dev/api/station/46042', { headers: { 'cf-connecting-ip': ip } })
}

beforeEach(() => {
  resetRateLimiter()
})

describe('rateLimit', () => {
  it('lets sixty requests a minute through and refuses the sixty-first', () => {
    const start = 1_000_000
    for (let i = 0; i < 60; i += 1) {
      expect(rateLimit(requestFrom('203.0.113.7'), start)).toBeNull()
    }
    const refused = rateLimit(requestFrom('203.0.113.7'), start)
    expect(refused?.status).toBe(429)
    expect(refused?.headers.get('retry-after')).toBeTruthy()
    expect(Number(refused?.headers.get('retry-after'))).toBeGreaterThan(0)
  })

  it('counts each client separately', () => {
    const start = 1_000_000
    for (let i = 0; i < 60; i += 1) rateLimit(requestFrom('203.0.113.7'), start)
    expect(rateLimit(requestFrom('203.0.113.7'), start)?.status).toBe(429)
    expect(rateLimit(requestFrom('198.51.100.4'), start)).toBeNull()
  })

  it('refills continuously, so one second buys one more request', () => {
    const start = 1_000_000
    for (let i = 0; i < 60; i += 1) rateLimit(requestFrom('203.0.113.7'), start)
    expect(rateLimit(requestFrom('203.0.113.7'), start)?.status).toBe(429)
    expect(rateLimit(requestFrom('203.0.113.7'), start + 1000)).toBeNull()
    expect(rateLimit(requestFrom('203.0.113.7'), start + 1000)?.status).toBe(429)
  })

  it('lets a request with no client address through rather than refusing everyone', () => {
    const anonymous = new Request('https://sea.vicaai.dev/api/stations')
    for (let i = 0; i < 200; i += 1) expect(rateLimit(anonymous, 1_000_000)).toBeNull()
  })
})
