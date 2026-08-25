import { useDeferredValue, useMemo, useState } from 'react'
import type { Station } from '../../lib/shared/types'
import { stationStatus, stationStatusLabel } from '../../lib/station-status'
import type { FavouritesState } from '../hooks/useFavourites'

export interface StationsPanelProps {
  stations: Station[]
  currentStationId: string | null
  knownAges: ReadonlyMap<string, number | null>
  favourites: FavouritesState
  onSelect: (station: Station) => void
  onClose: () => void
}

type Segment = 'all' | 'favourites'

const RESULT_LIMIT = 120

/**
 * Search and favourites.
 *
 * Both run against the station index already in memory. There is no network call
 * here, so there is no loading state to build and no way for it to fail.
 */
export function StationsPanel(props: StationsPanelProps) {
  const [segment, setSegment] = useState<Segment>('all')
  const [query, setQuery] = useState('')
  const deferred = useDeferredValue(query)

  const favouriteStations = useMemo(() => {
    const byId = new Map(props.stations.map((station) => [station.id.toUpperCase(), station]))
    return props.favourites.stationIds
      .map((id) => byId.get(id))
      .filter((station): station is Station => station !== undefined)
  }, [props.stations, props.favourites.stationIds])

  const source = segment === 'favourites' ? favouriteStations : props.stations
  const results = useMemo(() => matchStations(source, deferred), [source, deferred])

  return (
    <aside className="panel stations-panel" data-testid="stations-panel" aria-label="Stations">
      <div className="stations-panel__head">
        <input
          className="stations-panel__search"
          type="search"
          value={query}
          placeholder="Search by name or station ID"
          aria-label="Search stations by name or station ID"
          data-testid="station-search"
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
        />
        <button
          type="button"
          className="control control--icon"
          onClick={props.onClose}
          aria-label="Close the stations panel"
          data-testid="stations-close"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div className="segmented segmented--full" role="group" aria-label="Which stations to show">
        <button
          type="button"
          className="segmented__option"
          aria-pressed={segment === 'all'}
          data-testid="segment-all"
          onClick={() => setSegment('all')}
        >
          All
        </button>
        <button
          type="button"
          className="segmented__option"
          aria-pressed={segment === 'favourites'}
          data-testid="segment-favourites"
          onClick={() => setSegment('favourites')}
        >
          Favourites{props.favourites.stationIds.length > 0 ? ` · ${props.favourites.stationIds.length}` : ''}
        </button>
      </div>

      {/* Two distinct empty states: nothing saved yet, and nothing matched. */}
      {segment === 'favourites' && props.favourites.stationIds.length === 0 ? (
        <p className="stations-panel__empty" data-testid="favourites-empty">
          Nothing saved yet. Press the <Star filled aria-hidden /> on any station and it will be
          waiting here next time you open this browser — favourites are kept on this device only, and
          never leave it.
        </p>
      ) : results.total === 0 ? (
        <p className="stations-panel__empty" data-testid="search-empty">
          Nothing matched “{deferred.trim()}”.
          {segment === 'favourites'
            ? ' Clear the search to see everything you have saved.'
            : ' The network is operated by the United States, so its stations are named for US coasts, the Great Lakes, Hawaii, Alaska and the Caribbean — try a state, a city, or a five-character station ID like '}
          {segment === 'all' ? <span className="mono">46042</span> : null}
          {segment === 'all' ? '.' : ''}
        </p>
      ) : (
        <ul className="stations-panel__list" data-testid="station-list">
          {results.shown.map((station) => {
            const age = props.knownAges.get(station.id.toUpperCase())
            const status = stationStatus(station, age)
            const favourited = props.favourites.has(station.id)
            return (
              <li key={station.id} className="station-row-wrap">
                <button
                  type="button"
                  className="station-row"
                  data-testid={`station-row-${station.id}`}
                  data-status={status}
                  aria-current={station.id === props.currentStationId ? 'true' : undefined}
                  onClick={() => props.onSelect(station)}
                >
                  <span className="station-row__name">{station.name}</span>
                  <span className="station-row__meta">
                    <span className="mono">{station.id}</span>
                    <span className={`status-dot status-dot--${status}`} aria-hidden="true" />
                    <span className="secondary">{stationStatusLabel(station, age)}</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="station-row__star"
                  aria-pressed={favourited}
                  aria-label={favourited ? `Remove ${station.name} from favourites` : `Add ${station.name} to favourites`}
                  data-testid={`station-star-${station.id}`}
                  onClick={() => props.favourites.toggle(station.id)}
                >
                  <Star filled={favourited} />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {props.favourites.atCap ? (
        <p className="stations-panel__cap" role="status" data-testid="favourites-cap">
          That is {props.favourites.cap} favourites, which is as many as this keeps. Remove one you no
          longer watch and the star will take the new one.
        </p>
      ) : null}

      {results.total > results.shown.length ? (
        <p className="stations-panel__more secondary">
          Showing the first {results.shown.length}. Keep typing to narrow it down.
        </p>
      ) : null}

      <p className="stations-panel__note secondary">
        Every station here belongs to NOAA’s National Data Buoy Center.
      </p>
    </aside>
  )
}

export function Star({ filled, ...rest }: { filled?: boolean } & React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={filled ? 'star star--filled' : 'star'} {...rest}>
      <path d="M12 3.6l2.6 5.3 5.8.85-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.85z" />
    </svg>
  )
}

export function matchStations(
  stations: Station[],
  query: string,
): { total: number; shown: Station[] } {
  const trimmed = query.trim().toLowerCase()
  if (trimmed === '') {
    // Reporting stations first: a list that opens on dead buoys is a worse list.
    const sorted = [...stations].sort((a, b) => Number(b.met) - Number(a.met) || a.name.localeCompare(b.name))
    return { total: stations.length, shown: sorted.slice(0, RESULT_LIMIT) }
  }

  const scored: { station: Station; score: number }[] = []
  for (const station of stations) {
    const id = station.id.toLowerCase()
    const name = station.name.toLowerCase()

    let score = -1
    if (id === trimmed) score = 0
    else if (id.startsWith(trimmed)) score = 1
    else if (name.startsWith(trimmed)) score = 2
    else if (name.includes(trimmed)) score = 3
    else if (station.owner.toLowerCase().includes(trimmed)) score = 4
    if (score < 0) continue

    // A reporting station outranks a silent one at the same relevance.
    scored.push({ station, score: score * 2 + (station.met ? 0 : 1) })
  }

  scored.sort((a, b) => a.score - b.score || a.station.name.localeCompare(b.station.name))
  return { total: scored.length, shown: scored.slice(0, RESULT_LIMIT).map((entry) => entry.station) }
}
