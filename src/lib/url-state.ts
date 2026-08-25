/**
 * The URL is the only thing this product shares.
 *
 * `?station={id}` is the shareable unit and the only parameter that has to stay
 * stable. Camera position is deliberately not encoded — links stay short, and a
 * shared link means "this water", not "this exact view of it". Unknown
 * parameters are ignored rather than treated as errors.
 */
export type AudioMode = 'literal' | 'tuned'

export interface UrlState {
  stationId: string | null
  audioMode: AudioMode | null
  /** Force the reduced-fidelity renderer. Used by the smoke tier and for debugging. */
  forceWebGL: boolean
  /** Open the about-and-attribution panel over whatever is behind it. */
  about: boolean
  /** Make the next reading fetch fail, to reach the data-problem banner on demand. */
  simulateOutage: boolean
  /** Force the deliberate low-power rendering mode, to reach the throttle marker on demand. */
  forceThrottled: boolean
}

const TRUTHY = new Set(['1', 'true', 'yes', 'on'])

function flag(params: URLSearchParams, name: string): boolean {
  const value = params.get(name)
  return value !== null && (value === '' || TRUTHY.has(value.toLowerCase()))
}

export function parseUrlState(search: string): UrlState {
  const params = new URLSearchParams(search)
  const rawStation = params.get('station')?.trim() ?? ''
  const rawMode = params.get('mode')?.trim().toLowerCase() ?? ''

  return {
    stationId: rawStation === '' ? null : rawStation.toUpperCase(),
    audioMode: rawMode === 'literal' || rawMode === 'tuned' ? rawMode : null,
    forceWebGL: flag(params, 'forceWebGL'),
    about: flag(params, 'about'),
    simulateOutage: flag(params, 'simulateOutage'),
    forceThrottled: flag(params, 'forceThrottled'),
  }
}

/**
 * Writes state back to a query string. Only parameters that are actually set
 * appear, so the common case — one station — produces `?station=46042` and
 * nothing else.
 */
export function toSearchString(state: Partial<UrlState>): string {
  const params = new URLSearchParams()
  if (state.stationId) params.set('station', state.stationId)
  if (state.audioMode) params.set('mode', state.audioMode)
  if (state.forceWebGL) params.set('forceWebGL', '1')
  if (state.about) params.set('about', '1')
  if (state.simulateOutage) params.set('simulateOutage', '1')
  if (state.forceThrottled) params.set('forceThrottled', '1')
  const search = params.toString()
  return search === '' ? '' : `?${search}`
}

/**
 * The link the copy control hands over: the current station, and nothing that
 * would make it stale or personal.
 */
export function shareableUrl(origin: string, stationId: string, audioMode?: AudioMode | null): string {
  const state: Partial<UrlState> = { stationId }
  if (audioMode) state.audioMode = audioMode
  return `${origin}/${toSearchString(state)}`
}
