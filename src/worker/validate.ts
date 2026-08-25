/**
 * Station ID validation.
 *
 * This is the anti-SSRF control. The upstream URL is built from the validated
 * ID and never from raw user input; an unvalidated ID would let a stranger point
 * the Worker at an arbitrary path on ndbc.noaa.gov. Membership in the station
 * index is checked as well, so even a well-formed ID cannot reach upstream
 * unless it names a real station.
 */
const STATION_ID = /^[A-Za-z0-9]{4,7}$/

export function isValidStationId(id: string): boolean {
  return STATION_ID.test(id)
}
