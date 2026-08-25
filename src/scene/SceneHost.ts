/**
 * Owns the canvas, the renderer and the frame loop.
 *
 * Continuous GPU rendering drains laptop batteries, so throttling is a
 * requirement here rather than an optimisation: when the tab loses focus or the
 * machine is on battery, the loop slows hard and the interface says so, because
 * a product that quietly cooks a laptop earns the word of mouth it deserves.
 */
import type { WebGPURenderer } from 'three/webgpu'
import { createRenderer, pixelRatioFor, type Backend } from './renderer'
import type { World } from './World'

/** Frames per second while the tab is visible and the machine is not conserving power. */
const FULL_FPS = 60
/** While hidden or on battery. Low enough to be nearly free, high enough to resume instantly. */
const THROTTLED_FPS = 4

export interface SceneHostOptions {
  canvas: HTMLCanvasElement
  forceWebGL: boolean
  onThrottleChange?: (throttled: boolean) => void
  onError?: (error: unknown) => void
}

export class SceneHost {
  readonly renderer: WebGPURenderer
  readonly backend: Backend
  /** True when WebGPU was available and the visitor asked for the reduced path anyway. */
  readonly forcedWebGL: boolean

  private world: World | null = null
  private running = false
  private throttled = false
  private throttleReasons = new Set<string>()
  private lastFrameAt = 0
  private startedAt = 0
  private elapsed = 0
  private frames = 0
  private lastReportedFrames = 0
  private lastReportAt = 0

  private readonly canvas: HTMLCanvasElement
  private readonly onThrottleChange: ((throttled: boolean) => void) | undefined

  private constructor(
    canvas: HTMLCanvasElement,
    renderer: WebGPURenderer,
    backend: Backend,
    forcedWebGL: boolean,
    onThrottleChange?: (throttled: boolean) => void,
  ) {
    this.canvas = canvas
    this.renderer = renderer
    this.backend = backend
    this.forcedWebGL = forcedWebGL
    this.onThrottleChange = onThrottleChange
  }

  static async create(options: SceneHostOptions): Promise<SceneHost> {
    const { renderer, backend, forced } = await createRenderer(options.canvas, { forceWebGL: options.forceWebGL })
    const host = new SceneHost(options.canvas, renderer, backend, forced, options.onThrottleChange)
    host.resize()
    return host
  }

  setWorld(world: World | null): void {
    if (this.world === world) return
    this.world?.deactivate?.()
    this.world = world
    world?.activate?.()
    this.resize()
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.startedAt = performance.now()
    this.lastFrameAt = this.startedAt
    this.lastReportAt = this.startedAt
    void this.renderer.setAnimationLoop((time) => this.frame(time))
  }

  stop(): void {
    if (!this.running) return
    this.running = false
    void this.renderer.setAnimationLoop(null)
  }

  /**
   * Throttling is reason-counted: the tab being hidden and the machine being on
   * battery are separate reasons, and rendering only returns to full rate when
   * every reason has cleared.
   */
  setThrottleReason(reason: string, active: boolean): void {
    const before = this.throttleReasons.size > 0
    if (active) this.throttleReasons.add(reason)
    else this.throttleReasons.delete(reason)
    const after = this.throttleReasons.size > 0
    if (before !== after) {
      this.throttled = after
      this.renderer.setPixelRatio(pixelRatioFor(globalThis.devicePixelRatio ?? 1, after))
      this.onThrottleChange?.(after)
    }
  }

  get isThrottled(): boolean {
    return this.throttled
  }

  get throttleReasonList(): string[] {
    return [...this.throttleReasons]
  }

  resize(): void {
    const width = this.canvas.clientWidth || this.canvas.width || 1
    const height = this.canvas.clientHeight || this.canvas.height || 1
    this.renderer.setPixelRatio(pixelRatioFor(globalThis.devicePixelRatio ?? 1, this.throttled))
    this.renderer.setSize(width, height, false)
    this.world?.resize(width, height)
  }

  dispose(): void {
    this.stop()
    this.world?.dispose()
    this.world = null
    this.renderer.dispose()
  }

  private frame(time: DOMHighResTimeStamp): void {
    const world = this.world
    if (world === null) return

    const minimumInterval = 1000 / (this.throttled ? THROTTLED_FPS : FULL_FPS)
    const sinceLast = time - this.lastFrameAt
    if (sinceLast < minimumInterval - 1) return

    const delta = Math.min(0.1, sinceLast / 1000)
    this.lastFrameAt = time
    this.elapsed = (time - this.startedAt) / 1000

    world.update(this.elapsed, delta)
    this.renderer.render(world.scene, world.camera)

    this.frames += 1
    // The smoke tier asserts that the canvas is painting rather than inspecting
    // pixels, so the frame count is published where a test can read it. Twice a
    // second, not every frame — this is a DOM write.
    if (time - this.lastReportAt > 500) {
      this.lastReportAt = time
      if (this.frames !== this.lastReportedFrames) {
        this.lastReportedFrames = this.frames
        this.canvas.dataset.frames = String(this.frames)
      }
      // Where the camera actually is. Published so a journey test can prove that
      // orbiting moved it and that the reset control brought it back, without
      // ever inspecting a pixel.
      const { x, y, z } = world.camera.position
      this.canvas.dataset.camera = `${x.toFixed(1)},${y.toFixed(1)},${z.toFixed(1)}`
    }
  }
}
