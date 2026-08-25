/**
 * The globe's land.
 *
 * The coastlines are drawn, not photographed: the polygons are rasterised into
 * an equirectangular canvas at runtime and used as the sphere's texture. Flat
 * dark grey land, a hairline coast, deep near-black ocean — the design forbids
 * stock imagery and this is data rather than a picture of the Earth.
 */
import { CanvasTexture, LinearFilter, SRGBColorSpace } from 'three/webgpu'
import land from '../../data/land-110m.json'

const WIDTH = 2048
const HEIGHT = 1024

export const OCEAN_FILL = '#050b12'
export const LAND_FILL = '#1c242c'
export const COAST_STROKE = 'rgba(143, 163, 176, 0.55)'

interface LandData {
  source: string
  /** Flat [lon, lat, lon, lat, …] per ring. */
  rings: number[][]
}

export function createLandTexture(): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d')

  if (ctx !== null) {
    ctx.fillStyle = OCEAN_FILL
    ctx.fillRect(0, 0, WIDTH, HEIGHT)

    const data = land as LandData
    ctx.fillStyle = LAND_FILL
    ctx.strokeStyle = COAST_STROKE
    ctx.lineWidth = 1.2
    ctx.lineJoin = 'round'

    for (const ring of data.rings) {
      ctx.beginPath()
      for (let i = 0; i < ring.length; i += 2) {
        const lon = ring[i] ?? 0
        const lat = ring[i + 1] ?? 0
        const x = ((lon + 180) / 360) * WIDTH
        const y = ((90 - lat) / 180) * HEIGHT
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    }
  }

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.generateMipmaps = false
  return texture
}
