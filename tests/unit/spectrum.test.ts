import { describe, expect, it } from 'vitest'
import type { Reading } from '../../src/lib/shared/types'
import {
  deriveSpectrumParams,
  lerpAngleDeg,
  lerpSpectrumParams,
  significantHeightOf,
  spectrumCurve,
} from '../../src/lib/spectrum'

function reading(overrides: Partial<Reading>): Reading {
  return {
    stationId: '46042',
    observedAt: '2026-08-25T18:40:00.000Z',
    waveHeightM: null,
    dominantPeriodS: null,
    averagePeriodS: null,
    waveDirectionDeg: null,
    windSpeedMs: null,
    windGustMs: null,
    windDirectionDeg: null,
    waterTempC: null,
    airTempC: null,
    pressureHpa: null,
    swellHeightM: null,
    swellPeriodS: null,
    swellDirection: null,
    windWaveHeightM: null,
    windWavePeriodS: null,
    steepness: null,
    fieldSources: {},
    fieldObservedAt: {},
    fetchedAt: '2026-08-25T18:45:00.000Z',
    ...overrides,
  }
}

describe('spectrumCurve', () => {
  // The claim the whole product rests on: what is rendered agrees with what the
  // buoy reported. The spectrum is normalised so its zeroth moment gives back
  // the reported significant wave height.
  it.each([0.3, 1, 2.4, 4, 9])('reproduces a reported significant wave height of %s m', (height) => {
    const params = deriveSpectrumParams(reading({ waveHeightM: height, dominantPeriodS: 12, windSpeedMs: 8 }))
    const recovered = significantHeightOf(spectrumCurve(params, 512, 1.2))
    expect(recovered).toBeCloseTo(height, 1)
  })

  it('puts its peak energy at the reported dominant period', () => {
    const params = deriveSpectrumParams(reading({ waveHeightM: 2, dominantPeriodS: 14, windSpeedMs: 6 }))
    const curve = spectrumCurve(params, 512, 1.2)
    const peak = curve.reduce((best, point) => (point.energy > best.energy ? point : best), curve[0]!)
    expect(1 / peak.frequencyHz).toBeCloseTo(14, 0)
  })

  it('gives a 4 m sea far more energy than a 1 m sea at the same period', () => {
    const calm = spectrumCurve(deriveSpectrumParams(reading({ waveHeightM: 1, dominantPeriodS: 10 })))
    const rough = spectrumCurve(deriveSpectrumParams(reading({ waveHeightM: 4, dominantPeriodS: 10 })))
    const total = (c: typeof calm) => c.reduce((sum, p) => sum + p.energy, 0)
    expect(total(rough) / total(calm)).toBeCloseTo(16, 0)
  })
})

describe('deriveSpectrumParams', () => {
  it('uses the measured wave height and marks it as the reading marked it', () => {
    const params = deriveSpectrumParams(
      reading({ waveHeightM: 2.4, dominantPeriodS: 14, fieldSources: { waveHeightM: 'derived' } }),
    )
    expect(params.significantHeightM).toBe(2.4)
    expect(params.sources.significantHeight).toBe('derived')
  })

  it('estimates wave height from wind when the station reports no waves, and says so', () => {
    const params = deriveSpectrumParams(reading({ windSpeedMs: 12, windDirectionDeg: 300 }))
    expect(params.significantHeightM).toBeGreaterThan(2)
    expect(params.significantHeightM).toBeLessThan(4)
    expect(params.sources.significantHeight).toBe('derived')
    expect(params.directionDeg).toBe(300)
  })

  it('falls back from dominant period to average period', () => {
    const params = deriveSpectrumParams(reading({ waveHeightM: 1.5, averagePeriodS: 6.2 }))
    expect(params.peakPeriodS).toBe(6.2)
  })

  it('returns a calm sea, marked absent throughout, when nothing usable was reported', () => {
    const params = deriveSpectrumParams(reading({ waterTempC: 15 }))
    expect(params.significantHeightM).toBeGreaterThan(0)
    expect(params.sources.significantHeight).toBe('absent')
  })

  it('narrows the directional spread as the sea gets longer', () => {
    const windsea = deriveSpectrumParams(reading({ waveHeightM: 1, dominantPeriodS: 4 }))
    const groundswell = deriveSpectrumParams(reading({ waveHeightM: 1, dominantPeriodS: 16 }))
    expect(groundswell.swell.directionalSpread).toBeLessThan(windsea.windSea.directionalSpread)
  })
})

describe('lerpAngleDeg', () => {
  // A swell shifting from 355° to 5° must move 10 degrees, not 350.
  it('takes the short way round the compass', () => {
    expect(lerpAngleDeg(355, 5, 0.5)).toBeCloseTo(0, 5)
    expect(lerpAngleDeg(5, 355, 0.5)).toBeCloseTo(0, 5)
    expect(lerpAngleDeg(10, 100, 0.5)).toBeCloseTo(55, 5)
  })
})

describe('lerpSpectrumParams', () => {
  it('eases between two readings rather than snapping', () => {
    const from = deriveSpectrumParams(reading({ waveHeightM: 1, dominantPeriodS: 8, waveDirectionDeg: 350 }))
    const to = deriveSpectrumParams(reading({ waveHeightM: 3, dominantPeriodS: 14, waveDirectionDeg: 10 }))
    const half = lerpSpectrumParams(from, to, 0.5)
    expect(half.significantHeightM).toBeCloseTo(2, 5)
    expect(half.peakPeriodS).toBeCloseTo(11, 5)
    expect(half.directionDeg).toBeCloseTo(0, 5)
  })
})
