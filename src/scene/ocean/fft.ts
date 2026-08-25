/**
 * The FFT ocean — the high-fidelity path, and the one this project is really
 * about.
 *
 * Fill a grid with wave energy in the frequency domain, run an inverse Fast
 * Fourier Transform, and out comes a height field. Do it three times at three
 * scales and add the results, and you have an ocean whose swell, chop and fine
 * texture all come from the same measured spectrum. All of it runs as compute
 * shaders on the visitor's GPU, every frame. The server renders nothing.
 *
 * This needs compute shaders, so it is the WebGPU path only. WebGL 2 has none,
 * which is why `GerstnerOcean` exists.
 *
 * Per frame: one kernel builds and time-evolves the spectrum, sixteen run the
 * butterfly passes, and three assemble the results into textures the surface
 * material samples. Twenty dispatches, all with their constants baked in so no
 * uniform has to change mid-pass.
 */
import {
  HalfFloatType,
  LinearFilter,
  Mesh,
  MeshBasicNodeMaterial,
  RGBAFormat,
  RepeatWrapping,
  StorageBufferAttribute,
  StorageTexture,
  Vector2,
  Vector4,
  type ComputeNode,
  type Object3D,
  type WebGPURenderer,
} from 'three/webgpu'
import {
  Fn, If, cameraPosition, clamp, cos, dot, exp, float, fract, instanceIndex, length, log, max,
  normalize, positionLocal, positionWorld, pow, sin, smoothstep, sqrt, storage, texture,
  textureStore, uint, uniform, uniformArray, varyingProperty, vec2, vec3, vec4,
} from 'three/tsl'
import type { SpectrumParams } from '../../lib/spectrum'
import {
  CASCADE_BOUNDARY_WAVELENGTHS_M, DEFAULT_CASCADES, GRAVITY, directionalExponent, lerpSpectrumParams,
  spectrumEnergyScale, travelDirectionRad,
} from '../../lib/spectrum'
import { COMPONENT_COUNT } from './wave-train'
import type { Ocean } from './types'
import { createRadialGrid } from './grid'
import { shadeWater } from './water-shading'
import {
  CASCADE_COUNT, FFT_SIZE, FFT_STEPS, LOOP_PERIOD_SECONDS, buildButterflyTable, cascadeBounds,
  cascadeShortestWavelength,
} from './fft-math'
import { FIRST_TRANSITION_SECONDS, TRANSITION_SECONDS } from './gerstner'
import type { Float, Vec2 } from '../tsl'

const CELLS = FFT_SIZE * FFT_SIZE
/** Two packed fields per cascade: (Dx, Dy, Dz, Dyx) and (Dyz, Dxx, Dzz, Dxz). */
const FIELDS = 2
const BUFFER_ELEMENTS = FIELDS * CASCADE_COUNT * CELLS

/** Horizontal displacement scale. Above about 1.2 the surface starts to fold into itself. */
const CHOPPINESS = 1.15

export function fftSupported(renderer: WebGPURenderer): boolean {
  return 'isWebGPUBackend' in renderer.backend && renderer.backend.isWebGPUBackend === true
}

/**
 * A hash with no trigonometry in it, for the Gaussian random numbers the initial
 * spectrum needs. Trig-based hashes lose precision differently on different
 * GPUs; this one does not, so the same reading gives the same sea everywhere.
 */
const hash21 = /*@__PURE__*/ Fn(([p]: [Vec2]) => {
  const p3 = fract(vec3(p.x, p.y, p.x).mul(0.1031)).toVar()
  p3.addAssign(dot(p3, vec3(p3.y, p3.z, p3.x).add(33.33)))
  return fract(p3.x.add(p3.y).mul(p3.z))
})

/** Box–Muller: two independent standard normals from two uniforms. */
const gaussianPair = /*@__PURE__*/ Fn(([p]: [Vec2]) => {
  const u1 = max(hash21(p), float(1e-6))
  const u2 = hash21(p.add(vec2(17.13, 91.77)))
  const radius = sqrt(log(u1).mul(-2))
  const angle = u2.mul(Math.PI * 2)
  return vec2(radius.mul(cos(angle)), radius.mul(sin(angle)))
})

export class FftOcean implements Ocean {
  readonly kind = 'fft'
  readonly object: Object3D

  private readonly renderer: WebGPURenderer
  private readonly kernels: ComputeNode[]
  private readonly displacementTextures: StorageTexture[] = []
  private readonly derivativeTextures: StorageTexture[] = []

  private readonly uTime = uniform(0)
  private readonly uCentre = uniform(new Vector2(0, 0))
  private readonly uMotionScale = uniform(1)
  private readonly uDepth = uniform(1000)
  /**
   * One entry per wave system — the swell and the wind sea. Each holds
   * (peak period, energy scale, directional exponent, peak enhancement); the
   * direction sits alongside in `componentDirections` because a vec4 has no
   * room left.
   */
  private readonly componentShape: Vector4[]
  private readonly componentDirections: Vector2[]
  private readonly cascadeInfo: Vector4[]

  private readonly mesh: Mesh
  private readonly material: MeshBasicNodeMaterial

  private from: SpectrumParams | null = null
  private to: SpectrumParams | null = null
  private transition = 1
  private transitionSeconds = TRANSITION_SECONDS
  private settled = false

  constructor(
    renderer: WebGPURenderer,
    patchSizes: number[] = DEFAULT_CASCADES.map((cascade) => cascade.lengthM),
    boundaryWavelengths: number[] = CASCADE_BOUNDARY_WAVELENGTHS_M,
  ) {
    this.renderer = renderer

    // (patch size, band low k, band high k, shortest wavelength carried)
    const bounds = cascadeBounds(boundaryWavelengths)
    this.cascadeInfo = patchSizes.map((size, i) => {
      const band = bounds[i]
      return new Vector4(
        size,
        band?.low ?? 0,
        band === undefined || !Number.isFinite(band.high) ? 1e6 : band.high,
        cascadeShortestWavelength(boundaryWavelengths, i, size),
      )
    })
    const cascadeInfo = uniformArray(this.cascadeInfo, 'vec4' as const)

    this.componentShape = [new Vector4(10, 0, 1, 3.3), new Vector4(5, 0, 1, 3.3)]
    this.componentDirections = [new Vector2(0, 1), new Vector2(0, 1)]
    const componentShape = uniformArray(this.componentShape, 'vec4' as const)
    const componentDirections = uniformArray(this.componentDirections, 'vec2' as const)

    const butterflyAttribute = new StorageBufferAttribute(buildButterflyTable(FFT_SIZE), 4)
    const butterfly = storage(butterflyAttribute, 'vec4', FFT_STEPS * FFT_SIZE).toReadOnly()

    const pingAttribute = new StorageBufferAttribute(new Float32Array(BUFFER_ELEMENTS * 4), 4)
    const pongAttribute = new StorageBufferAttribute(new Float32Array(BUFFER_ELEMENTS * 4), 4)
    const ping = storage(pingAttribute, 'vec4', BUFFER_ELEMENTS)
    const pong = storage(pongAttribute, 'vec4', BUFFER_ELEMENTS)

    for (let i = 0; i < CASCADE_COUNT; i += 1) {
      this.displacementTextures.push(createOutputTexture())
      this.derivativeTextures.push(createOutputTexture())
    }

    const { uTime, uDepth, uMotionScale } = this

    /** The two wave systems summed. Their variances add, as variances do. */
    const totalEnergy = (kLength: Float, kx: Float, kz: Float, omega: Float, patch: Float) => {
      let sum: Float | null = null
      for (let component = 0; component < COMPONENT_COUNT; component += 1) {
        const shape = componentShape.element(component)
        const direction = componentDirections.element(component)
        const term = spectrumEnergy(
          omega, kLength, kx, kz, patch,
          shape.y, shape.x, direction, shape.z, uDepth, shape.w,
        )
        sum = sum === null ? term : sum.add(term)
      }
      return sum ?? float(0)
    }

    // ── Kernel 1: build the spectrum and evolve it to the current time ────────
    const spectrum = Fn(() => {
      const index = instanceIndex
      const x = index.mod(uint(FFT_SIZE)).toVar()
      const y = index.div(uint(FFT_SIZE)).mod(uint(FFT_SIZE)).toVar()
      const cascade = index.div(uint(CELLS)).toVar()

      const info = cascadeInfo.element(cascade.toInt())
      const patch = info.x
      const bandLow = info.y
      const bandHigh = info.z

      const half = float(FFT_SIZE / 2)
      const n = x.toFloat().sub(half)
      const m = y.toFloat().sub(half)
      const deltaK = float(Math.PI * 2).div(patch)
      const kx = n.mul(deltaK).toVar()
      const kz = m.mul(deltaK).toVar()
      const kLength = sqrt(kx.mul(kx).add(kz.mul(kz))).toVar()

      const amplitude = vec2(0, 0).toVar()
      const amplitudeConjugate = vec2(0, 0).toVar()
      // The true dispersion relation, used for the spectrum.
      const omega = sqrt(float(GRAVITY).mul(max(kLength, float(1e-6)))).toVar()
      // And the same frequency snapped to a multiple of 2*pi/T, used only for
      // the phase, which is what makes the whole surface periodic in time.
      //
      // These must not be the same number. Feeding the snapped frequency into
      // the spectrum shifts cells off a narrow swell peak and throws away most
      // of its energy: a JONSWAP peak at 15 seconds is about as wide as the
      // snapping step, so the coarsest cascade came out five times too flat.
      const omegaLoop = float(0).toVar()

      If(kLength.greaterThan(1e-5).and(kLength.greaterThanEqual(bandLow)).and(kLength.lessThan(bandHigh)), () => {
        const omegaStep = float((Math.PI * 2) / LOOP_PERIOD_SECONDS)
        omegaLoop.assign(omega.div(omegaStep).floor().mul(omegaStep))

        const energy = totalEnergy(kLength, kx, kz, omega, patch)

        const seed = vec2(x.toFloat(), y.toFloat()).add(cascade.toFloat().mul(311.7))
        const noise = gaussianPair(seed)
        amplitude.assign(noise.mul(sqrt(energy.mul(0.5))))

        // The mirrored grid point carries h0(-k); together they make the field
        // Hermitian, which is what makes the inverse transform come out real.
        const mx = uint(FFT_SIZE).sub(x).mod(uint(FFT_SIZE))
        const my = uint(FFT_SIZE).sub(y).mod(uint(FFT_SIZE))
        const mirrorSeed = vec2(mx.toFloat(), my.toFloat()).add(cascade.toFloat().mul(311.7))
        const mirrorNoise = gaussianPair(mirrorSeed)
        const mirrorEnergy = totalEnergy(kLength, kx.negate(), kz.negate(), omega, patch)
        amplitudeConjugate.assign(mirrorNoise.mul(sqrt(mirrorEnergy.mul(0.5))))
      })

      // h(k, t) = h0 e^{iwt} + conj(h0(-k)) e^{-iwt}
      const phase = omegaLoop.mul(uTime)
      const rotation = vec2(cos(phase), sin(phase))
      const forward = complexMultiply(amplitude, rotation)
      const backward = complexMultiply(vec2(amplitudeConjugate.x, amplitudeConjugate.y.negate()), vec2(rotation.x, rotation.y.negate()))
      const h = forward.add(backward).mul(uMotionScale).toVar()

      const inverseK = float(1).div(max(kLength, float(1e-5)))

      // Horizontal displacement and the derivatives the normal and the foam
      // need. Multiplying a spectrum by i is a quarter turn: (a, b) -> (-b, a).
      const dx = complexTimesI(h).mul(kx.mul(inverseK)).negate()
      const dz = complexTimesI(h).mul(kz.mul(inverseK)).negate()
      const dyx = complexTimesI(h).mul(kx)
      const dyz = complexTimesI(h).mul(kz)
      const dxx = h.mul(kx.mul(kx).mul(inverseK)).negate()
      const dzz = h.mul(kz.mul(kz).mul(inverseK)).negate()
      const dxz = h.mul(kx.mul(kz).mul(inverseK)).negate()

      // Two real fields ride in one complex transform: IFFT(A + iB) = a + ib.
      const cell = cascade.mul(uint(CELLS)).add(y.mul(uint(FFT_SIZE))).add(x)
      ping.element(cell).assign(vec4(packPair(dx, h), packPair(dz, dyx)))
      ping.element(cell.add(uint(CASCADE_COUNT * CELLS))).assign(vec4(packPair(dyz, dxx), packPair(dzz, dxz)))
    })().compute(CASCADE_COUNT * CELLS)

    // ── Kernels 2…17: the butterfly passes ───────────────────────────────────
    const passes: ComputeNode[] = []
    for (let axis = 0; axis < 2; axis += 1) {
      for (let step = 0; step < FFT_STEPS; step += 1) {
        // Step order alternates the ping-pong, and both axes run an even number
        // of steps, so the result always lands back in `ping`.
        const forward = step % 2 === 0
        const source = forward ? ping : pong
        const destination = forward ? pong : ping
        passes.push(butterflyPass(source, destination, butterfly, step, axis === 0))
      }
    }

    // ── Kernels 18…20: write the results into textures the material samples ──
    const assembles: ComputeNode[] = []
    for (let cascade = 0; cascade < CASCADE_COUNT; cascade += 1) {
      const displacementTexture = this.displacementTextures[cascade]
      const derivativeTexture = this.derivativeTextures[cascade]
      if (displacementTexture === undefined || derivativeTexture === undefined) continue

      assembles.push(
        Fn(() => {
          const index = instanceIndex
          const x = index.mod(uint(FFT_SIZE))
          const y = index.div(uint(FFT_SIZE))
          const cell = uint(cascade * CELLS).add(y.mul(uint(FFT_SIZE))).add(x)

          const a = ping.element(cell)
          const b = ping.element(cell.add(uint(CASCADE_COUNT * CELLS)))

          // The spectrum was centred on k = 0, so the transform comes out with
          // its origin in the corner. This puts it back.
          const parity = x.add(y).mod(uint(2)).toFloat()
          const sign = float(1).sub(parity.mul(2))

          const displacementX = a.x.mul(sign).mul(CHOPPINESS)
          const height = a.y.mul(sign)
          const displacementZ = a.z.mul(sign).mul(CHOPPINESS)
          const slopeX = a.w.mul(sign)
          const slopeZ = b.x.mul(sign)
          const dxx = b.y.mul(sign).mul(CHOPPINESS)
          const dzz = b.z.mul(sign).mul(CHOPPINESS)
          const dxz = b.w.mul(sign).mul(CHOPPINESS)

          // The Jacobian of the horizontal displacement. Below zero the surface
          // has folded over itself, which is where foam actually forms.
          const jacobian = float(1).add(dxx).mul(float(1).add(dzz)).sub(dxz.mul(dxz))

          textureStore(displacementTexture, vec2(x, y), vec4(displacementX, height, displacementZ, 1)).toWriteOnly()
          textureStore(derivativeTexture, vec2(x, y), vec4(slopeX, slopeZ, jacobian, 1)).toWriteOnly()
        })().compute(CELLS),
      )
    }

    this.kernels = [spectrum, ...passes, ...assembles]

    // ── The surface material ─────────────────────────────────────────────────
    // The mesh is a radial grid: fine near the camera, coarse out to the
    // horizon. A cascade whose shortest wavelength the local vertex spacing can
    // no longer resolve is faded out rather than sampled, because sampling it
    // turns distant water into a field of spikes.
    const options = { radialSegments: 420, angularSegments: 448, innerRadius: 0.45, outerRadius: 4200 }
    const growth = Math.pow(options.outerRadius / options.innerRadius, 1 / (options.radialSegments - 1))
    const spacingFactor = Math.max(growth - 1, (2 * Math.PI) / options.angularSegments)

    const vFoam = varyingProperty('float', 'vOceanFoam')
    const vHeight = varyingProperty('float', 'vOceanHeight')
    // The undisplaced position, so the fragment stage can sample the derivative
    // textures at the same place the vertex stage sampled the displacement.
    const vSample = varyingProperty('vec2', 'vOceanSample')
    const vResolve = varyingProperty('vec3', 'vOceanResolve')

    const displacementSamplers = this.displacementTextures.map((tex) => texture(tex))
    const derivativeSamplers = this.derivativeTextures.map((tex) => texture(tex))
    const uCentre = this.uCentre
    const cascades = this.cascadeInfo

    const surface = Fn(() => {
      const local = positionLocal.xz.toVar()
      const world = local.add(vec2(uCentre.x, uCentre.y)).toVar()
      const spacing = length(local).mul(spacingFactor).add(0.04).toVar()

      const displacement = vec3(0, 0, 0).toVar()
      const resolve = vec3(0, 0, 0).toVar()

      for (let i = 0; i < CASCADE_COUNT; i += 1) {
        const info = cascades[i]
        const sampler = displacementSamplers[i]
        if (info === undefined || sampler === undefined) continue

        const shortest = info.w
        // Full strength while four vertices span the shortest wave this cascade
        // carries; gone by the time one vertex has to stand for a whole one.
        const weight = clamp(smoothstep(shortest, shortest * 0.25, spacing), 0, 1)
        const uvNode = world.div(info.x)
        displacement.addAssign(sampler.sample(uvNode).xyz.mul(weight))
        if (i === 0) resolve.x = weight
        else if (i === 1) resolve.y = weight
        else resolve.z = weight
      }

      vSample.assign(world)
      vHeight.assign(displacement.y)
      vResolve.assign(resolve)
      vFoam.assign(float(0))

      return vec3(positionLocal.x.add(displacement.x), displacement.y, positionLocal.z.add(displacement.z))
    })

    const material = new MeshBasicNodeMaterial()
    material.positionNode = surface()
    material.colorNode = Fn(() => {
      const slope = vec2(0, 0).toVar()
      const folding = float(0).toVar()

      for (let i = 0; i < CASCADE_COUNT; i += 1) {
        const info = cascades[i]
        const derivative = derivativeSamplers[i]
        if (info === undefined || derivative === undefined) continue
        const weight = i === 0 ? vResolve.x : i === 1 ? vResolve.y : vResolve.z
        const d = derivative.sample(vSample.div(info.x))
        slope.addAssign(d.xy.mul(weight))
        // The Jacobian sits near 1 on calm water and drops toward zero where the
        // surface folds over itself, which is where foam actually forms.
        folding.addAssign(max(float(0.55).sub(d.z), float(0)).mul(weight))
      }

      const normal = normalize(vec3(slope.x.negate(), 1, slope.y.negate()))
      const foam = clamp(folding.mul(2.4), 0, 1)

      const viewDir = normalize(cameraPosition.sub(positionWorld))
      const distance = length(positionWorld.xz.sub(vec2(uCentre.x, uCentre.y)))
      const depthFade = clamp(smoothstep(float(options.outerRadius * 0.75), float(350), distance), 0, 1)

      return vec4(shadeWater(normal, viewDir, vHeight, foam.mul(depthFade), depthFade), 1)
    })()

    this.material = material
    this.mesh = new Mesh(createRadialGrid(options), material)
    this.mesh.frustumCulled = false
    this.object = this.mesh
  }

  setParams(params: SpectrumParams): void {
    if (this.to === null) {
      this.from = params
      this.to = params
      this.transition = 1
      this.transitionSeconds = TRANSITION_SECONDS
      this.writeUniforms(params)
      return
    }
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
      const t = this.transition * this.transition * (3 - 2 * this.transition)
      this.writeUniforms(lerpSpectrumParams(this.from, this.to, t))
    }

    // One compute pass; WebGPU synchronises between the dispatches inside it.
    this.renderer.compute(this.kernels)
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    this.material.dispose()
    for (const tex of [...this.displacementTextures, ...this.derivativeTextures]) tex.dispose()
  }

  private writeUniforms(params: SpectrumParams): void {
    this.uDepth.value = params.depthM
    const components = [params.swell, params.windSea]
    components.forEach((component, i) => {
      const heading = travelDirectionRad(component.directionDeg)
      this.componentShape[i]?.set(
        Math.max(0.5, component.peakPeriodS),
        spectrumEnergyScale(component, params.depthM),
        directionalExponent(component.directionalSpread),
        component.peakEnhancement,
      )
      this.componentDirections[i]?.set(Math.sin(heading), Math.cos(heading))
    })
  }
}

function createOutputTexture(): StorageTexture {
  const tex = new StorageTexture(FFT_SIZE, FFT_SIZE)
  // Half float rather than full: 32-bit float textures are not filterable in
  // WebGPU without an optional feature, and the surface needs bilinear sampling.
  tex.type = HalfFloatType
  tex.format = RGBAFormat
  tex.minFilter = LinearFilter
  tex.magFilter = LinearFilter
  tex.wrapS = RepeatWrapping
  tex.wrapT = RepeatWrapping
  tex.generateMipmaps = false
  return tex
}

const complexMultiply = /*@__PURE__*/ Fn(([a, b]: [Vec2, Vec2]) =>
  vec2(a.x.mul(b.x).sub(a.y.mul(b.y)), a.x.mul(b.y).add(a.y.mul(b.x))),
)

/** Multiplying by i is a quarter turn in the complex plane. */
const complexTimesI = /*@__PURE__*/ Fn(([a]: [Vec2]) => vec2(a.y.negate(), a.x))

/** Packs two complex spectra so one inverse transform returns both real fields. */
const packPair = /*@__PURE__*/ Fn(([a, b]: [Vec2, Vec2]) => vec2(a.x.sub(b.y), a.y.add(b.x)))

/**
 * The two-dimensional JONSWAP spectrum with the TMA depth correction and a
 * directional spread, expressed as variance per grid cell so the inverse
 * transform comes out in metres.
 *
 * `energyScale` carries the whole normalisation and is computed once per reading
 * on the CPU — see `spectrumEnergyScale`. Nothing here has a free constant in
 * it; the rendered significant wave height is the reported one.
 */
const spectrumEnergy = /*@__PURE__*/ Fn(
  ([omega, kLength, kx, kz, patch, energyScale, peakPeriod, direction, spreadExponent, depth, peakEnhancement]: [
    Float, Float, Float, Float, Float, Float, Float, Vec2, Float, Float, Float,
  ]) => {
    const omegaPeak = float(Math.PI * 2).div(peakPeriod)
    const sigma = omega.lessThanEqual(omegaPeak).select(float(0.07), float(0.09))
    const ratio = omegaPeak.div(omega)

    const base = float(GRAVITY * GRAVITY).div(pow(omega, float(5)))
    const shape = exp(pow(ratio, float(4)).mul(-1.25))
    const peakTerm = exp(pow(omega.sub(omegaPeak), float(2)).div(sigma.mul(sigma).mul(omegaPeak).mul(omegaPeak).mul(2)).negate())
    const jonswap = base.mul(shape).mul(pow(peakEnhancement, peakTerm))

    // Kitaigorodskii depth attenuation. Very close to 1 in the deep water every
    // NDBC buoy sits in, but implemented rather than assumed.
    const omegaH = omega.mul(sqrt(depth.div(float(GRAVITY))))
    const shallow = clamp(omegaH, 0, 2).toVar()
    const attenuation = shallow.lessThan(1).select(
      shallow.mul(shallow).mul(0.5),
      float(1).sub(float(2).sub(shallow).mul(float(2).sub(shallow)).mul(0.5)),
    )

    // Horvath/Hasselmann directional spread, cos^{2s}(theta / 2).
    const unit = vec2(kx, kz).div(max(kLength, float(1e-5)))
    const cosine = clamp(dot(unit, direction), -1, 1)
    const halfAngle = sqrt(max(cosine.mul(0.5).add(0.5), float(0)))
    const spreadTerm = pow(halfAngle, spreadExponent.mul(2))

    // Change of variable from frequency to wavenumber in deep water, and the
    // area of one cell of this cascade's grid.
    const jacobian = float(GRAVITY).div(omega.mul(2)).div(max(kLength, float(1e-5)))
    const deltaK = float(Math.PI * 2).div(patch)

    return jonswap.mul(attenuation).mul(spreadTerm).mul(jacobian).mul(deltaK).mul(deltaK).mul(energyScale)
  },
)

function butterflyPass(
  source: ReturnType<typeof storage<'vec4'>>,
  destination: ReturnType<typeof storage<'vec4'>>,
  butterfly: ReturnType<typeof storage<'vec4'>>,
  step: number,
  horizontal: boolean,
): ComputeNode {
  return Fn(() => {
    const index = instanceIndex
    const x = index.mod(uint(FFT_SIZE)).toVar()
    const y = index.div(uint(FFT_SIZE)).mod(uint(FFT_SIZE)).toVar()
    const slice = index.div(uint(CELLS)).toVar()
    const sliceBase = slice.mul(uint(CELLS))

    const along = horizontal ? x : y
    const data = butterfly.element(uint(step * FFT_SIZE).add(along).toInt())
    const twiddle = vec2(data.x, data.y)
    const indexA = data.z.toUint()
    const indexB = data.w.toUint()

    const cellA = horizontal
      ? sliceBase.add(y.mul(uint(FFT_SIZE))).add(indexA)
      : sliceBase.add(indexA.mul(uint(FFT_SIZE))).add(x)
    const cellB = horizontal
      ? sliceBase.add(y.mul(uint(FFT_SIZE))).add(indexB)
      : sliceBase.add(indexB.mul(uint(FFT_SIZE))).add(x)

    const a = source.element(cellA)
    const b = source.element(cellB)

    // Both complex slots in the vec4 go through the same butterfly.
    const lowFirst = vec2(a.x, a.y)
    const highFirst = complexMultiply(twiddle, vec2(b.x, b.y))
    const lowSecond = vec2(a.z, a.w)
    const highSecond = complexMultiply(twiddle, vec2(b.z, b.w))

    destination
      .element(sliceBase.add(y.mul(uint(FFT_SIZE))).add(x))
      .assign(vec4(lowFirst.add(highFirst), lowSecond.add(highSecond)))
  })().compute(FIELDS * CASCADE_COUNT * CELLS)
}

/** Re-exported so the scene can size the transition the same way both oceans do. */
export { FIRST_TRANSITION_SECONDS, TRANSITION_SECONDS }
