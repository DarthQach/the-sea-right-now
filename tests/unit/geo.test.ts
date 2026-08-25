import { describe, expect, it } from 'vitest'
import type { Station } from '../../src/lib/shared/types'
import {
  formatDistance, greatCircleDistanceKm, latLonToVector, nearestReportingStation,
} from '../../src/lib/geo'

function station(id: string, lat: number, lon: number, met: boolean): Station {
  return { id, name: id, lat, lon, owner: 'NDBC', type: 'buoy', met, currents: false, waterquality: false, dart: false }
}

describe('greatCircleDistanceKm', () => {
  it('measures a known distance', () => {
    // Monterey buoy 46042 to Half Moon Bay buoy 46012: 0.578 degrees of
    // latitude is 64.3 km, 0.412 of longitude at 37 N is 36.6 km, so about 74.
    expect(greatCircleDistanceKm(36.785, -122.469, 37.363, -122.881)).toBeCloseTo(74, 0)
  })

  it('is zero for the same point and symmetric between two', () => {
    expect(greatCircleDistanceKm(36.785, -122.469, 36.785, -122.469)).toBe(0)
    const there = greatCircleDistanceKm(36.8, -122.4, 21.3, -157.9)
    const back = greatCircleDistanceKm(21.3, -157.9, 36.8, -122.4)
    expect(there).toBeCloseTo(back, 9)
  })

  // The trap in every naive nearest-station search: 179°E and 179°W are 222 km
  // apart, not most of the way round the planet.
  it('crosses the antimeridian the short way', () => {
    expect(greatCircleDistanceKm(0, 179, 0, -179)).toBeCloseTo(222, 0)
  })

  it('does not confuse degrees of longitude near the poles with distance', () => {
    const atEquator = greatCircleDistanceKm(0, 0, 0, 10)
    const nearPole = greatCircleDistanceKm(80, 0, 80, 10)
    expect(nearPole).toBeLessThan(atEquator / 4)
  })
})

describe('nearestReportingStation', () => {
  const stations = [
    station('DEAD1', 36.79, -122.41, false),
    station('LIVE1', 37.0, -122.5, true),
    station('LIVE2', 40.0, -124.0, true),
    station('SELF', 36.785, -122.469, true),
    station('FARAWAY', 21.3, -157.9, true),
  ]

  it('offers the nearest station that is actually reporting, not the nearest station', () => {
    const nearest = nearestReportingStation(stations, 36.785, -122.469, { excludeId: 'SELF' })
    expect(nearest?.station.id).toBe('LIVE1')
    expect(nearest?.distanceKm).toBeGreaterThan(0)
  })

  it('excludes the station being asked about', () => {
    const nearest = nearestReportingStation(stations, 36.785, -122.469, { excludeId: 'SELF' })
    expect(nearest?.station.id).not.toBe('SELF')
  })

  it('returns null rather than pointing across an ocean', () => {
    // The Bay of Biscay: the NDBC network has nothing within range, and saying
    // so is better than offering a station in Hawaii.
    expect(nearestReportingStation(stations, 44.5, -2.5)).toBeNull()
  })

  it('returns null when nothing in the index is reporting at all', () => {
    const silent = stations.map((s) => ({ ...s, met: false }))
    expect(nearestReportingStation(silent, 36.785, -122.469)).toBeNull()
  })
})

describe('formatDistance', () => {
  it('reads plainly at every scale', () => {
    // Stations sometimes share a mooring, and "0 m away" reads like a bug.
    expect(formatDistance(0)).toBe('right beside it')
    expect(formatDistance(0.4)).toBe('400 m away')
    expect(formatDistance(3.42)).toBe('3.4 km away')
    expect(formatDistance(41.6)).toBe('42 km away')
  })
})

describe('latLonToVector', () => {
  it('puts the poles on the axis and the equator on the sphere', () => {
    expect(latLonToVector(90, 0).y).toBeCloseTo(1, 6)
    expect(latLonToVector(-90, 0).y).toBeCloseTo(-1, 6)
    const equator = latLonToVector(0, 0)
    expect(Math.hypot(equator.x, equator.y, equator.z)).toBeCloseTo(1, 6)
    expect(equator.y).toBeCloseTo(0, 6)
  })
})
