import { describe, expect, it } from 'vitest'
import { parseUrlState, shareableUrl, toSearchString } from '../../src/lib/url-state'

/**
 * The URL is the only thing this product shares, so `?station=` has to survive
 * a round trip exactly and unknown parameters must never be an error.
 */
describe('parseUrlState', () => {
  it('reads a station and normalises its case', () => {
    expect(parseUrlState('?station=46042').stationId).toBe('46042')
    expect(parseUrlState('?station=fpsn7').stationId).toBe('FPSN7')
  })

  it('reads the audio mode and ignores one it does not know', () => {
    expect(parseUrlState('?station=46042&mode=tuned').audioMode).toBe('tuned')
    expect(parseUrlState('?station=46042&mode=LITERAL').audioMode).toBe('literal')
    expect(parseUrlState('?station=46042&mode=symphonic').audioMode).toBeNull()
  })

  it('treats a bare flag, 1, true, yes and on as set', () => {
    for (const value of ['', '=1', '=true', '=yes', '=on', '=TRUE']) {
      expect(parseUrlState(`?forceWebGL${value}`).forceWebGL).toBe(true)
    }
    expect(parseUrlState('?forceWebGL=0').forceWebGL).toBe(false)
    expect(parseUrlState('').forceWebGL).toBe(false)
  })

  it('ignores parameters it has never heard of rather than failing', () => {
    const state = parseUrlState('?station=46042&utm_source=somewhere&fbclid=abc')
    expect(state.stationId).toBe('46042')
    expect(state.about).toBe(false)
  })

  it('treats an empty or whitespace station as none', () => {
    expect(parseUrlState('?station=').stationId).toBeNull()
    expect(parseUrlState('?station=%20%20').stationId).toBeNull()
    expect(parseUrlState('').stationId).toBeNull()
  })
})

describe('toSearchString', () => {
  it('writes only what is set, so the common case is one parameter', () => {
    expect(toSearchString({ stationId: '46042' })).toBe('?station=46042')
    expect(toSearchString({})).toBe('')
    expect(toSearchString({ stationId: null })).toBe('')
  })

  it('round-trips every parameter it writes', () => {
    const state = {
      stationId: '46042',
      audioMode: 'tuned' as const,
      forceWebGL: true,
      about: true,
      simulateOutage: true,
      forceThrottled: true,
    }
    expect(parseUrlState(toSearchString(state))).toMatchObject(state)
  })

  it('survives a round trip through the station alone', () => {
    const parsed = parseUrlState(toSearchString({ stationId: 'FPSN7' }))
    expect(parsed.stationId).toBe('FPSN7')
    expect(parsed.audioMode).toBeNull()
    expect(parsed.forceWebGL).toBe(false)
  })
})

describe('shareableUrl', () => {
  it('is short, and carries the station and nothing personal', () => {
    expect(shareableUrl('https://sea.vicaai.dev', '46042')).toBe('https://sea.vicaai.dev/?station=46042')
  })

  it('carries the mapping when there is one', () => {
    expect(shareableUrl('https://sea.vicaai.dev', '46042', 'tuned')).toBe(
      'https://sea.vicaai.dev/?station=46042&mode=tuned',
    )
  })

  // Camera position is deliberately not encoded: a link means "this water", not
  // "this exact view of it", and it keeps the URL short enough to read aloud.
  it('does not encode the camera', () => {
    expect(shareableUrl('https://sea.vicaai.dev', '46042')).not.toContain('camera')
  })
})
