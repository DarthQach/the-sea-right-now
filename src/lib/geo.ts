/**
 * Great-circle geometry, for finding the nearest station that is actually
 * reporting.
 *
 * This runs on the page, against the station index already in memory. There is
 * no server call and no second endpoint: the index is a few hundred kilobytes
 * that the page already has, and a thousand distance calculations take under a
 * millisecond.
 */
import type { Station } from './shared/types'

export const EARTH_RADIUS_KM = 6371

export function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

/** Haversine. Accurate to a few metres at these distances, and cheap. */
export function greatCircleDistanceKm(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const dLat = toRadians(bLat - aLat)
  const dLon = toRadians(bLon - aLon)
  const lat1 = toRadians(aLat)
  const lat2 = toRadians(bLat)

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

export interface NearbyStation {
  station: Station
  distanceKm: number
}

/**
 * The nearest station that is worth sending someone to.
 *
 * Filtered to stations NDBC's own index marks as having reported meteorological
 * data within the last eight hours — the `met` flag — because offering a
 * "nearest station" that is also silent would just move the dead end.
 */
export function nearestReportingStation(
  stations: Station[],
  fromLat: number,
  fromLon: number,
  options: { excludeId?: string; maxDistanceKm?: number } = {},
): NearbyStation | null {
  const exclude = options.excludeId?.toUpperCase()
  const maxDistanceKm = options.maxDistanceKm ?? 600

  let best: NearbyStation | null = null

  for (const station of stations) {
    if (!station.met) continue
    if (exclude !== undefined && station.id.toUpperCase() === exclude) continue

    const distanceKm = greatCircleDistanceKm(fromLat, fromLon, station.lat, station.lon)
    if (distanceKm > maxDistanceKm) continue
    if (best === null || distanceKm < best.distanceKm) best = { station, distanceKm }
  }

  return best
}

/** "34 km away", or plain metres when it is close. */
export function formatDistance(distanceKm: number): string {
  // Some stations share a mooring — a saildrone parked at a buoy, a wave sensor
  // on the same platform. "0 m away" is true but reads like a bug.
  if (distanceKm < 0.1) return 'right beside it'
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} m away`
  if (distanceKm < 10) return `${distanceKm.toFixed(1)} km away`
  return `${Math.round(distanceKm)} km away`
}

/** Latitude and longitude to a point on a unit sphere, for the globe. */
export function latLonToVector(lat: number, lon: number, radius = 1): { x: number; y: number; z: number } {
  const phi = toRadians(90 - lat)
  const theta = toRadians(lon + 180)
  return {
    x: -radius * Math.sin(phi) * Math.cos(theta),
    y: radius * Math.cos(phi),
    z: radius * Math.sin(phi) * Math.sin(theta),
  }
}
