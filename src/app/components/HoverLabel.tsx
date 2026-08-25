import type { Station } from '../../lib/shared/types'
import { formatCoordinates } from '../../lib/format'
import { stationStatus, stationStatusLabel } from '../../lib/station-status'

/**
 * The small label that rises when a pin is hovered. Name, ID, and what NDBC
 * says about whether it is reporting — never an age this project does not have.
 */
export function HoverLabel({
  station,
  screen,
  knownAge,
  knownAgeText,
}: {
  station: Station
  screen: { x: number; y: number }
  knownAge?: number | null
  knownAgeText?: string
}) {
  const status = stationStatus(station, knownAge)
  return (
    <div
      className="panel hover-label"
      data-testid="pin-label"
      data-status={status}
      style={{ left: `${screen.x}px`, top: `${screen.y}px` }}
    >
      <span className="hover-label__name">{station.name}</span>
      <span className="hover-label__meta">
        <span className="mono">{station.id}</span>
        <span className={`status-dot status-dot--${status}`} aria-hidden="true" />
        <span>{stationStatusLabel(station, knownAge, knownAgeText)}</span>
      </span>
      <span className="hover-label__coords mono">{formatCoordinates(station.lat, station.lon)}</span>
    </div>
  )
}
