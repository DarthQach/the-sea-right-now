/**
 * The literal mapping: this is what the sea sounds like.
 *
 * Broadband noise shaped by the spectrum. The dominant period sets the rhythm at
 * which swells arrive and break, significant wave height sets how much there is
 * of it, and wind speed sets the hiss over the top. Every one of those is a
 * number NOAA measured; nothing here is invented for effect.
 *
 * It stays literal however dull the conditions are. On a flat day it is quiet,
 * because the sea is quiet. Prettiness is what the tuned mapping is for.
 */
import type { SpectrumParams } from '../lib/spectrum'
import { clamp, spectrumCurve } from '../lib/spectrum'
import type { SonificationMapping } from './graph'
import { createLoopingNoise } from './noise'

/** How far ahead breaking waves are scheduled. */
const SCHEDULE_AHEAD_SECONDS = 2

export class LiteralMapping implements SonificationMapping {
  readonly mode = 'literal' as const
  readonly output: GainNode

  private readonly context: AudioContext
  private readonly noise: AudioBufferSourceNode
  private readonly swellBand: BiquadFilterNode
  private readonly washBand: BiquadFilterNode
  private readonly windBand: BiquadFilterNode
  private readonly swellGain: GainNode
  private readonly washGain: GainNode
  private readonly windGain: GainNode
  private readonly surge: GainNode
  private readonly surgeLfo: OscillatorNode
  private readonly surgeDepth: GainNode
  private readonly breakBus: GainNode

  private params: SpectrumParams | null = null
  private nextBreakAt = 0
  private breakSeed = 1

  constructor(context: AudioContext) {
    this.context = context
    this.output = context.createGain()
    this.output.gain.value = 1

    this.noise = createLoopingNoise(context, 0x51ea)

    // Three bands, because that is how the sea actually divides up: the long
    // rumble underneath, the wash of water turning over, and the wind on top.
    this.swellBand = context.createBiquadFilter()
    this.swellBand.type = 'lowpass'
    this.swellBand.frequency.value = 180
    this.swellBand.Q.value = 0.7

    this.washBand = context.createBiquadFilter()
    this.washBand.type = 'bandpass'
    this.washBand.frequency.value = 700
    this.washBand.Q.value = 0.55

    this.windBand = context.createBiquadFilter()
    this.windBand.type = 'highpass'
    this.windBand.frequency.value = 2200
    this.windBand.Q.value = 0.4

    this.swellGain = context.createGain()
    this.washGain = context.createGain()
    this.windGain = context.createGain()
    this.swellGain.gain.value = 0
    this.washGain.gain.value = 0
    this.windGain.gain.value = 0

    // The swell surge: everything rises and falls at the dominant period, which
    // is the single most recognisable thing about the sound of open water.
    this.surge = context.createGain()
    this.surge.gain.value = 0.65
    this.surgeLfo = context.createOscillator()
    this.surgeLfo.type = 'sine'
    this.surgeLfo.frequency.value = 0.1
    this.surgeDepth = context.createGain()
    this.surgeDepth.gain.value = 0.3
    this.surgeLfo.connect(this.surgeDepth).connect(this.surge.gain)
    this.surgeLfo.start()

    this.breakBus = context.createGain()
    this.breakBus.gain.value = 1

    this.noise.connect(this.swellBand).connect(this.swellGain).connect(this.surge)
    this.noise.connect(this.washBand).connect(this.washGain).connect(this.surge)
    this.surge.connect(this.output)
    // Wind is not modulated by the swell — it blows whether a wave is passing or not.
    this.noise.connect(this.windBand).connect(this.windGain).connect(this.output)
    this.breakBus.connect(this.output)

    this.nextBreakAt = context.currentTime + 0.4
  }

  update(params: SpectrumParams, now: number): void {
    this.params = params

    const height = params.significantHeightM
    // A 0.3 m day and an 8 m day have to be obviously different without being
    // painful, so loudness follows the square root of height rather than height.
    const intensity = clamp(Math.sqrt(height / 3), 0.08, 1.4)

    const curve = spectrumCurve(params, 48, 0.45)
    const totalEnergy = curve.reduce((sum, point) => sum + point.energy, 0)
    const longEnergy = curve.filter((point) => point.frequencyHz < 0.12).reduce((sum, p) => sum + p.energy, 0)
    // How much of the sea is long swell rather than short chop. This is what
    // makes a groundswell sound different from a windy day at the same height.
    const swellShare = totalEnergy > 0 ? longEnergy / totalEnergy : 0

    const windHiss = clamp(params.windSpeedMs / 18, 0, 1)

    ramp(this.swellGain.gain, now, intensity * (0.25 + swellShare * 0.75) * 1.5)
    ramp(this.washGain.gain, now, intensity * (0.35 + (1 - swellShare) * 0.65) * 0.55)
    ramp(this.windGain.gain, now, Math.pow(windHiss, 1.6) * 0.32)

    // Longer swells have a deeper rumble and a slower surge.
    ramp(this.swellBand.frequency, now, 90 + 260 / Math.max(2, params.peakPeriodS) * 4)
    ramp(this.washBand.frequency, now, 420 + windHiss * 900)
    ramp(this.windBand.frequency, now, 1600 + windHiss * 2600)

    ramp(this.surgeLfo.frequency, now, 1 / Math.max(2, params.peakPeriodS))
    ramp(this.surgeDepth.gain, now, 0.18 + swellShare * 0.24)
  }

  /**
   * Waves break at roughly the dominant period, with real scatter. Each break is
   * a short burst of filtered noise; together they are what stops the sound
   * being a flat wash.
   */
  tick(now: number): void {
    const params = this.params
    if (params === null) return

    while (this.nextBreakAt < now + SCHEDULE_AHEAD_SECONDS) {
      this.scheduleBreak(Math.max(this.nextBreakAt, now + 0.05), params)
      const period = Math.max(2, params.peakPeriodS)
      // Real seas do not break on a metronome.
      this.nextBreakAt += period * (0.55 + this.random() * 0.9)
    }
  }

  dispose(): void {
    this.noise.stop()
    this.surgeLfo.stop()
    this.output.disconnect()
  }

  private scheduleBreak(at: number, params: SpectrumParams): void {
    const context = this.context
    const height = params.significantHeightM
    // Small seas do not break at all, and saying so is more honest than faking it.
    const chance = clamp((height - 0.25) / 2.2, 0, 0.9)
    if (this.random() > chance) return

    const source = context.createBufferSource()
    source.buffer = this.noise.buffer
    source.loop = true
    const offset = this.random() * 2

    const band = context.createBiquadFilter()
    band.type = 'bandpass'
    band.Q.value = 0.5
    band.frequency.setValueAtTime(1400 + this.random() * 1600, at)
    band.frequency.exponentialRampToValueAtTime(320 + this.random() * 260, at + 1.1)

    const envelope = context.createGain()
    const peak = clamp(Math.sqrt(height / 4), 0.05, 0.9) * (0.4 + this.random() * 0.6) * 0.5
    envelope.gain.setValueAtTime(0.0001, at)
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), at + 0.18)
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + 1.6)

    const panner = context.createStereoPanner()
    panner.pan.value = this.random() * 1.6 - 0.8

    source.connect(band).connect(envelope).connect(panner).connect(this.breakBus)
    source.start(at, offset)
    source.stop(at + 1.8)
  }

  /** Deterministic, so the same sea sounds the same twice. */
  private random(): number {
    this.breakSeed = (this.breakSeed * 1664525 + 1013904223) >>> 0
    return this.breakSeed / 0xffffffff
  }
}

function ramp(param: AudioParam, now: number, value: number): void {
  if (!Number.isFinite(value)) return
  param.cancelScheduledValues(now)
  param.setValueAtTime(param.value, now)
  param.linearRampToValueAtTime(value, now + 1.5)
}
