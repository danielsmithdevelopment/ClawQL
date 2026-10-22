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
  '/.well-known/ai-catalog.json': 'application/json; charset=utf-8',
  '/.well-known/ard.json': 'application/json; charset=utf-8',
  '/.well-known/oauth-protected-resource': 'application/json; charset=utf-8',
  '/.well-known/oauth-authorization-server': 'application/json; charset=utf-8',
  '/.well-known/openid-configuration': 'application/json; charset=utf-8',
  '/.well-known/ucp': 'application/json; charset=utf-8',
  '/.well-known/payments.json': 'application/json; charset=utf-8',
  '/.well-known/acp.json': 'application/json; charset=utf-8',
  '/.well-known/mcp/server-card.json': 'application/json; charset=utf-8',
  '/.well-known/mcp/server.json': 'application/json; charset=utf-8',
  '/.well-known/agent-card.json': 'application/json; charset=utf-8',
  '/.well-known/agent-skills/index.json': 'application/json; charset=utf-8',
  '/openapi.json': 'application/openapi+json; charset=utf-8',
  '/server.json': 'application/json; charset=utf-8',
  '/api/health': 'application/json; charset=utf-8',
  '/index.md': 'text/markdown; charset=utf-8',
  '/pricing.md': 'text/markdown; charset=utf-8',
  '/contact.md': 'text/markdown; charset=utf-8',
  '/auth.md': 'text/markdown; charset=utf-8',
}

export function linkHeader(origin: string): string {
  return [
    `<${origin}/sitemap.xml>; rel="sitemap"`,
    `</llms.txt>; rel="alternate"; type="text/plain"`,
    `</index.md>; rel="alternate"; type="text/markdown"`,
    `</pricing.md>; rel="alternate"; type="text/markdown"`,
    `</auth.md>; rel="alternate"; type="text/markdown"`,
    `</.well-known/api-catalog>; rel="api-catalog"`,
    `</.well-known/ai-catalog.json>; rel="ai-catalog"; type="application/json"`,
    `</.well-known/ard.json>; rel="ard-catalog"; type="application/json"`,
    `</.well-known/mcp/server-card.json>; rel="service-desc"`,
    `</.well-known/mcp/server.json>; rel="describedby"; type="application/json"`,
    `</.well-known/agent-card.json>; rel="agent-card"; type="application/json"`,
    `</openapi.json>; rel="service-desc"; type="application/openapi+json"`,
    `<${DOCS}/openapi.json>; rel="service-desc"; type="application/openapi+json"`,
    `</.well-known/payments.json>; rel="payment-method"`,
    `<${DOCS}>; rel="service-doc"`,
    `</auth.md>; rel="describedby"`,
    `<${DOCS}/api/health>; rel="status"`,
  ].join(', ')
}

export async function onRequest(context: { request: Request; next: () => Promise<Response>; env: Env }) {
  const response = await context.next()
  const url = new URL(context.request.url)
  const origin = url.origin
  const headers = new Headers(response.headers)
  headers.set('Link', linkHeader(origin))
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  headers.set('X-Content-Type-Options', 'nosniff')
  // Advertise content negotiation for Markdown for Agents / Accept probes.
  const vary = headers.get('Vary')
  if (!vary) headers.set('Vary', 'Accept')
  else if (!/\bAccept\b/i.test(vary)) headers.set('Vary', `${vary}, Accept`)

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
