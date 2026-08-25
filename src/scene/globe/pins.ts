/**
 * The station pins.
 *
 * Three states that must stay distinguishable with the colour removed, so each
 * differs in fill, size *and* ring: a live station is a solid dot inside a faint
 * ring, a stale one is a hollow ring, a dead one is a smaller, fainter ring.
 *
 * Four instanced meshes carry all 1,275 of them, so the whole network is one
 * handful of draw calls.
 */
import {
  Color, InstancedMesh, Matrix4, Object3D, Quaternion, RingGeometry, SphereGeometry, Vector3,
  MeshBasicNodeMaterial, DoubleSide, type Object3D as Object3DType,
} from 'three/webgpu'
import type { Station } from '../../lib/shared/types'
import type { StationStatus } from '../../lib/station-status'
import { latLonToVector } from '../../lib/geo'

export const GLOBE_RADIUS = 1

const LIVE_COLOUR = new Color('#ffb45a')
const STALE_COLOUR = new Color('#8fa3b0')
const DEAD_COLOUR = new Color('#5a6670')

/** Pins sit just off the surface so they are never z-fighting with the land. */
const PIN_ALTITUDE = 1.004

export interface PinLayer {
  mesh: InstancedMesh
  /** Station index in the source array, per instance. */
  stationIndices: number[]
}

export interface PinSet {
  object: Object3DType
  layers: PinLayer[]
  dispose(): void
}

function ringMaterial(colour: Color, opacity: number): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial()
  material.color = colour
  material.side = DoubleSide
  material.transparent = opacity < 1
  material.opacity = opacity
  material.depthWrite = false
  return material
}

export function createPins(stations: Station[], statusOf: (station: Station) => StationStatus): PinSet {
  const group = new Object3D()

  const buckets: Record<StationStatus, number[]> = { live: [], stale: [], dead: [] }
  stations.forEach((station, index) => {
    buckets[statusOf(station)].push(index)
  })

  const layers: PinLayer[] = []

  // A solid dot for live stations, plus a ring around it. Both are needed: the
  // ring is what still reads when the colour is gone.
  layers.push(
    build(new SphereGeometry(0.0062, 8, 6), ringMaterial(LIVE_COLOUR, 1), buckets.live, stations, 1),
    build(new RingGeometry(0.0098, 0.0126, 20), ringMaterial(LIVE_COLOUR, 0.4), buckets.live, stations, 1, true),
    build(new RingGeometry(0.0074, 0.0102, 18), ringMaterial(STALE_COLOUR, 0.8), buckets.stale, stations, 1, true),
    build(new RingGeometry(0.0046, 0.0066, 14), ringMaterial(DEAD_COLOUR, 0.5), buckets.dead, stations, 1, true),
  )

  for (const layer of layers) group.add(layer.mesh)

  return {
    object: group,
    layers,
    dispose() {
      for (const layer of layers) {
        layer.mesh.geometry.dispose()
        ;(layer.mesh.material as MeshBasicNodeMaterial).dispose()
      }
    },
  }
}

const matrix = new Matrix4()
const position = new Vector3()
const quaternion = new Quaternion()
const scale = new Vector3(1, 1, 1)
const outward = new Vector3(0, 0, 1)
const normal = new Vector3()

function build(
  geometry: SphereGeometry | RingGeometry,
  material: MeshBasicNodeMaterial,
  indices: number[],
  stations: Station[],
  sizeScale: number,
  faceOutward = false,
): PinLayer {
  const mesh = new InstancedMesh(geometry, material, Math.max(1, indices.length))
  mesh.count = indices.length
  mesh.frustumCulled = false

  indices.forEach((stationIndex, instance) => {
    const station = stations[stationIndex]
    if (station === undefined) return
    const point = latLonToVector(station.lat, station.lon, PIN_ALTITUDE)
    position.set(point.x, point.y, point.z)

    if (faceOutward) {
      normal.copy(position).normalize()
      quaternion.setFromUnitVectors(outward, normal)
    } else {
      quaternion.identity()
    }

    scale.setScalar(sizeScale)
    matrix.compose(position, quaternion, scale)
    mesh.setMatrixAt(instance, matrix)
  })

  mesh.instanceMatrix.needsUpdate = true
  return { mesh, stationIndices: indices }
}
