import { freshnessOf, formatAge, formatObservedAt } from '../../lib/format'

/**
 * The reading age.
 *
 * The single most important honesty element on the page. NDBC publishes roughly
 * hourly, so "now" always means "the most recent measurement" — this says how
 * recent, plainly, and gets visually louder as it gets older. It is never a
 * spinner and never an implied "live" that is not.
 */
export function ReadingAge({ ageSeconds, observedAt }: { ageSeconds: number | null; observedAt: string | null }) {
  const freshness = freshnessOf(ageSeconds)
  return (
    <span
      className="reading-age"
      data-freshness={freshness}
      data-testid="reading-age"
      title={observedAt === null ? undefined : `Measured at ${formatObservedAt(observedAt)}`}
    >
      <span className="reading-age__dot" aria-hidden="true" />
      {formatAge(ageSeconds)}
    </span>
  )
}
