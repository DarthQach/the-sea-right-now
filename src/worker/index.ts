/**
 * The Sea, Right Now — the only server-side code in the project.
 *
 * It does two things: serve the static bundle, and stand between the browser
 * and NOAA NDBC. NDBC sends no CORS headers, so the page can never fetch it
 * directly; every reading comes through here, parsed to JSON and cached at the
 * edge so a thousand simultaneous visitors on one buoy collapse into a single
 * upstream request.
 *
 * There is no database, no auth and no write path. Both routes are public reads
 * of public measurements.
 */
import { handleApiRequest } from './routes'
import { rateLimit } from './rate-limit'

export interface Env {
  ASSETS: Fetcher
  NDBC_USER_AGENT: string
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      const limited = rateLimit(request)
      if (limited !== null) return limited
      return handleApiRequest(request, url, env, ctx)
    }

    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
