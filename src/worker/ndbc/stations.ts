/**
 * Builds the station index from NDBC's `activestations.xml`.
 *
 * Workers have no DOM parser. `activestations.xml` is a flat list of
 * self-closing `<station .../>` elements with no nesting and no text content,
 * so attribute extraction is both sufficient and less fragile than pulling in an
 * XML library for one file shape.
 */
import type { Station, StationIndex } from '../../lib/shared/types'

const STATION_ELEMENT = /<station\b([^>]*)\/?>/g
const ATTRIBUTE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*"([^"]*)"/g

/**
 * DART tsunami stations and stations without coordinates are removed here, at
 * index-build time, so nothing downstream has to remember to skip them. The
 * result is sorted by id, which keeps the bundled snapshot diffing cleanly.
 */
export function parseActiveStations(xml: string, builtAt: string, source: 'live' | 'bundled'): StationIndex {
  const stations: Station[] = []

  for (const element of xml.matchAll(STATION_ELEMENT)) {
    const attributes: Record<string, string> = {}
    for (const attribute of (element[1] ?? '').matchAll(ATTRIBUTE)) {
      const name = attribute[1]
      const value = attribute[2]
      if (name !== undefined && value !== undefined) attributes[name] = decodeEntities(value)
    }

    const id = attributes.id
    if (id === undefined || id === '') continue

    // NDBC marks tsunami stations two ways and they do not always agree: 33
    // stations carry type="dart" with dart="n". Neither kind reports waves, so
    // both are removed.
    if (attributes.dart === 'y' || attributes.type === 'dart') continue

    // Number('') is 0, which is a real position in the Gulf of Guinea. Reject
    // empty and missing coordinates explicitly.
    const lat = toCoordinate(attributes.lat)
    const lon = toCoordinate(attributes.lon)
    if (lat === null || lon === null) continue
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue

    stations.push({
      id,
      name: attributes.name ?? id,
      lat,
      lon,
      owner: attributes.owner ?? '',
      type: attributes.type ?? 'other',
      met: attributes.met === 'y',
      currents: attributes.currents === 'y',
      waterquality: attributes.waterquality === 'y',
      dart: false,
    })
  }

  stations.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return { stations, builtAt, source }
}

function toCoordinate(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === '') return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
}

function decodeEntities(value: string): string {
  return value.replace(/&(amp|lt|gt|quot|apos);/g, (match) => ENTITIES[match] ?? match)
}
