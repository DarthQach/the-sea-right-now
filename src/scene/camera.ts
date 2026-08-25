/**
 * The camera.
 *
 * The default framing is the product's opening shot: low on the surface, close
 * to the water, horizon in the upper third. From there it orbits up to a field
 * view of the swell pattern and back, and one action returns it here.
 */
import { PerspectiveCamera, Vector3 } from 'three/webgpu'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

export const DEFAULT_POSITION = new Vector3(0, 2.05, 14)
export const DEFAULT_TARGET = new Vector3(0, 0, 0)
export const FIELD_OF_VIEW = 50

/**
 * Low on the surface and close to it: 2 m above mean sea level, 14 m out. That
 * pitches the camera about 8.3° down, and with a 50° vertical field of view it
 * places the horizon a third of the way down from the top edge.
 */
export function createCamera(aspect: number): PerspectiveCamera {
  const camera = new PerspectiveCamera(FIELD_OF_VIEW, aspect, 0.1, 20000)
  camera.position.copy(DEFAULT_POSITION)
  camera.lookAt(DEFAULT_TARGET)
  return camera
}

export function createControls(camera: PerspectiveCamera, element: HTMLElement): OrbitControls {
  const controls = new OrbitControls(camera, element)
  controls.enableDamping = true
  controls.dampingFactor = 0.12
  controls.target.copy(DEFAULT_TARGET)

  controls.minDistance = 3
  controls.maxDistance = 900

  // Never below the surface, and never quite straight down — looking at the sea
  // from directly overhead reads as a texture rather than as water.
  controls.minPolarAngle = 0.12
  controls.maxPolarAngle = Math.PI / 2 - 0.015

  controls.screenSpacePanning = false
  controls.panSpeed = 0.7
  controls.rotateSpeed = 0.45
  controls.zoomSpeed = 0.7

  // Keyboard operability, so the sea view works without a mouse.
  controls.keys = { LEFT: 'ArrowLeft', UP: 'ArrowUp', RIGHT: 'ArrowRight', BOTTOM: 'ArrowDown' }
  controls.keyPanSpeed = 14

  controls.update()
  return controls
}

/**
 * Returns the camera to the default framing. Bound to the reset control.
 *
 * Damping is switched off for one update first. Without that, the leftover
 * inertia from whatever drag preceded the reset keeps being applied afterwards
 * and the camera glides away from the framing it was just asked to return to.
 */
export function resetCamera(camera: PerspectiveCamera, controls: OrbitControls): void {
  const damping = controls.enableDamping
  controls.enableDamping = false
  controls.update()

  camera.position.copy(DEFAULT_POSITION)
  controls.target.copy(DEFAULT_TARGET)
  controls.update()

  controls.enableDamping = damping
}

/** Panning is clamped so the detailed part of the ocean grid stays under the camera. */
export const MAX_PAN_RADIUS = 400

export function clampTarget(controls: OrbitControls): void {
  const target = controls.target
  target.y = 0
  const radius = Math.hypot(target.x, target.z)
  if (radius > MAX_PAN_RADIUS) {
    const scale = MAX_PAN_RADIUS / radius
    target.x *= scale
    target.z *= scale
  }
}
