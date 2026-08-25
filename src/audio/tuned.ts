/**
 * The tuned mapping: the same numbers, made musical.
 *
 * A slow harmonic drone whose root pitch comes from the dominant period, whose
 * partials are voiced by where the spectrum's energy actually sits, whose
 * brightness follows wave height and whose movement follows the wind. It shifts
 * as the sea does, and it stays beautiful on a flat day — which is the whole
 * reason it exists.
 *
 * It never engages on its own. However dull the conditions, the literal mapping
 * stays literal; switching is the visitor's choice.
 */
import type { SpectrumParams } from '../lib/spectrum'
import { clamp, spectrumCurve } from '../lib/spectrum'
import type { SonificationMapping } from './graph'
import { createLoopingNoise } from './noise'

/**
 * A just-intoned stack. Whole-number ratios rather than equal temperament,
 * because the partials of a real wave field are not equally tempered either and
 * the beating between them is most of the character.
 */
const PARTIALS = [1, 2, 3, 4, 6, 8]
/** Where in the wave spectrum each partial takes its loudness from, in hertz. */
const PARTIAL_BANDS = [0.05, 0.08, 0.12, 0.17, 0.25, 0.38]

interface Voice {
  oscillator: OscillatorNode
  gain: GainNode
  detune: OscillatorNode
  detuneAmount: GainNode
}

export class TunedMapping implements SonificationMapping {
  readonly mode = 'tuned' as const
  readonly output: GainNode

  private readonly voices: Voice[] = []
  private readonly colour: BiquadFilterNode
  private readonly air: GainNode
  private readonly airFilter: BiquadFilterNode
  private readonly noise: AudioBufferSourceNode
  private readonly panner: StereoPannerNode

  constructor(context: AudioContext) {
    this.output = context.createGain()
    this.output.gain.value = 1

    this.colour = context.createBiquadFilter()
    this.colour.type = 'lowpass'
    this.colour.frequency.value = 700
    this.colour.Q.value = 0.6

    this.panner = context.createStereoPanner()
    this.colour.connect(this.panner).connect(this.output)

    for (let i = 0; i < PARTIALS.length; i += 1) {
      const oscillator = context.createOscillator()
      oscillator.type = i === 0 ? 'sine' : 'triangle'
      oscillator.frequency.value = 110 * (PARTIALS[i] ?? 1)

      const gain = context.createGain()
      gain.gain.value = 0

      // A very slow detune wander, a few cents wide. It is what keeps a drone
      // from sounding like a synthesiser holding a chord.
      const detune = context.createOscillator()
      detune.type = 'sine'
      detune.frequency.value = 0.03 + i * 0.017
      const detuneAmount = context.createGain()
      detuneAmount.gain.value = 4 + i * 1.5
      detune.connect(detuneAmount).connect(oscillator.detune)
      detune.start()

      oscillator.connect(gain).connect(this.colour)
      oscillator.start()

      this.voices.push({ oscillator, gain, detune, detuneAmount })
    }

    // A breath of filtered noise under the drone, standing in for the wind.
    this.noise = createLoopingNoise(context, 0x7ea1)
    this.airFilter = context.createBiquadFilter()
    this.airFilter.type = 'bandpass'
    this.airFilter.frequency.value = 900
    this.airFilter.Q.value = 0.4
    this.air = context.createGain()
    this.air.gain.value = 0
    this.noise.connect(this.airFilter).connect(this.air).connect(this.output)
  }

  update(params: SpectrumParams, now: number): void {
    // Root pitch from the dominant period: a long swell is a low note. Mapped
    // across a two-octave range so the whole span of real sea states is usable
    // and nothing lands where it cannot be heard.
    const period = clamp(params.peakPeriodS, 2, 22)
    const root = 138.6 * Math.pow(2, -(period - 4) / 11)

    const curve = spectrumCurve(params, 64, 0.45)
    const peak = curve.reduce((best, point) => Math.max(best, point.energy), 0)

    const height = clamp(params.significantHeightM, 0, 9)
    const loudness = clamp(0.26 + Math.sqrt(height / 4) * 0.68, 0.24, 1.05)

    this.voices.forEach((voice, index) => {
      const ratio = PARTIALS[index] ?? 1
      ramp(voice.oscillator.frequency, now, root * ratio)

      // Each partial is voiced by the wave energy at its own band, so the chord
      // genuinely reports the shape of the sea rather than decorating it.
      const band = PARTIAL_BANDS[index] ?? 0.1
      const energy = energyNear(curve, band)
      const share = peak > 0 ? energy / peak : 0
      const weight = (0.55 / (1 + index * 0.85)) * (0.35 + Math.pow(share, 0.55) * 0.85)
      ramp(voice.gain.gain, now, weight * loudness)
    })

    // Bigger seas are brighter and wider; calm ones close down to a soft hum.
    ramp(this.colour.frequency, now, 380 + Math.sqrt(height / 8) * 2400)
    ramp(this.air.gain, now, clamp(params.windSpeedMs / 22, 0, 1) * 0.05)
    ramp(this.airFilter.frequency, now, 500 + clamp(params.windSpeedMs / 20, 0, 1) * 2400)

    // Where the swell is coming from, placed in the stereo field.
    const radians = (params.directionDeg * Math.PI) / 180
    ramp(this.panner.pan, now, Math.sin(radians) * 0.55)
  }

  tick(): void {
    // Nothing to schedule: the drone is continuous by construction.
  }

  dispose(): void {
    for (const voice of this.voices) {
      voice.oscillator.stop()
      voice.detune.stop()
    }
    this.noise.stop()
    this.output.disconnect()
  }
}

function energyNear(curve: { frequencyHz: number; energy: number }[], frequencyHz: number): number {
  let best = curve[0]
  let bestDistance = Number.POSITIVE_INFINITY
  for (const point of curve) {
    const distance = Math.abs(point.frequencyHz - frequencyHz)
    if (distance < bestDistance) {
      bestDistance = distance
      best = point
    }
  }
  return best?.energy ?? 0
}

function ramp(param: AudioParam, now: number, value: number): void {
  if (!Number.isFinite(value)) return
  param.cancelScheduledValues(now)
  param.setValueAtTime(param.value, now)
  // Slow: the sea does not change quickly and neither should the chord.
  param.linearRampToValueAtTime(value, now + 2.5)
}
