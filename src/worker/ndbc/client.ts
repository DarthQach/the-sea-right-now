/**
 * The only outbound requests this project makes.
 *
 * NDBC asks that retrievals be kept minimal, so every call through here is
 * behind an edge cache and is only made for a station a visitor is actually
 * looking at. There is deliberately no poller over all stations: it would raise
 * request volume by three orders of magnitude.
 *
 * Nothing about the visitor is forwarded — no headers, no IP, no derived
 * identifier. NDBC receives a station ID and this project's User-Agent.
 */
const NDBC_ORIGIN = 'https://www.ndbc.noaa.gov'
const UPSTREAM_TIMEOUT_MS = 8000

export interface UpstreamResult {
  /** `null` when NDBC answered 404 — the station publishes no such file. */
  text: string | null
}

export class UpstreamUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UpstreamUnavailableError'
  }
}

async function get(path: string, userAgent: string): Promise<UpstreamResult> {
  let response: Response
  try {
    response = await fetch(`${NDBC_ORIGIN}${path}`, {
      headers: { 'user-agent': userAgent, accept: 'text/plain, application/xml, */*' },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
  } catch (cause) {
    throw new UpstreamUnavailableError(`NDBC did not answer for ${path}: ${String(cause)}`)
  }

  if (response.status === 404) return { text: null }
  if (!response.ok) {
    throw new UpstreamUnavailableError(`NDBC returned ${response.status} for ${path}`)
  }
  return { text: await response.text() }
}

/**
 * The two `realtime2` files for one station. `.spec` exists only for spectral
 * stations, so a 404 there is normal and is not a failure.
 *
 * `id` must already have been validated and checked for membership in the
 * station index. Constructing this path from unvalidated input is the SSRF hole
 * in this project — see `isValidStationId` in `../validate.ts`.
 */
export async function fetchStationFiles(
  id: string,
  userAgent: string,
): Promise<{ txt: string | null; spec: string | null }> {
  const [txt, spec] = await Promise.all([
    get(`/data/realtime2/${id}.txt`, userAgent),
    get(`/data/realtime2/${id}.spec`, userAgent).catch(() => ({ text: null }) satisfies UpstreamResult),
  ])
  return { txt: txt.text, spec: spec.text }
}

export async function fetchActiveStationsXml(userAgent: string): Promise<string> {
  const result = await get('/activestations.xml', userAgent)
  if (result.text === null) throw new UpstreamUnavailableError('NDBC returned 404 for activestations.xml')
  return result.text
}
