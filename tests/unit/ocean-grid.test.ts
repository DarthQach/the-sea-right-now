import { describe, expect, it } from 'vitest'
import { createRadialGrid } from '../../src/scene/ocean/grid'

/**
 * A regression test, written for a bug that shipped.
 *
 * The radial grid's triangles were wound the obvious way — centre, spoke, next
 * spoke — which points every face downward. The surface is drawn with the
 * renderer's default back-face culling, so the entire ocean was discarded and
 * what remained on screen was the sky dome behind it. That is almost convincing,
 * because the sky is roughly the colour the water reflects; the sea simply had
 * no texture anywhere except where a wave folded steeply enough to turn a
 * triangle over, which on a calm day is nowhere.
 */
describe('createRadialGrid', () => {
  const options = { radialSegments: 12, angularSegments: 16, innerRadius: 0.5, outerRadius: 400 }

  it('winds every triangle so that its face points up', () => {
    const geometry = createRadialGrid(options)
    const position = geometry.getAttribute('position')
    const index = geometry.getIndex()
    expect(index).not.toBeNull()

    const at = (i: number) => [position.getX(i), position.getY(i), position.getZ(i)] as const

    let downward = 0
    let degenerate = 0
    for (let t = 0; t < index!.count; t += 3) {
      const a = at(index!.getX(t))
      const b = at(index!.getX(t + 1))
      const c = at(index!.getX(t + 2))

      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as const
      const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]] as const
      // Only the vertical component matters: the grid is flat before displacement.
      const normalY = ab[2] * ac[0] - ab[0] * ac[2]

      if (Math.abs(normalY) < 1e-12) degenerate += 1
      else if (normalY < 0) downward += 1
    }

    expect(degenerate).toBe(0)
    expect(downward).toBe(0)
  })

  it('covers the disc without a hole under the camera and without stray vertices', () => {
    const geometry = createRadialGrid(options)
    const position = geometry.getAttribute('position')
    expect(position.count).toBe(options.radialSegments * options.angularSegments + 1)

    // The centre vertex, then rings growing geometrically out to the far edge.
    expect(position.getX(0)).toBe(0)
    expect(position.getZ(0)).toBe(0)

    let maxRadius = 0
    let minRingRadius = Number.POSITIVE_INFINITY
    for (let i = 1; i < position.count; i += 1) {
      const r = Math.hypot(position.getX(i), position.getZ(i))
      maxRadius = Math.max(maxRadius, r)
      minRingRadius = Math.min(minRingRadius, r)
      expect(position.getY(i)).toBe(0)
    }
    expect(minRingRadius).toBeCloseTo(options.innerRadius, 5)
    expect(maxRadius).toBeCloseTo(options.outerRadius, 3)
  })

  it('references every vertex it allocates', () => {
    const geometry = createRadialGrid(options)
    const index = geometry.getIndex()!
    const seen = new Set<number>()
    for (let i = 0; i < index.count; i += 1) seen.add(index.getX(i))
    expect(seen.size).toBe(geometry.getAttribute('position').count)
  })
})
