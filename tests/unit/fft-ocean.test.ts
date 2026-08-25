import { describe, expect, it } from 'vitest'
import type { Reading } from '../../src/lib/shared/types'
import {
  CASCADE_BOUNDARY_WAVELENGTHS_M,
  DEFAULT_CASCADES,
  GRAVITY,
  deriveSpectrumParams,
  directionalExponent,
  jonswapShape,
  spectrumEnergyScale,
  tmaAttenuation,
  travelDirectionRad,
  type SpectrumParams,
} from '../../src/lib/spectrum'
import { FFT_SIZE, buildButterflyTable, cascadeBounds, cascadeShortestWavelength } from '../../src/scene/ocean/fft-math'
import { buildWaveTrain, significantHeightOfTrain } from '../../src/scene/ocean/wave-train'

function paramsFor(waveHeightM: number, dominantPeriodS: number): SpectrumParams {
  const reading: Reading = {
    stationId: '46042',
    observedAt: '2026-08-25T18:40:00.000Z',
    waveHeightM,
    dominantPeriodS,
    averagePeriodS: null,
    waveDirectionDeg: 285,
    windSpeedMs: 8,
    windGustMs: null,
    windDirectionDeg: 300,
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
  }
  return deriveSpectrumParams(reading)
}

/**
 * Reproduces on the CPU exactly what the compute kernel sums on the GPU: for
 * every cell of every cascade's grid, the variance the spectrum assigns it.
 * Every point contributes twice — once from h0(k) and once from h0(-k) — so the
 * total is the variance of the rendered surface.
 */
function renderedVariance(params: SpectrumParams): number {
  const bounds = cascadeBounds(CASCADE_BOUNDARY_WAVELENGTHS_M)
  // Both wave systems, exactly as the kernel sums them.
  const systems = [params.swell, params.windSea].map((component) => {
    const heading = travelDirectionRad(component.directionDeg)
    return {
      component,
      scale: spectrumEnergyScale(component, params.depthM),
      exponent: directionalExponent(component.directionalSpread),
      direction: { x: Math.sin(heading), z: Math.cos(heading) },
    }
  })

  let total = 0

  for (let cascade = 0; cascade < DEFAULT_CASCADES.length; cascade += 1) {
    const patch = DEFAULT_CASCADES[cascade]?.lengthM ?? 1
    const band = bounds[cascade]
    if (band === undefined) continue
    const deltaK = (2 * Math.PI) / patch

    for (let y = 0; y < FFT_SIZE; y += 1) {
      for (let x = 0; x < FFT_SIZE; x += 1) {
        const kx = (x - FFT_SIZE / 2) * deltaK
        const kz = (y - FFT_SIZE / 2) * deltaK
        const k = Math.hypot(kx, kz)
        if (k < 1e-5 || k < band.low || k >= band.high) continue

        const omega = Math.sqrt(GRAVITY * k)
        const attenuation = tmaAttenuation(omega, params.depthM)
        const jacobian = GRAVITY / (omega * 2) / k

        for (const system of systems) {
          if (system.component.significantHeightM <= 0) continue
          const jonswap = jonswapShape(omega, system.component.peakPeriodS, system.component.peakEnhancement)
          const cosine = Math.min(
            1,
            Math.max(-1, (kx / k) * system.direction.x + (kz / k) * system.direction.z),
          )
          const spread = Math.pow(Math.sqrt(Math.max(0, cosine * 0.5 + 0.5)), system.exponent * 2)
          const energy = jonswap * attenuation * spread * jacobian * deltaK * deltaK * system.scale
          // h0(k) and h0(-k), each contributing its own variance.
          total += energy * 2
        }
      }
    }
  }

  return total
}

describe('the FFT ocean spectrum', () => {
  // The claim the whole product rests on, for the high-fidelity path: the water
  // on screen is as tall as the buoy said it was.
  it.each([
    [0.4, 6],
    [1.2, 8],
    [2.4, 14],
    [4.5, 12],
    [8, 16],
  ])('renders a %s m, %s s sea at the reported significant wave height', (height, period) => {
    const params = paramsFor(height, period)
    const rendered = 4 * Math.sqrt(renderedVariance(params))
    // Within 10%. The grid cannot carry waves longer than the largest patch or
    // shorter than the finest Nyquist, so a little energy is always outside it.
    expect(rendered).toBeGreaterThan(height * 0.9)
    expect(rendered).toBeLessThan(height * 1.1)
  })

  it('carries a 14-second swell inside the coarsest cascade rather than losing it', () => {
    // A 14 s wave is about 306 m long. If the coarsest patch were smaller than
    // that, the swell would fall below the grid's fundamental and vanish.
    const peakWavelength = (GRAVITY * 14 * 14) / (2 * Math.PI)
    expect(peakWavelength).toBeGreaterThan(300)
    expect(DEFAULT_CASCADES[0]?.lengthM ?? 0).toBeGreaterThan(peakWavelength)
  })

  it('splits the three cascades into bands that meet without a gap or an overlap', () => {
    const bounds = cascadeBounds(CASCADE_BOUNDARY_WAVELENGTHS_M)
    expect(bounds[0]?.low).toBe(0)
    expect(bounds[0]?.high).toBeCloseTo(bounds[1]?.low ?? -1, 10)
    expect(bounds[1]?.high).toBeCloseTo(bounds[2]?.low ?? -1, 10)
    expect(bounds[2]?.high).toBe(Number.POSITIVE_INFINITY)

    // And every band sits inside what its own grid can represent.
    DEFAULT_CASCADES.forEach((cascade, i) => {
      const band = bounds[i]
      if (band === undefined) return
      const fundamental = (2 * Math.PI) / cascade.lengthM
      const nyquist = (Math.PI * FFT_SIZE) / cascade.lengthM
      if (band.low > 0) expect(band.low).toBeGreaterThanOrEqual(fundamental)
      if (Number.isFinite(band.high)) expect(band.high).toBeLessThanOrEqual(nyquist)
      expect(cascadeShortestWavelength(CASCADE_BOUNDARY_WAVELENGTHS_M, i, cascade.lengthM)).toBeGreaterThan(0)
    })
  })
})

describe('the butterfly table', () => {
  it('reads bit-reversed pairs on the first step', () => {
    const table = buildButterflyTable(8)
    // Bit reversal of 8 elements is 0 4 2 6 1 5 3 7, and each pair of wings
    // reads the same two elements.
    const reads = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => [table[i * 4 + 2], table[i * 4 + 3]])
    expect(reads).toEqual([
      [0, 4], [0, 4], [2, 6], [2, 6], [1, 5], [1, 5], [3, 7], [3, 7],
    ])
  })

  // The bug this test exists to prevent: the lower wing of a butterfly needs
  // `a - w*b`, and the index arithmetic already lands its twiddle half a turn
  // further round to produce the minus sign. Conjugating it as well — flipping
  // only the imaginary part — silently produces a different transform.
  it('negates the lower wing rather than conjugating it', () => {
    const table = buildButterflyTable(8)
    const upper = [table[0], table[1]] as [number, number]
    const lower = [table[4], table[5]] as [number, number]
    expect(lower[0]).toBeCloseTo(-upper[0], 10)
    expect(lower[1]).toBeCloseTo(-upper[1], 10)

    const step1Upper = [table[(8 + 1) * 4], table[(8 + 1) * 4 + 1]] as [number, number]
    const step1Lower = [table[(8 + 3) * 4], table[(8 + 3) * 4 + 1]] as [number, number]
    expect(step1Lower[0]).toBeCloseTo(-step1Upper[0], 10)
    expect(step1Lower[1]).toBeCloseTo(-step1Upper[1], 10)
  })
})

describe('the Gerstner wave train', () => {
  // The fallback ocean has to reproduce the same reading as the FFT path —
  // coarser, never different.
  it.each([0.4, 1.2, 2.4, 4.5, 8])('sums to a reported significant wave height of %s m', (height) => {
    const train = buildWaveTrain(paramsFor(height, 11))
    expect(significantHeightOfTrain(train)).toBeCloseTo(height, 5)
  })

  it('is deterministic, so the same link shows two people the same sea', () => {
    const a = buildWaveTrain(paramsFor(2, 12))
    const b = buildWaveTrain(paramsFor(2, 12))
    expect(Array.from(a.primary)).toEqual(Array.from(b.primary))
    expect(Array.from(a.secondary)).toEqual(Array.from(b.secondary))
  })
})
