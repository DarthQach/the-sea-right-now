import type { Station } from '../../lib/shared/types'
import { ReadingAge } from './ReadingAge'

/**
 * Top left: whose water this is, and how old the numbers are. Present in every
 * state including the cold load, so the frame never looks broken.
 */
export function StationHeader({
  station,
  stationId,
  ageSeconds,
  observedAt,
}: {
  station: Station | undefined
  stationId: string
  ageSeconds: number | null
  observedAt: string | null
}) {
  return (
    <div className="panel station-header" data-testid="station-header">
      <h1 className="station-header__name">{station?.name ?? 'Station'}</h1>
      <div className="station-header__meta">
        <span className="station-header__id mono" data-testid="station-id">
          {stationId}
        </span>
        <ReadingAge ageSeconds={ageSeconds} observedAt={observedAt} />
      </div>
    </div>
  )
}
