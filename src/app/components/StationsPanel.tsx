import { useDeferredValue, useMemo, useState } from 'react'
import type { Station } from '../../lib/shared/types'
import { stationStatus, stationStatusLabel } from '../../lib/station-status'

export interface StationsPanelProps {
  stations: Station[]
  currentStationId: string | null
  knownAges: ReadonlyMap<string, number | null>
  onSelect: (station: Station) => void
  onClose: () => void
}

const RESULT_LIMIT = 120

/**
 * Search over the station index already in memory. No network call, so there is
 * no loading state to build and no way for it to fail.
 */
export function StationsPanel(props: StationsPanelProps) {
  const [query, setQuery] = useState('')
  const deferred = useDeferredValue(query)

  const results = useMemo(() => matchStations(props.stations, deferred), [props.stations, deferred])

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

      <p className="stations-panel__count secondary" data-testid="station-count">
        {results.total === 0
          ? 'No station matches that.'
          : `${results.total.toLocaleString('en-GB')} station${results.total === 1 ? '' : 's'}`}
      </p>

      {results.total === 0 ? (
        <p className="stations-panel__empty" data-testid="search-empty">
          Nothing matched “{deferred.trim()}”. The network is operated by the United States, so its
          stations are named for US coasts, the Great Lakes, Hawaii, Alaska and the Caribbean — try a
          state, a city, or a five-character station ID like <span className="mono">46042</span>.
        </p>
      ) : (
        <ul className="stations-panel__list" data-testid="station-list">
          {results.shown.map((station) => {
            const age = props.knownAges.get(station.id.toUpperCase())
            const status = stationStatus(station, age)
            return (
              <li key={station.id}>
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
              </li>
            )
          })}
        </ul>
      )}

      {results.total > results.shown.length ? (
        <p className="stations-panel__more secondary">
          Showing the first {results.shown.length}. Keep typing to narrow it down.
        </p>
      ) : null}

      {/* The honest note about whose network this is. */}
      <p className="stations-panel__note secondary">
        Every station here belongs to NOAA’s National Data Buoy Center.
      </p>
    </aside>
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
