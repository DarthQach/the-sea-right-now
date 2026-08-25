/**
 * The mesh the ocean is drawn on.
 *
 * A radial grid centred on the camera target, with ring spacing that grows
 * geometrically outward: centimetres of detail where the camera is low on the
 * surface, kilometres of coverage out to the horizon, for about a hundred
 * thousand vertices. A uniform plane fine enough for the near field would need
 * tens of millions to reach as far.
 */
import { BufferAttribute, BufferGeometry } from 'three/webgpu'

export interface RadialGridOptions {
  /** Rings from the centre outward. */
  radialSegments: number
  /** Spokes around the circle. */
  angularSegments: number
  innerRadius: number
  outerRadius: number
}

export function createRadialGrid(options: RadialGridOptions): BufferGeometry {
  const { radialSegments, angularSegments, innerRadius, outerRadius } = options

  // One extra ring at the centre so there is no hole under the camera.
  const vertexCount = radialSegments * angularSegments + 1
  const positions = new Float32Array(vertexCount * 3)
  const growth = Math.pow(outerRadius / innerRadius, 1 / (radialSegments - 1))

  // Vertex 0 is the centre.
  let cursor = 3
  for (let ring = 0; ring < radialSegments; ring += 1) {
    const radius = innerRadius * Math.pow(growth, ring)
    for (let spoke = 0; spoke < angularSegments; spoke += 1) {
      const angle = (spoke / angularSegments) * Math.PI * 2
      positions[cursor] = Math.cos(angle) * radius
      positions[cursor + 1] = 0
      positions[cursor + 2] = Math.sin(angle) * radius
      cursor += 3
    }
  }

  const triangleCount = angularSegments + (radialSegments - 1) * angularSegments * 2
  const indices = new Uint32Array(triangleCount * 3)
  let out = 0

  // Fan from the centre to the innermost ring.
  for (let spoke = 0; spoke < angularSegments; spoke += 1) {
    indices[out++] = 0
    indices[out++] = 1 + spoke
    indices[out++] = 1 + ((spoke + 1) % angularSegments)
  }

  // Quads between successive rings.
  for (let ring = 0; ring < radialSegments - 1; ring += 1) {
    const inner = 1 + ring * angularSegments
    const outer = inner + angularSegments
    for (let spoke = 0; spoke < angularSegments; spoke += 1) {
      const next = (spoke + 1) % angularSegments
      indices[out++] = inner + spoke
      indices[out++] = outer + spoke
      indices[out++] = outer + next

      indices[out++] = inner + spoke
      indices[out++] = outer + next
      indices[out++] = inner + next
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setIndex(new BufferAttribute(indices, 1))
  geometry.computeBoundingSphere()
  return geometry
}
