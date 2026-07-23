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

export async function onRequestGet(context: {
  request: Request
  next: () => Promise<Response>
  env: Env
}) {
  const accept = context.request.headers.get('accept') ?? ''
  if (!/\btext\/markdown\b/i.test(accept)) {
    return context.next()
  }

  const url = new URL(context.request.url)
  const path = normalizePath(url.pathname)
  const map = await loadMarkdownMap(context.env)
  const body = map[path]
  if (body === undefined) {
    return context.next()
  }

  const origin = url.origin
  const docs = 'https://docs.clawql.com'
  const link = [
    `<${origin}/sitemap.xml>; rel="sitemap"`,
    `</llms.txt>; rel="alternate"; type="text/plain"`,
    `</auth.md>; rel="alternate"; type="text/markdown"`,
    `</.well-known/api-catalog>; rel="api-catalog"`,
    `</.well-known/mcp/server-card.json>; rel="service-desc"`,
    `</.well-known/agent-card.json>; rel="agent-card"; type="application/json"`,
    `</.well-known/payments.json>; rel="payment-method"`,
    `<${docs}>; rel="service-doc"`,
    `</auth.md>; rel="describedby"`,
    `<${docs}/api/health>; rel="status"`,
  ].join(', ')

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'x-markdown-tokens': String(Math.ceil(body.length / 4)),
      Vary: 'Accept',
      Link: link,
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
