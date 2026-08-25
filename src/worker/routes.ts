import type { Env } from './index'
import { json, methodNotAllowed, notFound } from './http'

/**
 * Routes under /api. Read-only by design — see the note in index.ts.
 */
export async function handleApiRequest(
  request: Request,
  url: URL,
  _env: Env,
  _ctx: ExecutionContext,
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return methodNotAllowed()
  }

  if (url.pathname === '/api/health') {
    return json({ ok: true, service: 'the-sea-right-now' })
  }

  return notFound('No such endpoint.')
}
