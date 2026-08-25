import type { Station } from '../../lib/shared/types'

export interface GlobeChromeProps {
  stationCount: number
  onOpenSearch: () => void
  hovered: { station: Station; screen: { x: number; y: number } } | null
}

/**
 * The interface over the globe.
 *
 * One quiet line names whose network this is, placed where a first-time visitor
 * reads it without having to dismiss anything. The pins cluster on US coasts and
 * much of the world has none; that is the truth about the network, and saying so
 * is the difference between an honest map and one that looks broken.
 */
export function GlobeChrome({ stationCount, onOpenSearch }: GlobeChromeProps) {
  return (
    <>
      <div className="slot-top-left">
        <div className="panel globe-intro">
          <h1 className="globe-intro__title">The Sea, Right Now</h1>
          <p className="globe-intro__body">
            {stationCount.toLocaleString('en-GB')} buoys and coastal stations of NOAA’s National Data
            Buoy Center. Pick one and see the water it is standing in.
          </p>
          <p className="globe-intro__note secondary" data-testid="coverage-note">
            It is a United States network, so it covers US coasts, the Great Lakes, Hawaii, Alaska
            and the Caribbean densely and most other coastlines not at all.
          </p>
        </div>
      </div>

      <div className="slot-top-right">
        <button type="button" className="control" onClick={onOpenSearch} data-testid="open-search">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="6" />
            <path d="M20 20l-4.5-4.5" />
          </svg>
          Search
        </button>
      </div>

      <div className="slot-bottom-left">
        <div className="panel globe-legend" data-testid="globe-legend">
          <span className="legend-item">
            <span className="status-dot status-dot--live" aria-hidden="true" />
            Reporting
          </span>
          <span className="legend-item">
            <span className="status-dot status-dot--stale" aria-hidden="true" />
            Not reporting weather
          </span>
          <span className="legend-item">
            <span className="status-dot status-dot--dead" aria-hidden="true" />
            Not reporting
          </span>
        </div>
      </div>
    </>
  )
}
