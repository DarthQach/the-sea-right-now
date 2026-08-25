/**
 * Turns a spectrum into a finite set of travelling waves.
 *
 * This is what the Gerstner ocean sums. Each wave takes its amplitude from the
 * spectrum band it stands for, so the sum reproduces the same significant wave
 * height the buoy reported — the same guarantee the FFT path gives, reached by
 * summing a few dozen waves instead of inverting a Fourier transform.
 */
import type { SpectrumComponent, SpectrumParams } from '../../lib/spectrum'
import { GRAVITY, jonswapShape, tmaAttenuation, travelDirectionRad } from '../../lib/spectrum'

/** Frequency bands per wave system. More bands means a less repetitive surface. */
export const FREQUENCY_BANDS = 12
/** Directions per band, spread around that system's own direction. */
export const DIRECTIONS_PER_BAND = 2
/** Swell and wind sea are summed separately, each with its own direction. */
export const COMPONENT_COUNT = 2
export const WAVES_PER_COMPONENT = FREQUENCY_BANDS * DIRECTIONS_PER_BAND
export const WAVE_COUNT = WAVES_PER_COMPONENT * COMPONENT_COUNT

const MIN_FREQUENCY_HZ = 0.03
const MAX_FREQUENCY_HZ = 0.6

export interface WaveTrain {
  /** `WAVE_COUNT` × 4: kx, kz, amplitude, angular frequency. */
  primary: Float32Array
  /** `WAVE_COUNT` × 4: phase, steepness, wavelength, 0. */
  secondary: Float32Array
}

/**
 * Deterministic per-wave scatter. A seeded hash rather than `Math.random` so the
 * same reading always produces the same sea — two people opening the same link
 * see the same water, and a reload does not reshuffle it.
 */
function hash(index: number, salt: number): number {
  const x = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453123
  return x - Math.floor(x)
}

/**
 * The Horvath/Hasselmann directional spread, `cos^{2s}(θ/2)`, with `s` derived
 * from the tuned spread parameter. Not normalised here — the amplitudes are
 * rescaled at the end so the total reproduces the reported wave height exactly.
 */
function directionalWeight(offsetRad: number, spreadRad: number): number {
  const s = Math.max(0.5, 1 / Math.max(0.05, spreadRad * spreadRad) - 1)
  const c = Math.cos(offsetRad / 2)
  if (c <= 0) return 0
  return Math.pow(c, 2 * s)
}

export function buildWaveTrain(params: SpectrumParams): WaveTrain {
  const primary = new Float32Array(WAVE_COUNT * 4)
  const secondary = new Float32Array(WAVE_COUNT * 4)

  const components: SpectrumComponent[] = [params.swell, params.windSea]
  components.forEach((component, index) => {
    writeComponent(primary, secondary, component, params.depthM, index * WAVES_PER_COMPONENT)
  })

  return { primary, secondary }
}

/**
 * One wave system's share of the train. Each system is normalised to its own
 * significant wave height, so the two together reproduce the reported total.
 */
function writeComponent(
  primary: Float32Array,
  secondary: Float32Array,
  component: SpectrumComponent,
  depthM: number,
  offset: number,
): void {
  const mainDirection = travelDirectionRad(component.directionDeg)
  const ratio = Math.pow(MAX_FREQUENCY_HZ / MIN_FREQUENCY_HZ, 1 / (FREQUENCY_BANDS - 1))

  const variances = new Float32Array(WAVES_PER_COMPONENT)
  let varianceSum = 0

  for (let band = 0; band < FREQUENCY_BANDS; band += 1) {
    const frequencyHz = MIN_FREQUENCY_HZ * Math.pow(ratio, band)
    const bandwidthHz = MIN_FREQUENCY_HZ * Math.pow(ratio, band + 1) - frequencyHz
    const omega = 2 * Math.PI * frequencyHz
    const density =
      jonswapShape(omega, component.peakPeriodS, component.peakEnhancement) *
      tmaAttenuation(omega, depthM) *
      2 *
      Math.PI

    for (let d = 0; d < DIRECTIONS_PER_BAND; d += 1) {
      const local = band * DIRECTIONS_PER_BAND + d
      const weight = directionalWeight(directionOffset(offset + local, d), component.directionalSpread)
      const variance = Math.max(0, density * bandwidthHz * weight)
      variances[local] = variance
      varianceSum += variance
    }
  }

  const targetVariance = Math.pow(component.significantHeightM / 4, 2)
  const scale = varianceSum > 0 ? targetVariance / varianceSum : 0

  for (let band = 0; band < FREQUENCY_BANDS; band += 1) {
    const frequencyHz = MIN_FREQUENCY_HZ * Math.pow(ratio, band)
    const omega = 2 * Math.PI * frequencyHz
    // Deep-water dispersion. Every NDBC buoy this project renders sits in water
    // deep enough for it; see DEFAULT_DEPTH_M.
    const k = (omega * omega) / GRAVITY
    const wavelength = (2 * Math.PI) / k

    for (let d = 0; d < DIRECTIONS_PER_BAND; d += 1) {
      const local = band * DIRECTIONS_PER_BAND + d
      const index = offset + local
      const direction = mainDirection + directionOffset(index, d)

      // a = sqrt(2 * variance): the amplitude of a sinusoid carrying that variance.
      const amplitude = Math.sqrt(2 * (variances[local] ?? 0) * scale)

      // Gerstner steepness, capped well below the looping limit (Q*k*a = 1) so
      // the surface never self-intersects.
      const steepness = Math.min(0.85, 0.5 / Math.max(0.02, k * amplitude * WAVE_COUNT * 0.06))

      primary[index * 4 + 0] = Math.sin(direction) * k
      primary[index * 4 + 1] = Math.cos(direction) * k
      primary[index * 4 + 2] = amplitude
      primary[index * 4 + 3] = omega

      secondary[index * 4 + 0] = hash(index, 2) * Math.PI * 2
      secondary[index * 4 + 1] = steepness
      secondary[index * 4 + 2] = wavelength
      secondary[index * 4 + 3] = 0
    }
  }
}

/** Stratified across the spread, with a deterministic jitter so bands do not fan. */
function directionOffset(index: number, d: number): number {
  const stratum = (d + 0.5) / DIRECTIONS_PER_BAND
  const jitter = (hash(index, 1) - 0.5) / DIRECTIONS_PER_BAND
  return (stratum + jitter - 0.5) * Math.PI
}

/** The significant wave height a train actually carries. Used to prove the normalisation. */
export function significantHeightOfTrain(train: WaveTrain): number {
  let variance = 0
  for (let i = 0; i < WAVE_COUNT; i += 1) {
    const amplitude = train.primary[i * 4 + 2] ?? 0
    variance += (amplitude * amplitude) / 2
  }
  return 4 * Math.sqrt(variance)
}
