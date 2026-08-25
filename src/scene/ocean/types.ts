import type { Object3D } from 'three/webgpu'
import type { SpectrumParams } from '../../lib/spectrum'

/**
 * The two ocean implementations present the same surface to the scene: give it a
 * spectrum, advance it in time, draw it. Which one is running is a fact about
 * the visitor's GPU, never about the product.
 */
export interface Ocean {
  readonly kind: 'fft' | 'gerstner'
  readonly object: Object3D
  /** Called on every new reading. The ocean interpolates internally where it can. */
  setParams(params: SpectrumParams): void
  /** Scales wave amplitude for the calmer reduced-motion rendering. 0…1. */
  setMotionScale(scale: number): void
  /** Keeps the detail concentrated where the camera is looking. */
  setCentre(x: number, z: number): void
  update(elapsedSeconds: number, deltaSeconds: number): void
  dispose(): void
}
