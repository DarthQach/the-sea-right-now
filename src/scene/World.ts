import type { Camera, Scene } from 'three/webgpu'

/**
 * One renderable world. The sea view and the globe view are both worlds; the
 * host owns the canvas and the renderer and swaps between them, so switching
 * views never costs a second GPU context.
 */
export interface World {
  readonly scene: Scene
  readonly camera: Camera
  resize(width: number, height: number): void
  update(elapsedSeconds: number, deltaSeconds: number): void
  /** Called when the world stops being the visible one. */
  deactivate?(): void
  activate?(): void
  dispose(): void
}
