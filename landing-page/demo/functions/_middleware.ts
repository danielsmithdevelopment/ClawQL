/**
 * Cloudflare Pages middleware — Link headers + security headers on every response.
 * @see https://developers.cloudflare.com/pages/functions/middleware/
 */

interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> }
}

const DOCS = 'https://docs.clawql.com'

const WELL_KNOWN_JSON_TYPES: Record<string, string> = {
  '/.well-known/api-catalog': 'application/linkset+json',
  '/.well-known/oauth-protected-resource': 'application/json; charset=utf-8',
  '/.well-known/oauth-authorization-server': 'application/json; charset=utf-8',
  '/.well-known/openid-configuration': 'application/json; charset=utf-8',
  '/.well-known/ucp': 'application/json; charset=utf-8',
  '/.well-known/payments.json': 'application/json; charset=utf-8',
  '/.well-known/acp.json': 'application/json; charset=utf-8',
  '/.well-known/mcp/server-card.json': 'application/json; charset=utf-8',
  '/.well-known/agent-card.json': 'application/json; charset=utf-8',
  '/.well-known/agent-skills/index.json': 'application/json; charset=utf-8',
}

export function linkHeader(origin: string): string {
  return [
    `<${origin}/sitemap.xml>; rel="sitemap"`,
    `</llms.txt>; rel="alternate"; type="text/plain"`,
    `</auth.md>; rel="alternate"; type="text/markdown"`,
    `</.well-known/api-catalog>; rel="api-catalog"`,
    `</.well-known/mcp/server-card.json>; rel="service-desc"`,
    `</.well-known/agent-card.json>; rel="agent-card"; type="application/json"`,
    `</.well-known/payments.json>; rel="payment-method"`,
    `<${DOCS}>; rel="service-doc"`,
    `</auth.md>; rel="describedby"`,
    `<${DOCS}/api/health>; rel="status"`,
  ].join(', ')
}

export async function onRequest(context: {
  request: Request
  next: () => Promise<Response>
  env: Env
}) {
  const response = await context.next()
  const url = new URL(context.request.url)
  const origin = url.origin
  const headers = new Headers(response.headers)
  headers.set('Link', linkHeader(origin))
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  headers.set('X-Content-Type-Options', 'nosniff')

  const pathname = url.pathname.replace(/\/+$/, '') || '/'
  const jsonType = WELL_KNOWN_JSON_TYPES[pathname] ?? WELL_KNOWN_JSON_TYPES[url.pathname]
  if (jsonType && response.ok) {
    headers.set('Content-Type', jsonType)
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
