// Compacts Natural Earth's 110m land polygons into the file the globe draws.
//
// Natural Earth is public domain ("no restrictions whatsoever"), which is why
// this can ship inside the bundle. Coordinates are rounded to two decimals —
// about a kilometre — because the globe is at most a few hundred pixels across
// and nothing finer would ever be visible. Run it by hand; coastlines do not
// move often.
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const SOURCE =
  'https://raw.githubusercontent.com/martynafford/natural-earth-geojson/master/110m/physical/ne_110m_land.json'
const OUTPUT = fileURLToPath(new URL('../public/land-110m.json', import.meta.url))

const response = await fetch(SOURCE)
if (!response.ok) {
  console.error(`Natural Earth returned ${response.status}`)
  process.exit(1)
}

const geojson = await response.json()
const round = (value) => Math.round(value * 100) / 100

/** @type {number[][][]} one flat ring per entry: [lon, lat, lon, lat, ...] */
const rings = []

for (const feature of geojson.features) {
  const { type, coordinates } = feature.geometry
  const polygons = type === 'Polygon' ? [coordinates] : coordinates
  for (const polygon of polygons) {
    for (const ring of polygon) {
      // Drop consecutive duplicates left behind by the rounding.
      const flat = []
      let lastLon = NaN
      let lastLat = NaN
      for (const [lon, lat] of ring) {
        const x = round(lon)
        const y = round(lat)
        if (x === lastLon && y === lastLat) continue
        flat.push(x, y)
        lastLon = x
        lastLat = y
      }
      if (flat.length >= 8) rings.push(flat)
    }
  }
}

await writeFile(OUTPUT, JSON.stringify({ source: 'Natural Earth 110m physical land (public domain)', rings }))
const points = rings.reduce((sum, ring) => sum + ring.length / 2, 0)
console.log(`Wrote ${rings.length} rings, ${points} points to ${OUTPUT}`)
