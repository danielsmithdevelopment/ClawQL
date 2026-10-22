/**
 * Markdown for Agents — Accept: text/markdown content negotiation on Cloudflare Pages.
 * @see https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/
 */

interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> }
}

type MarkdownMap = Record<string, string>

let cachedMap: MarkdownMap | null = null

async function loadMarkdownMap(env: Env): Promise<MarkdownMap> {
  if (cachedMap) return cachedMap
  const res = await env.ASSETS.fetch(new Request('https://assets.local/agent-markdown.json'))
  if (!res.ok) return {}
  cachedMap = (await res.json()) as MarkdownMap
  return cachedMap
}

function normalizePath(pathname: string): string {
  if (pathname === '' || pathname === '/') return '/'
  const trimmed = pathname.replace(/\/+$/, '')
  return trimmed === '' ? '/' : trimmed
}

function linkHeader(origin: string): string {
  const docs = 'https://docs.clawql.com'
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
    `<${docs}/openapi.json>; rel="service-desc"; type="application/openapi+json"`,
    `</.well-known/payments.json>; rel="payment-method"`,
    `<${docs}>; rel="service-doc"`,
    `</auth.md>; rel="describedby"`,
    `<${docs}/api/health>; rel="status"`,
  ].join(', ')
}

export async function onRequestGet(context: { request: Request; next: () => Promise<Response>; env: Env }) {
  const accept = context.request.headers.get('accept') ?? ''
  if (!/\btext\/markdown\b/i.test(accept)) {
    return context.next()
  }

  const url = new URL(context.request.url)
  const path = normalizePath(url.pathname)
  const map = await loadMarkdownMap(context.env)
  let body = map[path]
  let status = 200

  if (body === undefined) {
    // Agent-friendly markdown 404 (AR-READ-02 partial credit)
    body =
      map['/404'] ??
      `# Not found\n\nThe path \`${path}\` was not found on ${url.origin}.\n\nTry [home](${url.origin}/), [docs](https://docs.clawql.com), [llms.txt](${url.origin}/llms.txt), or [sitemap](${url.origin}/sitemap.xml).\n`
    status = 404
  }

  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'x-markdown-tokens': String(Math.ceil(body.length / 4)),
      Vary: 'Accept',
      Link: linkHeader(url.origin),
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
