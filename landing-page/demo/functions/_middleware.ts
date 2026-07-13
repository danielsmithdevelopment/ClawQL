/**
 * Cloudflare Pages middleware — Link headers + security headers on every response.
 * @see https://developers.cloudflare.com/pages/functions/middleware/
 */

interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> }
}

const DOCS = 'https://docs.clawql.com'

function linkHeader(origin: string): string {
  return [
    `<${origin}/sitemap.xml>; rel="sitemap"`,
    `</.well-known/api-catalog>; rel="api-catalog"`,
    `</.well-known/mcp/server-card.json>; rel="service-desc"`,
    `<${DOCS}>; rel="service-doc"`,
    `</auth.md>; rel="describedby"`,
    `<${DOCS}/api/health>; rel="status"`,
  ].join(', ')
}

export async function onRequest(context: { request: Request; next: () => Promise<Response>; env: Env }) {
  const response = await context.next()
  const origin = new URL(context.request.url).origin
  const headers = new Headers(response.headers)
  headers.set('Link', linkHeader(origin))
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  headers.set('X-Content-Type-Options', 'nosniff')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
