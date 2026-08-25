import { useMemo } from 'react'
import type { SpectrumParams } from '../../lib/spectrum'
import { spectrumCurve } from '../../lib/spectrum'

/**
 * The live spectrum the water is being built from.
 *
 * Not decoration and not a generic chart: this is the same curve that feeds the
 * ocean and the audio, drawn straight. A fine amber line on near-transparent
 * ground, no gridlines heavier than 6% white, no legend, no chart junk.
 */
const WIDTH = 240
const HEIGHT = 80
const PADDING = 4

export function SpectrumPlot({ params }: { params: SpectrumParams | null }) {
  const path = useMemo(() => {
    if (params === null) return null
    const curve = spectrumCurve(params, 120, 0.45)
    const peak = curve.reduce((best, point) => Math.max(best, point.energy), 0)
    if (peak <= 0) return null

    const innerWidth = WIDTH - PADDING * 2
    const innerHeight = HEIGHT - PADDING * 2
    const first = curve[0]
    const last = curve[curve.length - 1]
    if (first === undefined || last === undefined) return null

    const xOf = (frequencyHz: number) =>
      PADDING + ((frequencyHz - first.frequencyHz) / (last.frequencyHz - first.frequencyHz)) * innerWidth
    const yOf = (energy: number) => PADDING + innerHeight - (energy / peak) * innerHeight

    const line = curve
      .map((point, index) => `${index === 0 ? 'M' : 'L'}${xOf(point.frequencyHz).toFixed(2)} ${yOf(point.energy).toFixed(2)}`)
      .join(' ')

    return {
      line,
      area: `${line} L${xOf(last.frequencyHz).toFixed(2)} ${HEIGHT - PADDING} L${xOf(first.frequencyHz).toFixed(2)} ${HEIGHT - PADDING} Z`,
      peakPeriod: params.peakPeriodS,
    }
  }, [params])

  return (
    <div className="spectrum" data-testid="spectrum-plot" data-drawn={path === null ? 'false' : 'true'}>
      <svg
        className="spectrum__chart"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={
          path === null
            ? 'Wave energy against frequency. Waiting for a reading.'
            : `Wave energy against frequency, peaking at about ${path.peakPeriod.toFixed(0)} seconds.`
        }
      >
        <line className="spectrum__axis" x1={PADDING} y1={HEIGHT - PADDING} x2={WIDTH - PADDING} y2={HEIGHT - PADDING} />
        {path === null ? null : (
          <>
            <path className="spectrum__fill" d={path.area} />
            <path className="spectrum__line" d={path.line} />
          </>
        )}
      </svg>
      <div className="spectrum__caption">
        <span>Wave energy</span>
        <span>Long ← period → short</span>
      </div>
    </div>
  )
}
