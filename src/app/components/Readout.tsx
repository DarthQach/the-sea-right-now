import type { FieldSource, Reading } from '../../lib/shared/types'
import { EM_DASH, formatNumber, formatObservedAt, metresPerSecondToKnots } from '../../lib/format'

/**
 * The readout.
 *
 * Every value carries its provenance, because many stations report waves but not
 * wind, or wind but not waves, and a readout that quietly filled the gap with a
 * zero would be claiming a measurement nobody took. Three treatments, and all
 * three are distinguishable without colour:
 *
 *   measured — plain, full weight
 *   derived  — dimmed, with a glyph and an explanation of where it came from
 *   absent   — an em-dash, never a zero
 */
export interface ReadoutValue {
  key: string
  label: string
  /** Already formatted. `EM_DASH` when absent. */
  display: string
  unit: string | null
  source: FieldSource
  /** Why this is not a direct measurement. Shown on hover and to screen readers. */
  note: string | null
}

function valueOf(
  reading: Reading | null,
  key: keyof Reading & string,
  label: string,
  unit: string,
  decimals: number,
  transform: (value: number) => number = (value) => value,
): ReadoutValue {
  if (reading === null) {
    return { key, label, display: EM_DASH, unit: null, source: 'absent', note: null }
  }

  const raw = reading[key]
  const source: FieldSource = reading.fieldSources[key] ?? 'absent'

  if (typeof raw !== 'number' || source === 'absent') {
    return {
      key,
      label,
      display: EM_DASH,
      unit: null,
      source: 'absent',
      note: 'This station did not report this measurement.',
    }
  }

  const measuredAt = reading.fieldObservedAt[key]
  return {
    key,
    label,
    display: formatNumber(transform(raw), decimals),
    unit,
    source,
    note:
      source === 'derived' && measuredAt !== undefined
        ? `Carried forward from the last reading that had it, at ${formatObservedAt(measuredAt)}.`
        : null,
  }
}

export function readoutValues(reading: Reading | null): ReadoutValue[] {
  return [
    valueOf(reading, 'waveHeightM', 'Wave height', 'm', 1),
    valueOf(reading, 'dominantPeriodS', 'Dominant period', 's', 0),
    valueOf(reading, 'windSpeedMs', 'Wind', 'kt', 1, metresPerSecondToKnots),
    valueOf(reading, 'waterTempC', 'Water', '°C', 1),
  ]
}

export function Readout({ values, children }: { values: ReadoutValue[]; children?: React.ReactNode }) {
  return (
    <div className="panel readout" data-testid="readout">
      {children}
      <div className="readout__values">
        {values.map((value) => (
          <div className="value" key={value.key} data-source={value.source} data-testid={`value-${value.key}`}>
            <span className="value__label">
              {value.label}
              {value.source === 'derived' ? (
                <span className="value__glyph" aria-hidden="true" title={value.note ?? undefined}>
                  ≈
                </span>
              ) : null}
            </span>
            <span className="value__number">
              {value.display}
              {value.unit === null ? null : <span className="value__unit">{value.unit}</span>}
            </span>
            {value.note === null ? null : <span className="visually-hidden">{value.note}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}
