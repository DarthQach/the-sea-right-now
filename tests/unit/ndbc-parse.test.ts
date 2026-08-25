import { describe, expect, it } from 'vitest'
import { buildReading, hasUsableData, parseTabularFile } from '../../src/worker/ndbc/parse'
import { parseActiveStations } from '../../src/worker/ndbc/stations'

// Real NDBC shapes, trimmed. The header is two comment lines; rows are newest
// first; `MM` fills every column NDBC has no value for.
const TXT = `#YY  MM DD hh mm WDIR WSPD GST  WVHT   DPD   APD MWD   PRES  ATMP  WTMP  DEWP  VIS PTDY  TIDE
#yr  mo dy hr mn degT m/s  m/s     m   sec   sec degT   hPa  degC  degC  degC  nmi  hPa    ft
2026 08 25 18 40 330  9.0 10.0    MM    MM    MM  MM 1017.4  14.9  15.8  14.4   MM   MM    MM
2026 08 25 18 30 330  8.0 10.0    MM    MM    MM  MM 1017.4  15.1  15.8  14.5   MM   MM    MM
2026 08 25 18 20 330  8.0 10.0   1.2    14   4.8 155 1017.4  15.0  15.8  14.4   MM   MM    MM
`

const SPEC = `#YY  MM DD hh mm WVHT  SwH  SwP  WWH  WWP SwD WWD  STEEPNESS  APD MWD
#yr  mo dy hr mn    m    m  sec    m  sec  -  degT     -      sec degT
2026 08 25 18 10  0.9  0.8 16.0  0.2  3.8 WSW  NW      SWELL  6.9 240
`

const FETCHED_AT = '2026-08-25T18:45:00.000Z'

describe('parseTabularFile', () => {
  it('reads column names from the header and skips the units line', () => {
    const parsed = parseTabularFile(TXT)
    expect(parsed.columns.slice(0, 6)).toEqual(['YY', 'MM', 'DD', 'hh', 'mm', 'WDIR'])
    expect(parsed.rows).toHaveLength(3)
    expect(parsed.rows[0]?.observedAt).toBe('2026-08-25T18:40:00.000Z')
    expect(parsed.rows[0]?.values.WSPD).toBe('9.0')
  })
})

describe('buildReading', () => {
  // The bug this whole file exists to prevent. A station reporting MM in the
  // wave columns is reporting no wave measurement — not a flat sea.
  it('maps MM to null and absent, never to zero', () => {
    const onlyMissingWaves = `#YY  MM DD hh mm WDIR WSPD GST  WVHT   DPD   APD MWD   PRES  ATMP  WTMP  DEWP  VIS PTDY  TIDE
#yr  mo dy hr mn degT m/s  m/s     m   sec   sec degT   hPa  degC  degC  degC  nmi  hPa    ft
2026 08 25 18 40 330  9.0 10.0    MM    MM    MM  MM 1017.4  14.9  15.8  14.4   MM   MM    MM
`
    const reading = buildReading('46042', onlyMissingWaves, null, FETCHED_AT)
    expect(reading).not.toBeNull()
    expect(reading?.waveHeightM).toBeNull()
    expect(reading?.dominantPeriodS).toBeNull()
    expect(reading?.waveDirectionDeg).toBeNull()
    expect(reading?.fieldSources.waveHeightM).toBe('absent')
    expect(reading?.fieldSources.dominantPeriodS).toBe('absent')
    // The distinction that matters: absent is not zero.
    expect(reading?.waveHeightM).not.toBe(0)
  })

  it('marks a value measured when it is in the newest row and derived when carried forward', () => {
    const reading = buildReading('46042', TXT, null, FETCHED_AT)
    expect(reading?.observedAt).toBe('2026-08-25T18:40:00.000Z')

    // Wind is in the newest row.
    expect(reading?.windSpeedMs).toBe(9)
    expect(reading?.fieldSources.windSpeedMs).toBe('measured')

    // Waves are 20 minutes older — real, but not measured at observedAt.
    expect(reading?.waveHeightM).toBe(1.2)
    expect(reading?.fieldSources.waveHeightM).toBe('derived')
    expect(reading?.fieldObservedAt.waveHeightM).toBe('2026-08-25T18:20:00.000Z')
  })

  it('drops a carried-forward value once it falls outside the three-hour window', () => {
    const stale = `#YY  MM DD hh mm WDIR WSPD GST  WVHT   DPD   APD MWD   PRES  ATMP  WTMP  DEWP  VIS PTDY  TIDE
#yr  mo dy hr mn degT m/s  m/s     m   sec   sec degT   hPa  degC  degC  degC  nmi  hPa    ft
2026 08 25 18 40 330  9.0 10.0    MM    MM    MM  MM 1017.4  14.9  15.8  14.4   MM   MM    MM
2026 08 25 14 20 330  8.0 10.0   1.2    14   4.8 155 1017.4  15.0  15.8  14.4   MM   MM    MM
`
    const reading = buildReading('46042', stale, null, FETCHED_AT)
    expect(reading?.waveHeightM).toBeNull()
    expect(reading?.fieldSources.waveHeightM).toBe('absent')
  })

  it('merges the .spec file and keeps NDBC text fields as text', () => {
    const reading = buildReading('46022', TXT, SPEC, FETCHED_AT)
    expect(reading?.swellHeightM).toBe(0.8)
    expect(reading?.swellPeriodS).toBe(16)
    expect(reading?.swellDirection).toBe('WSW')
    expect(reading?.steepness).toBe('SWELL')
    // .txt has the newer wave height, so it wins over the older .spec row.
    expect(reading?.waveHeightM).toBe(1.2)
  })

  it('treats N/A the same as MM', () => {
    const reading = buildReading('46022', null, SPEC.replace('SWELL', '  N/A'), FETCHED_AT)
    expect(reading?.steepness).toBeNull()
    expect(reading?.fieldSources.steepness).toBe('absent')
  })

  it('returns null when the station publishes no rows at all', () => {
    expect(buildReading('13001', null, null, FETCHED_AT)).toBeNull()
    expect(buildReading('13001', '#YY  MM DD hh mm WDIR\n#yr  mo dy hr mn degT\n', null, FETCHED_AT)).toBeNull()
  })

  it('calls a reading with neither waves nor wind unusable', () => {
    const noWind = `#YY  MM DD hh mm WDIR WSPD GST  WVHT   DPD   APD MWD   PRES  ATMP  WTMP  DEWP  VIS PTDY  TIDE
#yr  mo dy hr mn degT m/s  m/s     m   sec   sec degT   hPa  degC  degC  degC  nmi  hPa    ft
2026 08 25 18 40  MM   MM   MM    MM    MM    MM  MM 1017.4  14.9  15.8  14.4   MM   MM    MM
`
    const reading = buildReading('46042', noWind, null, FETCHED_AT)
    expect(reading).not.toBeNull()
    expect(hasUsableData(reading!)).toBe(false)
    // A station reporting only air pressure is still reporting something.
    expect(reading?.pressureHpa).toBe(1017.4)
  })

  it('keeps a plausible 999 hPa pressure reading rather than treating it as a sentinel', () => {
    const lowPressure = TXT.replace(/1017\.4/g, '  999.0')
    const reading = buildReading('46042', lowPressure, null, FETCHED_AT)
    expect(reading?.pressureHpa).toBe(999)
    expect(reading?.fieldSources.pressureHpa).toBe('measured')
  })
})

describe('parseActiveStations', () => {
  const XML = `<?xml version="1.0" encoding="utf-8"?><stations created="2026-08-25T19:05:02UTC" count="4">
  <station id="46042" lat="36.787" lon="-122.408" name="MONTEREY &amp; 27NM WNW" owner="NDBC" type="buoy" met="y" currents="n" waterquality="n" dart="n"/>
  <station id="21413" lat="30.487" lon="152.124" name="SOUTHEAST TOKYO" owner="NDBC" type="dart" met="n" currents="n" waterquality="n" dart="n"/>
  <station id="41424" lat="24.0" lon="-80.0" name="Tsunameter" owner="NDBC" type="buoy" met="n" currents="n" waterquality="n" dart="y"/>
  <station id="00000" lat="" lon="" name="No position" owner="NDBC" type="buoy" met="n" currents="n" waterquality="n" dart="n"/>
</stations>`

  it('removes DART stations by either marker, drops stations without coordinates, and sorts by id', () => {
    const index = parseActiveStations(XML, '2026-08-25T19:05:02.000Z', 'live')
    expect(index.stations.map((s) => s.id)).toEqual(['46042'])
    expect(index.source).toBe('live')
  })

  it('decodes XML entities in names', () => {
    const index = parseActiveStations(XML, '2026-08-25T19:05:02.000Z', 'live')
    expect(index.stations[0]?.name).toBe('MONTEREY & 27NM WNW')
  })

  it('reads the met flag, which is what the nearest-live-station search filters on', () => {
    const index = parseActiveStations(XML, '2026-08-25T19:05:02.000Z', 'live')
    expect(index.stations[0]?.met).toBe(true)
  })
})
