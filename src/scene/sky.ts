/**
 * The sky.
 *
 * A dome rather than a flat clear colour, so the horizon has somewhere to be and
 * the water has something to reflect. It uses the same `skyColour` function the
 * water reflects, so the two can never disagree.
 */
import { BackSide, Mesh, MeshBasicNodeMaterial, SphereGeometry, type Mesh as MeshType } from 'three/webgpu'
import { Fn, normalize, positionLocal, vec4 } from 'three/tsl'
import { skyColour } from './ocean/water-shading'

export function createSky(radius = 9000): MeshType {
  const material = new MeshBasicNodeMaterial()
  material.side = BackSide
  material.depthWrite = false
  material.colorNode = Fn(() => vec4(skyColour(normalize(positionLocal)), 1))()

  const mesh = new Mesh(new SphereGeometry(radius, 32, 24), material)
  mesh.frustumCulled = false
  mesh.renderOrder = -1
  return mesh
}
