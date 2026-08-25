/** Small response helpers, so every route answers in the same shape. */

const SECURITY_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'strict-transport-security': 'max-age=63072000; includeSubDomains; preload',
}

export function json(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json; charset=utf-8')
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) headers.set(key, value)
  return new Response(JSON.stringify(body), { ...init, headers })
}

export function notFound(message: string): Response {
  return json({ error: 'not_found', message }, { status: 404 })
}

export function methodNotAllowed(): Response {
  return json({ error: 'method_not_allowed', message: 'Only GET is supported.' }, { status: 405, headers: { allow: 'GET, HEAD' } })
}
