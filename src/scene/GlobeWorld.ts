/**
 * The globe: the whole NDBC network, at once.
 *
 * A dark world with every station on it, and the three status treatments visible
 * before anything is clicked. The pins cluster on US coasts, Hawaii, Alaska,
 * Puerto Rico and the Great Lakes, and much of the world's coastline has none —
 * that is an honest map of a real network, not missing data, and the interface
 * says whose network it is rather than leaving a visitor to wonder.
 */
import {
  Mesh, MeshBasicNodeMaterial, PerspectiveCamera, Raycaster, Scene, SphereGeometry, Vector2,
  Vector3, type WebGPURenderer,
} from 'three/webgpu'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { Fn, cameraPosition, clamp, dot, float, normalWorld, normalize, positionWorld, pow, texture, vec3, vec4 } from 'three/tsl'
import type { Station } from '../lib/shared/types'
import type { StationStatus } from '../lib/station-status'
import { latLonToVector } from '../lib/geo'
import { createLandTexture } from './globe/land-texture'
import { GLOBE_RADIUS, createPins, type PinSet } from './globe/pins'
import type { World } from './World'

export interface GlobeWorldOptions {
  renderer: WebGPURenderer
  element: HTMLElement
  aspect: number
  stations: Station[]
  statusOf: (station: Station) => StationStatus
  onHover?: (station: Station | null, screen: { x: number; y: number } | null) => void
  onSelect?: (station: Station) => void
}

/** Where the light comes from. Not a real sun position; a legible one. */
const SUN = { x: 0.55, y: 0.42, z: 0.72 }

/** How close a click has to land, as a fraction of the globe's radius. */
const PICK_TOLERANCE = 0.035

export class GlobeWorld implements World {
  readonly scene = new Scene()
  readonly camera: PerspectiveCamera

  private readonly controls: OrbitControls
  private readonly globe: Mesh
  private readonly stations: Station[]
  private readonly positions: Vector3[]
  private readonly element: HTMLElement
  private readonly raycaster = new Raycaster()
  private readonly pointer = new Vector2()
  private readonly options: GlobeWorldOptions

  private pins: PinSet
  private hovered: Station | null = null
  private viewport = { width: 1, height: 1 }
  private spinning = true

  constructor(options: GlobeWorldOptions) {
    this.options = options
    this.stations = options.stations
    this.element = options.element

    this.camera = new PerspectiveCamera(38, options.aspect, 0.05, 60)
    this.camera.position.set(-2.6, 1.25, 2.9)

    this.controls = new OrbitControls(this.camera, options.element)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.1
    this.controls.enablePan = false
    this.controls.minDistance = 1.45
    this.controls.maxDistance = 7
    this.controls.rotateSpeed = 0.42
    this.controls.zoomSpeed = 0.7
    this.controls.keys = { LEFT: 'ArrowLeft', UP: 'ArrowUp', RIGHT: 'ArrowRight', BOTTOM: 'ArrowDown' }
    this.controls.update()

    // A basic material with a hand-written terminator rather than a lit one:
    // the globe needs to read as a sphere, but nothing here should look like a
    // rendering of the Earth from space.
    const material = new MeshBasicNodeMaterial()
    const map = texture(createLandTexture())
    material.colorNode = Fn(() => {
      const facing = clamp(dot(normalize(normalWorld), vec3(SUN.x, SUN.y, SUN.z)).mul(0.5).add(0.5), 0, 1)
      const daylight = float(0.34).add(pow(facing, float(0.85)).mul(0.66))
      // A thin cool rim where the sphere turns away, which is what makes the
      // silhouette legible against a black page.
      const rim = pow(clamp(float(1).sub(dot(normalize(normalWorld), normalize(cameraPosition.sub(positionWorld)))), 0, 1), float(3.2))
      return vec4(map.mul(daylight).add(vec3(0.09, 0.14, 0.2).mul(rim).mul(0.5)), 1)
    })()
    this.globe = new Mesh(new SphereGeometry(GLOBE_RADIUS, 96, 64), material)
    this.scene.add(this.globe)

    this.pins = createPins(this.stations, options.statusOf)
    this.scene.add(this.pins.object)

    this.positions = this.stations.map((station) => {
      const point = latLonToVector(station.lat, station.lon, GLOBE_RADIUS)
      return new Vector3(point.x, point.y, point.z)
    })

    this.element.addEventListener('pointermove', this.onPointerMove)
    this.element.addEventListener('pointerdown', this.onPointerDown)
    this.element.addEventListener('pointerleave', this.onPointerLeave)
  }

  /** Turns the globe slowly until the visitor touches it, then leaves it alone. */
  private readonly stopSpin = () => {
    this.spinning = false
  }

  activate(): void {
    this.element.addEventListener('pointerdown', this.stopSpin, { once: true })
    this.element.addEventListener('wheel', this.stopSpin, { once: true, passive: true })
  }

  resize(width: number, height: number): void {
    this.viewport = { width, height }
    this.camera.aspect = width / Math.max(1, height)
    this.camera.updateProjectionMatrix()
  }

  update(_elapsedSeconds: number, deltaSeconds: number): void {
    if (this.spinning) {
      const angle = deltaSeconds * 0.035
      const { x, z } = this.camera.position
      this.camera.position.x = x * Math.cos(angle) - z * Math.sin(angle)
      this.camera.position.z = x * Math.sin(angle) + z * Math.cos(angle)
      this.camera.lookAt(0, 0, 0)
    }
    this.controls.update()
    this.reportHover()
  }

  /**
   * Recolours the pins. Called when a station the visitor opened turns out to
   * have a real reading age, which is better information than the index flag.
   */
  refreshPins(statusOf: (station: Station) => StationStatus): void {
    this.scene.remove(this.pins.object)
    this.pins.dispose()
    this.pins = createPins(this.stations, statusOf)
    this.scene.add(this.pins.object)
  }

  /** Frames the globe on one station, used when arriving from a station view. */
  focusOn(station: Station): void {
    const point = latLonToVector(station.lat, station.lon, 2.6)
    this.camera.position.set(point.x, point.y, point.z)
    this.controls.update()
    this.spinning = false
  }

  dispose(): void {
    this.element.removeEventListener('pointermove', this.onPointerMove)
    this.element.removeEventListener('pointerdown', this.onPointerDown)
    this.element.removeEventListener('pointerleave', this.onPointerLeave)
    this.element.removeEventListener('pointerdown', this.stopSpin)
    this.element.removeEventListener('wheel', this.stopSpin)
    this.controls.dispose()
    this.pins.dispose()
    this.globe.geometry.dispose()
    ;(this.globe.material as MeshBasicNodeMaterial).dispose()
    this.scene.clear()
  }

  private readonly onPointerMove = (event: PointerEvent) => {
    const rect = this.element.getBoundingClientRect()
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    this.hovered = this.pick()
  }

  private readonly onPointerLeave = () => {
    this.hovered = null
    this.options.onHover?.(null, null)
  }

  private readonly onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return
    const rect = this.element.getBoundingClientRect()
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    const station = this.pick()
    if (station !== null) this.options.onSelect?.(station)
  }

  /**
   * Which station is under the pointer.
   *
   * The ray is cast at the globe rather than at 1,275 tiny pins: the sphere is
   * one intersection test, and the nearest station to the point it hits is a
   * linear scan that costs nothing. It also means stations on the far side are
   * never picked, because the ray stops at the front surface.
   */
  private pick(): Station | null {
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const hits = this.raycaster.intersectObject(this.globe, false)
    const hit = hits[0]
    if (hit === undefined) return null

    const point = hit.point.clone().normalize()
    // The tolerance widens as the globe shrinks on screen, so a pin stays as
    // easy to hit zoomed out as zoomed in.
    const distance = this.camera.position.length()
    const tolerance = PICK_TOLERANCE * Math.max(1, distance / 2.4)

    let best: Station | null = null
    let bestDistance = tolerance

    for (let i = 0; i < this.positions.length; i += 1) {
      const candidate = this.positions[i]
      const station = this.stations[i]
      if (candidate === undefined || station === undefined) continue
      const d = candidate.distanceTo(point)
      if (d < bestDistance) {
        bestDistance = d
        best = station
      }
    }

    return best
  }

  private reportHover(): void {
    const station = this.hovered
    if (station === null) return

    const index = this.stations.indexOf(station)
    const position = this.positions[index]
    if (position === undefined) return

    // Hidden behind the globe: do not label it.
    const toCamera = this.camera.position.clone().normalize()
    if (position.dot(toCamera) < 0.02) {
      this.options.onHover?.(null, null)
      return
    }

    const projected = position.clone().multiplyScalar(1.02).project(this.camera)
    this.options.onHover?.(station, {
      x: ((projected.x + 1) / 2) * this.viewport.width,
      y: ((1 - projected.y) / 2) * this.viewport.height,
    })
  }
}
