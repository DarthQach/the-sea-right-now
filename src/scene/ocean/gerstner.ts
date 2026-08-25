/**
 * The Gerstner ocean.
 *
 * A sum of travelling trochoidal waves, evaluated in the vertex stage. This is
 * the implementation that runs where WebGPU is absent: WebGL 2 has no compute
 * shaders, so the FFT path cannot run there, and three.js's automatic fallback
 * carries the interface and the globe across but not the ocean.
 *
 * It is driven by exactly the same `SpectrumParams` as the FFT ocean and
 * normalised to the same reported significant wave height, so the same reading
 * produces the same sea state on both paths — coarser, never different.
 */
import {
  Mesh,
  MeshBasicNodeMaterial,
  Vector2,
  Vector4,
  type Object3D,
} from 'three/webgpu'
import {
  Fn, Loop, cameraPosition, clamp, cos, float, length, normalize, positionLocal, positionWorld,
  smoothstep, sin, uniform, uniformArray, varyingProperty, vec2, vec3, vec4,
} from 'three/tsl'
import type { SpectrumParams } from '../../lib/spectrum'
import { lerpSpectrumParams } from '../../lib/spectrum'
import type { Ocean } from './types'
import { WAVE_COUNT, buildWaveTrain } from './wave-train'
import { createRadialGrid } from './grid'
import { shadeWater } from './water-shading'

/** Seconds to ease from one reading's sea state to the next. Readings land tens of minutes apart. */
export const TRANSITION_SECONDS = 8
/** The cold load is shorter: real, reading-driven water within about three seconds. */
export const FIRST_TRANSITION_SECONDS = 2.5

export interface GerstnerOptions {
  radialSegments: number
  angularSegments: number
  innerRadius: number
  outerRadius: number
}

/**
 * Deliberately lighter than the FFT path's mesh. This is the ocean for machines
 * without WebGPU — older laptops, software rasterisers — and every vertex here
 * costs a full sum over the wave train. Roughly 28,000 vertices rather than the
 * FFT path's 188,000, which is what keeps this honest on the hardware it exists
 * for.
 */
export const DEFAULT_GERSTNER_OPTIONS: GerstnerOptions = {
  radialSegments: 140,
  angularSegments: 200,
  innerRadius: 0.6,
  outerRadius: 5000,
}

export class GerstnerOcean implements Ocean {
  readonly kind = 'gerstner'
  readonly object: Object3D

  private readonly waveA: Vector4[]
  private readonly waveB: Vector4[]
  private readonly uTime = uniform(0)
  private readonly uCentre = uniform(new Vector2(0, 0))
  private readonly uMotionScale = uniform(1)
  private readonly mesh: Mesh
  private readonly material: MeshBasicNodeMaterial

  private from: SpectrumParams | null = null
  private to: SpectrumParams | null = null
  private transition = 1
  private transitionSeconds = TRANSITION_SECONDS
  private settled = false

  constructor(options: GerstnerOptions = DEFAULT_GERSTNER_OPTIONS) {
    this.waveA = Array.from({ length: WAVE_COUNT }, () => new Vector4(0, 0, 0, 1))
    this.waveB = Array.from({ length: WAVE_COUNT }, () => new Vector4(0, 0, 1, 0))

    const waveA = uniformArray(this.waveA, 'vec4' as const)
    const waveB = uniformArray(this.waveB, 'vec4' as const)

    // How far apart neighbouring vertices are, as a fraction of their distance
    // from the centre. Waves shorter than a few vertex spacings would alias into
    // noise, so they are faded out with distance instead.
    const growth = Math.pow(options.outerRadius / options.innerRadius, 1 / (options.radialSegments - 1))
    const spacingFactor = Math.max(growth - 1, (2 * Math.PI) / options.angularSegments)

    const vNormal = varyingProperty('vec3', 'vOceanNormal')
    const vFoam = varyingProperty('float', 'vOceanFoam')
    const vHeight = varyingProperty('float', 'vOceanHeight')

    const uTime = this.uTime
    const uCentre = this.uCentre
    const uMotionScale = this.uMotionScale

    const surface = Fn(() => {
      const local = positionLocal.xz.toVar()
      const world = local.add(vec2(uCentre.x, uCentre.y)).toVar()
      const distance = length(local).toVar()
      const spacing = distance.mul(spacingFactor).add(0.05).toVar()

      const displacement = vec3(0, 0, 0).toVar()
      // Partial derivatives of the displaced position, for an analytic normal.
      const tangentX = vec3(1, 0, 0).toVar()
      const tangentZ = vec3(0, 0, 1).toVar()

      Loop(WAVE_COUNT, ({ i }) => {
        const a = waveA.element(i)
        const b = waveB.element(i)

        const kx = a.x
        const kz = a.y
        const amplitude = a.z.mul(uMotionScale)
        const omega = a.w
        const phase = b.x
        const steepness = b.y
        const wavelength = b.z

        // Fade a wave out where the mesh can no longer resolve it.
        const resolve = smoothstep(spacing.mul(3), spacing.mul(9), wavelength)
        const amp = amplitude.mul(resolve)

        const k = vec2(kx, kz)
        const kLength = length(k).max(1e-6)
        const unit = k.div(kLength)

        const theta = world.x.mul(kx).add(world.y.mul(kz)).sub(omega.mul(uTime)).add(phase)
        const sinTheta = sin(theta)
        const cosTheta = cos(theta)

        const qa = steepness.mul(amp)

        displacement.addAssign(vec3(unit.x.mul(qa).mul(sinTheta).negate(), amp.mul(cosTheta), unit.y.mul(qa).mul(sinTheta).negate()))

        // d/dx of the above. dTheta/dx = kx, dTheta/dz = kz.
        tangentX.addAssign(
          vec3(unit.x.mul(qa).mul(kx).mul(cosTheta).negate(), amp.mul(kx).mul(sinTheta).negate(), unit.y.mul(qa).mul(kx).mul(cosTheta).negate()),
        )
        tangentZ.addAssign(
          vec3(unit.x.mul(qa).mul(kz).mul(cosTheta).negate(), amp.mul(kz).mul(sinTheta).negate(), unit.y.mul(qa).mul(kz).mul(cosTheta).negate()),
        )
      })

      const normal = normalize(tangentZ.cross(tangentX))

      // The horizontal Jacobian. Below 1 the surface is compressing; where it
      // approaches zero the wave is folding over on itself, which is where foam
      // actually forms.
      const jacobian = tangentX.x.mul(tangentZ.z).sub(tangentX.z.mul(tangentZ.x))
      const foam = clamp(smoothstep(float(0.62), float(0.05), jacobian), 0, 1)

      vNormal.assign(normal)
      vFoam.assign(foam)
      vHeight.assign(displacement.y)

      return vec3(positionLocal.x.add(displacement.x), displacement.y, positionLocal.z.add(displacement.z))
    })

    const material = new MeshBasicNodeMaterial()
    material.positionNode = surface()
    material.colorNode = Fn(() => {
      const viewDir = normalize(cameraPosition.sub(positionWorld))
      // Detail is unresolvable long before the mesh edge; fade to sky there.
      const depthFade = clamp(smoothstep(float(options.outerRadius * 0.9), float(60), length(positionWorld.xz.sub(vec2(uCentre.x, uCentre.y)))), 0, 1)
      return vec4(shadeWater(vNormal, viewDir, vHeight, vFoam, depthFade), 1)
    })()
    material.transparent = false
    material.depthWrite = true

    this.material = material
    this.mesh = new Mesh(createRadialGrid(options), material)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 0
    this.object = this.mesh
  }

  setParams(params: SpectrumParams): void {
    if (this.to === null) {
      this.from = params
      this.to = params
      this.transition = 1
      this.transitionSeconds = TRANSITION_SECONDS
      this.writeWaves(params)
      return
    }
    // Ease from wherever the surface currently is, not from the last reading —
    // a second reading arriving mid-transition must not snap backwards.
    this.from = lerpSpectrumParams(this.from ?? this.to, this.to, this.transition)
    this.to = params
    this.transition = 0
    // The very first reading arrives over the cold-load state, and the product
    // promises real water within about three seconds. Later readings land tens
    // of minutes apart and get the long, unhurried ease.
    this.transitionSeconds = this.settled ? TRANSITION_SECONDS : FIRST_TRANSITION_SECONDS
    this.settled = true
  }

  setMotionScale(scale: number): void {
    this.uMotionScale.value = scale
  }

  setCentre(x: number, z: number): void {
    this.uCentre.value.set(x, z)
    this.mesh.position.set(x, 0, z)
  }

  update(elapsedSeconds: number, deltaSeconds: number): void {
    this.uTime.value = elapsedSeconds

    if (this.transition < 1 && this.from !== null && this.to !== null) {
      this.transition = Math.min(1, this.transition + deltaSeconds / this.transitionSeconds)
      // Smoothstep so the sea eases in and out rather than starting abruptly.
      const t = this.transition * this.transition * (3 - 2 * this.transition)
      this.writeWaves(lerpSpectrumParams(this.from, this.to, t))
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    this.material.dispose()
  }

  private writeWaves(params: SpectrumParams): void {
    const train = buildWaveTrain(params)
    for (let i = 0; i < WAVE_COUNT; i += 1) {
      this.waveA[i]?.set(
        train.primary[i * 4] ?? 0,
        train.primary[i * 4 + 1] ?? 0,
        train.primary[i * 4 + 2] ?? 0,
        train.primary[i * 4 + 3] ?? 1,
      )
      this.waveB[i]?.set(
        train.secondary[i * 4] ?? 0,
        train.secondary[i * 4 + 1] ?? 0,
        train.secondary[i * 4 + 2] ?? 1,
        0,
      )
    }
    this.material.needsUpdate = false
  }
}
