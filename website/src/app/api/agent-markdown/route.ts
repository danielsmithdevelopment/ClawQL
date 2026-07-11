import { NextRequest, NextResponse } from 'next/server'

import { loadAgentMarkdownMap } from '@/lib/agent-markdown-loader'

function tokenEstimate(body: string) {
  return Math.ceil(body.length / 4)
}

/**
 * Internal: markdown bodies for agent negotiation (rewritten from middleware).
 * @see https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('path') ?? '/'
  if (raw.includes('..') || !raw.startsWith('/')) {
    return new NextResponse('Bad Request', { status: 400 })
  }

  const path = raw === '' ? '/' : raw
  const map = await loadAgentMarkdownMap()
  const md = map[path]
  if (md === undefined) {
    return new NextResponse('Not Found', { status: 404 })
  }

  const body = md
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'x-markdown-tokens': String(tokenEstimate(body)),
      Vary: 'Accept',
    },
  })
}
