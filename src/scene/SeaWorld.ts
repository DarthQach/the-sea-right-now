/**
 * The sea view: one patch of real water, a sky, and a camera you can move.
 *
 * This is the hero of the product. Everything here exists to keep the water
 * filling the frame and behaving like the reading says it should.
 */
import { Scene, Vector3, type PerspectiveCamera, type WebGPURenderer } from 'three/webgpu'
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CALM_SEA, type SpectrumParams } from '../lib/spectrum'
import type { World } from './World'
import type { Ocean } from './ocean/types'
import { GerstnerOcean } from './ocean/gerstner'
import { FftOcean, fftSupported } from './ocean/fft'
import { clampTarget, createCamera, createControls, defaultCameraPosition, resetCamera, verticalFovFor } from './camera'
import { createSky } from './sky'
import type { Backend } from './renderer'

export interface SeaWorldOptions {
  renderer: WebGPURenderer
  backend: Backend
  element: HTMLElement
  aspect: number
}

export class SeaWorld implements World {
  readonly scene = new Scene()
  readonly camera: PerspectiveCamera
  readonly ocean: Ocean

  private readonly controls: OrbitControls
  private params: SpectrumParams = CALM_SEA
  private motionScale = 1
  private readonly scratch = new Vector3()

  constructor(options: SeaWorldOptions) {
    this.camera = createCamera(options.aspect)
    this.controls = createControls(this.camera, options.element)

    this.ocean =
      options.backend === 'webgpu' && fftSupported(options.renderer)
        ? new FftOcean(options.renderer)
        : new GerstnerOcean()

    this.scene.add(createSky())
    this.scene.add(this.ocean.object)
    this.ocean.setParams(this.params)
  }

  setParams(params: SpectrumParams): void {
    this.params = params
    this.ocean.setParams(params)
  }

  /**
   * The calmer rendering used when the browser reports `prefers-reduced-motion`.
   * The sea is still the reported sea; its amplitude is scaled down so the frame
   * is not in constant large motion.
   */
  setMotionScale(scale: number): void {
    this.motionScale = scale
    this.ocean.setMotionScale(scale)
  }

  resetCamera(): void {
    resetCamera(this.camera, this.controls)
  }

  resize(width: number, height: number): void {
    const aspect = width / Math.max(1, height)
    const wasDefault = this.isAtDefaultFraming()
    this.camera.aspect = aspect
    this.camera.fov = verticalFovFor(aspect)
    this.camera.updateProjectionMatrix()
    // A camera nobody has touched follows the new shape of the window. One that
    // has been moved stays where it was put.
    if (wasDefault) this.resetCamera()
  }

  private isAtDefaultFraming(): boolean {
    const expected = defaultCameraPosition(this.camera.aspect, this.scratch)
    return this.camera.position.distanceTo(expected) < 0.01 && this.controls.target.lengthSq() < 0.01
  }

  update(elapsedSeconds: number, deltaSeconds: number): void {
    this.controls.update()
    clampTarget(this.controls)

    // Keep the camera above the water it is drawing. The exact surface height is
    // on the GPU, so this uses the sea state's own scale rather than reading it
    // back — a readback every frame would cost more than it is worth.
    const clearance = 0.7 + this.params.significantHeightM * 0.75 * this.motionScale
    if (this.camera.position.y < clearance) this.camera.position.y = clearance

    this.ocean.setCentre(this.controls.target.x, this.controls.target.z)
    this.ocean.update(elapsedSeconds, deltaSeconds)
  }

  dispose(): void {
    this.controls.dispose()
    this.ocean.dispose()
    this.scene.clear()
  }
}
