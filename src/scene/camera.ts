/**
 * The camera.
 *
 * The default framing is the product's opening shot: low on the surface, close
 * to the water, horizon in the upper third. From there it orbits up to a field
 * view of the swell pattern and back, and one action returns it here.
 */
import { PerspectiveCamera, Vector3 } from 'three/webgpu'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

export const DEFAULT_TARGET = new Vector3(0, 0, 0)
/** How far out the default framing sits. Low and near the water. */
export const DEFAULT_DISTANCE = 14
/** Where the horizon belongs: a third of the way down from the top edge. */
export const HORIZON_FRACTION = 1 / 3
export const FIELD_OF_VIEW = 50

/**
 * The narrowest slice of sea worth showing, horizontally.
 *
 * A fixed vertical field of view means a portrait phone sees barely thirty
 * degrees across, which turns the ocean into a wall of one colour — you cannot
 * see enough of it for a wave to read as a wave. Widening the vertical angle
 * until the horizontal one clears this keeps the horizon where the design wants
 * it and gives the water somewhere to happen.
 */
export const MIN_HORIZONTAL_FOV = 46
/** Past this the edges distort more than the extra width is worth. */
const MAX_VERTICAL_FOV = 82

export function verticalFovFor(aspect: number): number {
  if (!Number.isFinite(aspect) || aspect <= 0) return FIELD_OF_VIEW
  const halfHorizontal = (MIN_HORIZONTAL_FOV / 2) * (Math.PI / 180)
  const needed = 2 * Math.atan(Math.tan(halfHorizontal) / aspect) * (180 / Math.PI)
  return Math.min(MAX_VERTICAL_FOV, Math.max(FIELD_OF_VIEW, needed))
}

/**
 * The default framing: low on the surface, close to it, horizon a third of the
 * way down.
 *
 * The camera's height is derived from the field of view rather than fixed, so
 * the horizon lands in the same place on every shape of screen. A fixed height
 * put it dead centre on a portrait phone — which is not the shot, and which
 * hides most of the water by looking straight along it instead of over it.
 */
export function defaultCameraPosition(aspect: number, into = new Vector3()): Vector3 {
  const halfFov = (verticalFovFor(aspect) / 2) * (Math.PI / 180)
  const pitch = halfFov * 2 * (0.5 - HORIZON_FRACTION)
  return into.set(0, DEFAULT_DISTANCE * Math.tan(pitch), DEFAULT_DISTANCE)
}

export function createCamera(aspect: number): PerspectiveCamera {
  const camera = new PerspectiveCamera(verticalFovFor(aspect), aspect, 0.1, 20000)
  camera.position.copy(defaultCameraPosition(aspect))
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

  defaultCameraPosition(camera.aspect, camera.position)
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
