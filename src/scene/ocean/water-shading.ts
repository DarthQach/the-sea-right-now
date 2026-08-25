/**
 * How water looks, shared by both ocean implementations.
 *
 * Deliberately physical rather than painterly: a dark body colour, a Fresnel
 * mix toward the sky that gets stronger at grazing angles, sun glint, a little
 * upward scattering through wave crests, and white where the surface is folding.
 * The design forbids gradients pretending to be water — this is the real
 * geometry being shaded, and nothing here is a picture of a wave.
 */
import { Color, Vector3 } from 'three/webgpu'
import {
  Fn, clamp, dot, exp, float, max, mix, normalize, pow, reflect, smoothstep, sub, vec3,
} from 'three/tsl'
import type { Float, Vec3 } from '../tsl'

/** Deep water, seen from above with no sky in it. */
export const DEEP_WATER = new Color('#06131e')
/** The colour light takes on its way through a wave crest. */
export const SCATTER_WATER = new Color('#123f4c')
export const FOAM_COLOUR = new Color('#dfe8ee')
/** Horizon sky. The scene is dark by design — panels sit over this. */
export const SKY_HORIZON = new Color('#31445c')
export const SKY_ZENITH = new Color('#0a1420')
export const SUN_COLOUR = new Color('#ffd9a8')

export const SUN_DIRECTION = new Vector3(0.35, 0.22, -0.91).normalize()

/** The sky a reflected ray sees. Also used for the dome and the fog colour. */
export const skyColour = /*@__PURE__*/ Fn(([direction]: [Vec3]) => {
  // A bright band hugging the horizon, falling away quickly with elevation, and
  // this is the single most important thing in the whole shading model.
  //
  // A wave face on a calm sea tilts the reflected ray by only a few degrees. If
  // the sky changes slowly with elevation, that ray lands on almost the same
  // colour and the surface reads as one flat sheet — which is exactly what this
  // looked like before, everywhere except the sun's glint. Concentrating the
  // sky's contrast into the first few degrees above the horizon is what turns a
  // few degrees of wave slope into a visible change, and it is also how the sky
  // over a real sea actually looks.
  const elevation = clamp(direction.y, -1, 1)
  const band = exp(max(elevation, float(0)).mul(-9))
  const base = mix(
    vec3(SKY_ZENITH.r, SKY_ZENITH.g, SKY_ZENITH.b),
    vec3(SKY_HORIZON.r, SKY_HORIZON.g, SKY_HORIZON.b),
    band,
  )

  // The sun, as a tight disc plus a wide, very faint halo. The exponents look
  // extreme because the frame is written in linear light and encoded to sRGB on
  // the way out, which stretches small values a long way — a gentler falloff
  // here reads as a blown-out blob covering a third of the sky.
  const alignment = max(dot(direction, vec3(SUN_DIRECTION.x, SUN_DIRECTION.y, SUN_DIRECTION.z)), 0)
  const disc = pow(alignment, float(4000))
  const halo = pow(alignment, float(48)).mul(0.035)
  return base.add(vec3(SUN_COLOUR.r, SUN_COLOUR.g, SUN_COLOUR.b).mul(disc.mul(1.4).add(halo)))
})

/**
 * @param normal   surface normal, world space
 * @param viewDir  normalised direction from the surface toward the camera
 * @param height   surface elevation in metres, for crest scattering
 * @param foam     0…1, from the surface Jacobian
 * @param depthFade 0…1, 1 near the camera and 0 at the horizon
 */
export const shadeWater = /*@__PURE__*/ Fn(
  ([normal, viewDir, height, foam, depthFade]: [Vec3, Vec3, Float, Float, Float]) => {
    const n = normalize(normal)
    const v = normalize(viewDir)
    const cosine = clamp(dot(n, v), 0.0001, 1)

    // Schlick, with water's F0 of about 0.02.
    const fresnel = float(0.02).add(sub(1, 0.02).mul(pow(sub(1, cosine), float(5))))

    const reflected = reflect(v.negate(), n)
    // The sea is always darker than the sky it reflects: some light refracts in
    // and does not come back, and a wave face is never a perfect mirror. Without
    // this the horizon disappears on a calm day, because the water and the sky
    // above it end up exactly the same colour.
    const sky = skyColour(reflected).mul(0.62)

    // Light scattering up through a crest: brighter where the water stands
    // high and where you are looking along the wave rather than down at it.
    const crest = smoothstep(float(0), float(1.6), height)
    const scatter = vec3(SCATTER_WATER.r, SCATTER_WATER.g, SCATTER_WATER.b).mul(crest.mul(0.6).add(0.04))

    const body = vec3(DEEP_WATER.r, DEEP_WATER.g, DEEP_WATER.b).add(scatter)
    const water = mix(body, sky, clamp(fresnel.mul(1.15), 0, 1))

    // Sun glint. Tight and bright — this is what reads as "water" more than
    // anything else in the frame.
    // Sun glint. On a calm sea this is most of what makes the surface legible
    // at all — a wave face tilted a couple of degrees either catches the sun or
    // does not, and that is the texture you actually see on real water.
    const glintAlignment = max(dot(reflected, vec3(SUN_DIRECTION.x, SUN_DIRECTION.y, SUN_DIRECTION.z)), 0)
    const glint = pow(glintAlignment, float(340)).mul(2.6).add(pow(glintAlignment, float(28)).mul(0.05))
    const withGlint = water.add(vec3(SUN_COLOUR.r, SUN_COLOUR.g, SUN_COLOUR.b).mul(glint).mul(depthFade))

    const foamed = mix(withGlint, vec3(FOAM_COLOUR.r, FOAM_COLOUR.g, FOAM_COLOUR.b), clamp(foam, 0, 1).mul(0.9))

    // Fade into the horizon so the mesh edge is never a visible line.
    return mix(vec3(SKY_HORIZON.r, SKY_HORIZON.g, SKY_HORIZON.b).mul(0.85), foamed, depthFade)
  },
)
