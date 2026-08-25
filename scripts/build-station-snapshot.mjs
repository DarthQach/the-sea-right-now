// Regenerates public/stations.snapshot.json from NDBC.
//
// The snapshot ships inside the bundle so the globe renders on first paint with
// no network round trip, and so the Worker has an index to fall back to when
// NDBC is unreachable. Run it by hand — station positions change on the order of
// months, and NDBC asks that retrievals be kept minimal.
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const USER_AGENT = process.env.NDBC_USER_AGENT ?? 'TheSeaRightNow/1.0 (+https://sea.vicaai.dev)'
const SOURCE = 'https://www.ndbc.noaa.gov/activestations.xml'
const OUTPUT = fileURLToPath(new URL('../public/stations.snapshot.json', import.meta.url))

const response = await fetch(SOURCE, { headers: { 'user-agent': USER_AGENT } })
if (!response.ok) {
  console.error(`NDBC returned ${response.status} for ${SOURCE}`)
  process.exit(1)
}

const xml = await response.text()

// The Worker's own parser, imported directly. Node strips the types; there is
// deliberately no second copy of this logic to drift out of sync.
const { parseActiveStations } = await import('../src/worker/ndbc/stations.ts')
const index = parseActiveStations(xml, new Date().toISOString(), 'bundled')

if (index.stations.length < 500) {
  console.error(`Refusing to write a snapshot with only ${index.stations.length} stations.`)
  process.exit(1)
}

await writeFile(OUTPUT, `${JSON.stringify(index, null, 0)}\n`)
console.log(`Wrote ${index.stations.length} stations to ${OUTPUT}`)
