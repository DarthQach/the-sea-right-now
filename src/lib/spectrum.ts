/**
 * From an NDBC reading to a wave spectrum.
 *
 * A spectrum says how much wave energy exists at each size and direction. It is
 * the single description that drives both the water and the sound, which is why
 * they agree with each other and with the buoy.
 *
 * The model is JONSWAP with the Kitaigorodskii/TMA depth correction and a
 * Horvath-style directional spread, implemented from the published technique.
 * The one liberty taken is normalisation: rather than deriving the Phillips
 * constant from fetch and wind, the spectrum is scaled so that its zeroth moment
 * reproduces the significant wave height NDBC actually reported. That is the
 * point of the project — the number on screen and the water on screen are the
 * same number.
 */
import type { FieldSource, Reading } from './shared/types'

export const GRAVITY = 9.81

export interface Cascade {
  /** Patch size in metres. The wavelengths this cascade is responsible for. */
  lengthM: number
  weight: number
}

/**
 * One wave system. A real sea is at least two of them at once — a long swell
 * that travelled in from a distant storm, and a short wind sea raised by the
 * wind blowing right now, usually from a different direction.
 *
 * Rendering only the dominant period is what makes a simulated ocean look like
 * a mirror on a swell day: a 1.2 m swell at 15 seconds has a surface slope of
 * about 0.003, which is glass. The chop you actually see on such a day is the
 * wind sea. NDBC publishes the split directly for spectral stations, in the
 * `.spec` file, and it is estimated from wind speed for the rest.
 */
export interface SpectrumComponent {
  /** Metres. This component's own significant wave height. */
  significantHeightM: number
  /** Seconds. */
  peakPeriodS: number
  /** Degrees from true north, the direction it is coming FROM. */
  directionDeg: number
  /** Radians. How widely energy is spread around `directionDeg`. */
  directionalSpread: number
  /** JONSWAP peak enhancement. Swell is narrower in frequency than a wind sea. */
  peakEnhancement: number
}

export interface SpectrumParams {
  /** Metres. The total significant wave height — what the buoy reported. */
  significantHeightM: number
  /** Seconds. The dominant period — what the buoy reported. */
  peakPeriodS: number
  /** Degrees from true north, the direction the dominant waves are coming FROM. */
  directionDeg: number
  /** m/s. Feeds the wind sea and the audio hiss. */
  windSpeedMs: number
  /** Degrees from true north, the direction the wind is coming FROM. */
  windDirectionDeg: number
  /** Metres. Not published by NDBC; see `DEFAULT_DEPTH_M`. */
  depthM: number
  /** The long system. Zero height when the sea is all wind. */
  swell: SpectrumComponent
  /** The short system raised by the local wind. */
  windSea: SpectrumComponent
  cascades: Cascade[]
  /** Where each driving value came from, so the readout never overstates it. */
  sources: {
    significantHeight: FieldSource
    peakPeriod: FieldSource
    direction: FieldSource
    wind: FieldSource
    /** `measured` only when NDBC published the swell/wind-sea split itself. */
    split: FieldSource
  }
}

/**
 * NDBC publishes no water depth for its stations — `activestations.xml` carries
 * site elevation, not sounding. Deep water is assumed, which makes the TMA
 * correction very close to unity for the periods these buoys report. The
 * correction is implemented rather than dropped so a depth source can be wired
 * in later without touching the spectrum.
 */
export const DEFAULT_DEPTH_M = 1000

/**
 * Three bands: the swell you see as a field from above, the chop that gives the
 * surface its texture, and the fine detail that catches light near the camera.
 *
 * `lengthM` is the FFT patch size, not the band. A patch can only carry
 * wavelengths up to its own size, and a 14-second swell is about 300 m long, so
 * the coarse cascade needs a patch several times that. The bands these three
 * actually cover are wavelengths above 40 m, 3.5–40 m, and below 3.5 m.
 */
export const DEFAULT_CASCADES: Cascade[] = [
  { lengthM: 1024, weight: 1 },
  { lengthM: 96, weight: 1 },
  { lengthM: 12, weight: 1 },
]

/** Where one cascade hands over to the next, in metres of wavelength. */
export const CASCADE_BOUNDARY_WAVELENGTHS_M = [40, 3.5]

/** Swell is narrow in frequency; a wind sea is broad. */
export const SWELL_PEAK_ENHANCEMENT = 6
export const WIND_SEA_PEAK_ENHANCEMENT = 3.3

/** Calm-but-not-flat. Used when a station reports nothing usable at all. */
export const CALM_SEA: SpectrumParams = {
  significantHeightM: 0.3,
  peakPeriodS: 5,
  directionDeg: 270,
  windSpeedMs: 3,
  windDirectionDeg: 270,
  depthM: DEFAULT_DEPTH_M,
  swell: {
    significantHeightM: 0.12,
    peakPeriodS: 11,
    directionDeg: 270,
    directionalSpread: 0.35,
    peakEnhancement: SWELL_PEAK_ENHANCEMENT,
  },
  windSea: {
    significantHeightM: 0.27,
    peakPeriodS: 3.2,
    directionDeg: 270,
    directionalSpread: 0.9,
    peakEnhancement: WIND_SEA_PEAK_ENHANCEMENT,
  },
  cascades: DEFAULT_CASCADES,
  sources: {
    significantHeight: 'absent',
    peakPeriod: 'absent',
    direction: 'absent',
    wind: 'absent',
    split: 'absent',
  },
}

/**
 * Pierson–Moskowitz, fully developed sea: Hs = 0.21 U² / g.
 * Used only when a station reports wind but no wave height.
 */
export function significantHeightFromWind(windSpeedMs: number): number {
  return (0.21 * windSpeedMs * windSpeedMs) / GRAVITY
}

/**
 * Pierson–Moskowitz peak period for a fully developed sea, ωp = 0.855 g / U.
 */
export function peakPeriodFromWind(windSpeedMs: number): number {
  if (windSpeedMs < 0.5) return 4
  return (2 * Math.PI * windSpeedMs) / (0.855 * GRAVITY)
}

/** The inverse, for stations that report waves but no wind. */
export function windFromSignificantHeight(significantHeightM: number): number {
  return Math.sqrt((significantHeightM * GRAVITY) / 0.21)
}

/**
 * Directional spread narrows as the sea gets longer and more organised: a 16 s
 * groundswell arrives from one direction, a 4 s windsea from everywhere. Tuned
 * by eye against the look of real water, not measured — NDBC publishes no
 * spreading parameter in `realtime2`.
 */
export function directionalSpreadFor(peakPeriodS: number): number {
  const t = clamp((peakPeriodS - 4) / 12, 0, 1)
  return lerp(0.95, 0.25, t)
}

/** NDBC publishes swell direction as a compass point, not degrees. */
const COMPASS_DEGREES: Record<string, number> = {
  N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
  S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
}

export function compassToDegrees(point: string | null): number | null {
  if (point === null) return null
  return COMPASS_DEGREES[point.trim().toUpperCase()] ?? null
}

/** Below this, a reported dominant period is a wind sea rather than a swell. */
const SWELL_PERIOD_THRESHOLD_S = 9

export function deriveSpectrumParams(reading: Reading): SpectrumParams {
  const hasWave = reading.waveHeightM !== null && reading.waveHeightM > 0
  const hasWind = reading.windSpeedMs !== null

  if (!hasWave && !hasWind) return CALM_SEA

  const windSpeedMs = reading.windSpeedMs ?? windFromSignificantHeight(reading.waveHeightM ?? 0.3)
  const totalHeightM = hasWave
    ? (reading.waveHeightM as number)
    : Math.max(0.05, significantHeightFromWind(windSpeedMs))

  const measuredPeriod = reading.dominantPeriodS ?? reading.averagePeriodS
  const peakPeriodS = measuredPeriod !== null && measuredPeriod > 0 ? measuredPeriod : peakPeriodFromWind(windSpeedMs)

  const measuredDirection = reading.waveDirectionDeg ?? reading.windDirectionDeg
  const directionDeg = measuredDirection ?? 270
  const windDirectionDeg = reading.windDirectionDeg ?? directionDeg

  // NDBC gives the split outright for spectral stations. Use it verbatim when
  // it is there; everything else in this function is the estimate for the rest.
  const swellDirectionDeg = compassToDegrees(reading.swellDirection)
  const publishedSplit =
    reading.swellHeightM !== null &&
    reading.swellPeriodS !== null &&
    reading.windWaveHeightM !== null &&
    reading.windWavePeriodS !== null

  let swellHeight: number
  let swellPeriod: number
  let swellDirection: number
  let windSeaHeight: number
  let windSeaPeriod: number

  if (publishedSplit) {
    swellHeight = reading.swellHeightM as number
    swellPeriod = Math.max(1, reading.swellPeriodS as number)
    swellDirection = swellDirectionDeg ?? directionDeg
    windSeaHeight = reading.windWaveHeightM as number
    windSeaPeriod = Math.max(1, reading.windWavePeriodS as number)
  } else {
    // A fully developed sea for this wind, capped so the estimate can never
    // claim more energy than the buoy actually measured.
    const windSeaCap = Math.min(significantHeightFromWind(windSpeedMs), totalHeightM * 0.92)
    windSeaPeriod = peakPeriodFromWind(windSpeedMs)

    if (peakPeriodS >= SWELL_PERIOD_THRESHOLD_S) {
      // The reported dominant period is a swell; the wind sea rides under it.
      // Variances add, so the two heights combine in quadrature.
      windSeaHeight = Math.max(0, windSeaCap)
      swellHeight = Math.sqrt(Math.max(0, totalHeightM * totalHeightM - windSeaHeight * windSeaHeight))
      swellPeriod = peakPeriodS
      swellDirection = directionDeg
    } else {
      // The sea is wind-driven throughout. There may still be a small long
      // swell underneath, but nothing in the reading evidences one.
      windSeaHeight = totalHeightM
      windSeaPeriod = peakPeriodS
      swellHeight = 0
      swellPeriod = Math.max(SWELL_PERIOD_THRESHOLD_S, peakPeriodS * 2)
      swellDirection = directionDeg
    }
  }

  const heightSource: FieldSource = hasWave ? (reading.fieldSources.waveHeightM ?? 'measured') : 'derived'

  return {
    significantHeightM: totalHeightM,
    peakPeriodS,
    directionDeg,
    windSpeedMs,
    windDirectionDeg,
    depthM: DEFAULT_DEPTH_M,
    swell: {
      significantHeightM: swellHeight,
      peakPeriodS: swellPeriod,
      directionDeg: swellDirection,
      directionalSpread: directionalSpreadFor(swellPeriod),
      peakEnhancement: SWELL_PEAK_ENHANCEMENT,
    },
    windSea: {
      significantHeightM: windSeaHeight,
      peakPeriodS: windSeaPeriod,
      directionDeg: windDirectionDeg,
      directionalSpread: directionalSpreadFor(windSeaPeriod),
      peakEnhancement: WIND_SEA_PEAK_ENHANCEMENT,
    },
    cascades: DEFAULT_CASCADES,
    sources: {
      significantHeight: heightSource,
      peakPeriod:
        measuredPeriod !== null && measuredPeriod > 0
          ? (reading.fieldSources.dominantPeriodS === 'absent'
              ? (reading.fieldSources.averagePeriodS ?? 'measured')
              : (reading.fieldSources.dominantPeriodS ?? 'measured'))
          : 'derived',
      direction:
        measuredDirection !== null
          ? (reading.fieldSources.waveDirectionDeg === 'absent'
              ? (reading.fieldSources.windDirectionDeg ?? 'measured')
              : (reading.fieldSources.waveDirectionDeg ?? 'measured'))
          : 'absent',
      wind: hasWind ? (reading.fieldSources.windSpeedMs ?? 'measured') : 'derived',
      split: publishedSplit ? 'measured' : 'derived',
    },
  }
}

/** The components that carry energy, in the order the renderer sums them. */
export function activeComponents(params: SpectrumParams): SpectrumComponent[] {
  return [params.swell, params.windSea].filter((component) => component.significantHeightM > 0.001)
}

/**
 * JONSWAP energy density at angular frequency `omega`, before normalisation.
 * The Phillips constant is folded into the normalisation step, so this returns a
 * shape rather than an absolute energy.
 */
export function jonswapShape(omega: number, peakPeriodS: number, peakEnhancement: number): number {
  if (omega <= 0) return 0
  const omegaPeak = (2 * Math.PI) / peakPeriodS
  const sigma = omega <= omegaPeak ? 0.07 : 0.09
  const ratio = omegaPeak / omega
  const base = (GRAVITY * GRAVITY) / Math.pow(omega, 5)
  const shape = Math.exp(-1.25 * Math.pow(ratio, 4))
  const exponent = Math.exp(-Math.pow(omega - omegaPeak, 2) / (2 * sigma * sigma * omegaPeak * omegaPeak))
  return base * shape * Math.pow(peakEnhancement, exponent)
}

/**
 * Kitaigorodskii depth attenuation — the TMA correction. Approaches 1 in deep
 * water, which is where nearly every NDBC buoy sits.
 */
export function tmaAttenuation(omega: number, depthM: number): number {
  const omegaH = omega * Math.sqrt(depthM / GRAVITY)
  if (omegaH <= 1) return 0.5 * omegaH * omegaH
  if (omegaH >= 2) return 1
  return 1 - 0.5 * (2 - omegaH) * (2 - omegaH)
}

/**
 * The one-dimensional spectrum, normalised so that its zeroth moment gives back
 * the reported significant wave height: m0 = (Hs / 4)².
 *
 * Returned against frequency in hertz, which is the axis the spectrum plot draws
 * and the axis the audio mapping reads.
 */
export function spectrumCurve(
  params: SpectrumParams,
  bins = 96,
  maxFrequencyHz = 0.6,
): { frequencyHz: number; energy: number }[] {
  const minFrequencyHz = 0.008
  const step = (maxFrequencyHz - minFrequencyHz) / (bins - 1)

  const total = new Array<number>(bins).fill(0)

  for (const component of [params.swell, params.windSea]) {
    if (component.significantHeightM <= 0.001) continue

    const raw: number[] = []
    for (let i = 0; i < bins; i += 1) {
      const frequencyHz = minFrequencyHz + i * step
      const omega = 2 * Math.PI * frequencyHz
      // dS/domega -> dS/df is a factor of 2*pi. It cancels in the normalisation
      // below, but keeping it makes the values a genuine density in m^2/Hz.
      const density =
        jonswapShape(omega, component.peakPeriodS, component.peakEnhancement) *
        tmaAttenuation(omega, params.depthM) *
        2 *
        Math.PI
      raw.push(Number.isFinite(density) ? density : 0)
    }

    let moment = 0
    for (const density of raw) moment += density * step
    // Each component is normalised to its own significant wave height, so the
    // two together reproduce the reported total: variances add.
    const targetMoment = Math.pow(component.significantHeightM / 4, 2)
    const scale = moment > 0 ? targetMoment / moment : 0
    for (let i = 0; i < bins; i += 1) total[i] = (total[i] ?? 0) + (raw[i] ?? 0) * scale
  }

  return total.map((energy, i) => ({ frequencyHz: minFrequencyHz + i * step, energy }))
}

/** Significant wave height implied by a curve. Used to prove the normalisation. */
export function significantHeightOf(curve: { frequencyHz: number; energy: number }[]): number {
  if (curve.length < 2) return 0
  let moment = 0
  for (let i = 1; i < curve.length; i += 1) {
    const a = curve[i - 1]
    const b = curve[i]
    if (a === undefined || b === undefined) continue
    moment += ((a.energy + b.energy) / 2) * (b.frequencyHz - a.frequencyHz)
  }
  return 4 * Math.sqrt(Math.max(0, moment))
}

/**
 * Readings land tens of minutes apart, so the surface eases from one to the
 * next rather than snapping. Direction is interpolated the short way round the
 * compass — otherwise a swell shifting from 355° to 5° would swing the whole sea
 * through 350 degrees.
 */
export function lerpSpectrumParams(from: SpectrumParams, to: SpectrumParams, t: number): SpectrumParams {
  const k = clamp(t, 0, 1)
  return {
    significantHeightM: lerp(from.significantHeightM, to.significantHeightM, k),
    peakPeriodS: lerp(from.peakPeriodS, to.peakPeriodS, k),
    directionDeg: lerpAngleDeg(from.directionDeg, to.directionDeg, k),
    windSpeedMs: lerp(from.windSpeedMs, to.windSpeedMs, k),
    windDirectionDeg: lerpAngleDeg(from.windDirectionDeg, to.windDirectionDeg, k),
    depthM: to.depthM,
    swell: lerpComponent(from.swell, to.swell, k),
    windSea: lerpComponent(from.windSea, to.windSea, k),
    cascades: to.cascades,
    sources: k >= 0.5 ? to.sources : from.sources,
  }
}

function lerpComponent(from: SpectrumComponent, to: SpectrumComponent, k: number): SpectrumComponent {
  return {
    significantHeightM: lerp(from.significantHeightM, to.significantHeightM, k),
    peakPeriodS: lerp(from.peakPeriodS, to.peakPeriodS, k),
    directionDeg: lerpAngleDeg(from.directionDeg, to.directionDeg, k),
    directionalSpread: lerp(from.directionalSpread, to.directionalSpread, k),
    peakEnhancement: lerp(from.peakEnhancement, to.peakEnhancement, k),
  }
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function lerpAngleDeg(a: number, b: number, t: number): number {
  const delta = (((b - a) % 360) + 540) % 360 - 180
  return (((a + delta * t) % 360) + 360) % 360
}

/**
 * The exponent of the `cos^{2s}(theta / 2)` directional spread. A long, organised
 * groundswell arrives from one direction and gets a high exponent; a short
 * windsea arrives from everywhere and gets a low one.
 */
export function directionalExponent(spreadRad: number): number {
  return Math.max(0.5, 1 / Math.max(0.05, spreadRad * spreadRad) - 1)
}

/**
 * The single constant that makes the rendered sea agree with the reported one.
 *
 * The GPU fills its grid with `scale x shape(omega) x spread(theta) x
 * (domega/dk) / k x dk^2`, and every point contributes twice — once from `h0(k)`
 * and once from `h0(-k)`. Summed over the whole grid that comes to
 * `2 x scale x I_shape x I_spread`, so setting
 *
 *     scale = (Hs / 4)^2 / (2 x I_shape x I_spread)
 *
 * makes the total variance exactly `(Hs / 4)^2`, which is the definition of
 * significant wave height. Both integrals are done here on the CPU because they
 * depend only on the reading, not on position, and doing them per texel would be
 * absurd. Checked in `tests/unit/fft-ocean.test.ts`.
 */
export function spectrumEnergyScale(component: SpectrumComponent, depthM: number): number {
  const OMEGA_STEPS = 512
  const maxOmega = 2 * Math.PI * 1.5
  const dOmega = maxOmega / OMEGA_STEPS

  let shapeIntegral = 0
  for (let i = 1; i <= OMEGA_STEPS; i += 1) {
    const omega = i * dOmega
    shapeIntegral +=
      jonswapShape(omega, component.peakPeriodS, component.peakEnhancement) * tmaAttenuation(omega, depthM) * dOmega
  }

  const THETA_STEPS = 512
  const dTheta = (2 * Math.PI) / THETA_STEPS
  const exponent = directionalExponent(component.directionalSpread)
  let spreadIntegral = 0
  for (let i = 0; i < THETA_STEPS; i += 1) {
    const theta = -Math.PI + (i + 0.5) * dTheta
    spreadIntegral += Math.pow(Math.max(0, Math.cos(theta / 2)), 2 * exponent) * dTheta
  }

  if (shapeIntegral <= 0 || spreadIntegral <= 0) return 0
  const moment = Math.pow(component.significantHeightM / 4, 2)
  return moment / (2 * shapeIntegral * spreadIntegral)
}

/** The direction waves travel toward, in radians, for the renderer. */
export function travelDirectionRad(comingFromDeg: number): number {
  return ((comingFromDeg + 180) * Math.PI) / 180
}
