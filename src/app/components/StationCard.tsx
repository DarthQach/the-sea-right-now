import type { Station } from '../../lib/shared/types'
import type { NearbyStation } from '../../lib/geo'
import { formatDistance } from '../../lib/geo'
import { formatObservedAt } from '../../lib/format'

/**
 * The two dead ends, which are never allowed to be dead ends.
 *
 * A station that is not reporting offers the nearest one that is, by name and
 * distance, as a single primary action. An ID that does not exist says so and
 * offers the globe. Neither shows a raw error code.
 */
export function StationUnavailableCard({
  station,
  stationId,
  lastReportedAt,
  nearest,
  onGo,
  onGlobe,
}: {
  station: Station | undefined
  stationId: string
  lastReportedAt: string | null
  nearest: NearbyStation | null
  onGo: (station: Station) => void
  onGlobe: () => void
}) {
  return (
    <div className="panel card" role="alert" data-testid="station-unavailable">
      <h2 className="card__title">
        {station === undefined ? `Station ${stationId}` : station.name} is not reporting
      </h2>
      <p className="card__body">
        <span className="mono">{stationId}</span> is in the NOAA NDBC index, but it is not publishing
        current observations.
        {lastReportedAt === null ? '' : ` It last reported at ${formatObservedAt(lastReportedAt)}.`}
      </p>

      <div className="card__actions">
        {nearest === null ? null : (
          <button
            type="button"
            className="control control--primary"
            data-testid="go-nearest"
            onClick={() => onGo(nearest.station)}
          >
            Go to {nearest.station.id} · {shortName(nearest.station.name)}, {formatDistance(nearest.distanceKm)}
          </button>
        )}
        <button type="button" className="control" data-testid="card-globe" onClick={onGlobe}>
          Back to the globe
        </button>
      </div>

      {nearest === null ? (
        <p className="card__body" data-testid="no-nearby">
          There is no other reporting station within 600 km of it either. The buoy network is
          operated by the United States, and this part of the ocean has none.
        </p>
      ) : null}
    </div>
  )
}

export function UnknownStationCard({ stationId, onGlobe, onSearch }: { stationId: string; onGlobe: () => void; onSearch: () => void }) {
  return (
    <div className="panel card" role="alert" data-testid="unknown-station">
      <h2 className="card__title">No station with that ID</h2>
      <p className="card__body">
        <span className="mono">{stationId}</span> is not in the NOAA NDBC index. It may have been
        retired, or the ID may have a character out of place.
      </p>
      <div className="card__actions">
        <button type="button" className="control control--primary" data-testid="card-globe" onClick={onGlobe}>
          Open the globe
        </button>
        <button type="button" className="control" data-testid="card-search" onClick={onSearch}>
          Search stations
        </button>
      </div>
    </div>
  )
}

/** NDBC names are long and mostly location; the first clause is the useful part. */
function shortName(name: string): string {
  const [first] = name.split(' - ')
  return (first ?? name).trim()
}
