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

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'x-markdown-tokens': String(Math.ceil(body.length / 4)),
      Vary: 'Accept',
    },
  })
}
