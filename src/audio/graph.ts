/**
 * The sound of the sea, synthesised from the same numbers as the water.
 *
 * Nothing is downloaded and nothing is a recording. Both mappings are built live
 * from the spectrum the ocean is being rendered from, which is why a 1 m day and
 * a 4 m day are audibly different without anyone explaining which is which.
 *
 * Audio never starts on its own. Browsers will not allow it, and it would be
 * rude if they did.
 */
import type { SpectrumParams } from '../lib/spectrum'
import { LiteralMapping } from './literal'
import { TunedMapping } from './tuned'

export type AudioMode = 'literal' | 'tuned'

export interface SonificationMapping {
  readonly mode: AudioMode
  /** Everything this mapping makes noise with hangs off here. */
  readonly output: AudioNode
  /** A new reading arrived, or the interpolation moved. */
  update(params: SpectrumParams, now: number): void
  /** Called every animation frame while playing, for anything scheduled ahead. */
  tick(now: number): void
  dispose(): void
}

/** Seconds to fade in or out. Long enough that starting never sounds like a click. */
const FADE_SECONDS = 1.2

export class SeaAudio {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private analyser: AnalyserNode | null = null
  private levelSamples: Float32Array<ArrayBuffer> | null = null
  private level = 0
  private mapping: SonificationMapping | null = null
  private frameHandle: number | null = null

  private mode: AudioMode = 'literal'
  private volume = 0.6
  private muted = false
  private params: SpectrumParams | null = null
  private playing = false

  /** True once a user gesture has started the audio context. */
  get isPlaying(): boolean {
    return this.playing
  }

  get currentMode(): AudioMode {
    return this.mode
  }

  /**
   * Must be called from a user gesture. Everything before this point is inert:
   * no AudioContext exists, so nothing can make a sound by accident.
   */
  async start(mode: AudioMode, volume: number, muted: boolean): Promise<void> {
    this.mode = mode
    this.volume = volume
    this.muted = muted

    if (this.context === null) {
      this.context = new AudioContext({ latencyHint: 'playback' })
      this.master = this.context.createGain()
      this.master.gain.value = 0
      this.master.connect(this.context.destination)

      // A tap on the output, so the product can show — and a journey test can
      // assert — that sound is actually being generated, rather than that a
      // graph merely exists.
      this.analyser = this.context.createAnalyser()
      this.analyser.fftSize = 1024
      this.analyser.smoothingTimeConstant = 0.6
      this.master.connect(this.analyser)
      this.levelSamples = new Float32Array(new ArrayBuffer(this.analyser.fftSize * 4))
    }

    if (this.context.state === 'suspended') await this.context.resume()

    this.buildMapping()
    this.playing = true
    this.applyGain(FADE_SECONDS)
    this.startFrameLoop()
  }

  stop(): void {
    if (this.context === null || this.master === null) return
    this.playing = false
    this.applyGain(0.4)
    this.stopFrameLoop()
  }

  setMode(mode: AudioMode): void {
    if (mode === this.mode) return
    this.mode = mode
    // Rebuild rather than reconfigure: the two mappings are different graphs.
    // The master gain stays where it is, so the change has no gap in it.
    if (this.playing) this.buildMapping()
  }

  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume))
    this.applyGain(0.15)
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    this.applyGain(0.15)
  }

  setParams(params: SpectrumParams): void {
    this.params = params
    if (this.context !== null) this.mapping?.update(params, this.context.currentTime)
  }

  dispose(): void {
    this.stopFrameLoop()
    this.mapping?.dispose()
    this.mapping = null
    void this.context?.close()
    this.context = null
    this.master = null
    this.analyser = null
    this.levelSamples = null
    this.playing = false
  }

  /** What the journey test asserts on, instead of listening. */
  get state(): {
    running: boolean
    mode: AudioMode
    volume: number
    muted: boolean
    contextState: string | null
    /** RMS of the output over the last frame, 0…1. */
    level: number
  } {
    return {
      running: this.playing,
      mode: this.mode,
      volume: this.volume,
      muted: this.muted,
      contextState: this.context?.state ?? null,
      level: this.level,
    }
  }

  private sampleLevel(): void {
    const analyser = this.analyser
    const samples = this.levelSamples
    if (analyser === null || samples === null) return
    analyser.getFloatTimeDomainData(samples)
    let sum = 0
    for (let i = 0; i < samples.length; i += 1) sum += (samples[i] ?? 0) ** 2
    this.level = Math.sqrt(sum / samples.length)
  }

  private buildMapping(): void {
    const context = this.context
    const master = this.master
    if (context === null || master === null) return

    const previous = this.mapping
    this.mapping = this.mode === 'literal' ? new LiteralMapping(context) : new TunedMapping(context)
    this.mapping.output.connect(master)
    if (this.params !== null) this.mapping.update(this.params, context.currentTime)

    // Let the outgoing graph finish its own fade before it is taken apart.
    if (previous !== null) {
      const outgoing = previous
      outgoing.output.disconnect()
      setTimeout(() => outgoing.dispose(), 400)
    }
  }

  private applyGain(seconds: number): void {
    const context = this.context
    const master = this.master
    if (context === null || master === null) return
    const target = this.playing && !this.muted ? this.volume * 0.9 : 0
    master.gain.cancelScheduledValues(context.currentTime)
    master.gain.setValueAtTime(master.gain.value, context.currentTime)
    master.gain.linearRampToValueAtTime(target, context.currentTime + seconds)
  }

  private startFrameLoop(): void {
    if (this.frameHandle !== null) return
    const step = () => {
      if (this.context !== null && this.playing) {
        this.mapping?.tick(this.context.currentTime)
        this.sampleLevel()
      }
      this.frameHandle = requestAnimationFrame(step)
    }
    this.frameHandle = requestAnimationFrame(step)
  }

  private stopFrameLoop(): void {
    if (this.frameHandle === null) return
    cancelAnimationFrame(this.frameHandle)
    this.frameHandle = null
  }
}
