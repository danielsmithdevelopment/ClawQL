import { NextResponse, type NextRequest } from 'next/server'

import { decideRscBotGuard, stripRscFlightQuery } from '@/lib/rsc-bot-guard'

/**
 * Content negotiation for agents: requests that prefer `text/markdown` receive
 * the generated Markdown document (see scripts/generate-agent-markdown.mjs).
 *
 * Also rejects Next.js RSC flight URLs (`?_rsc=` / `?rsc=`) that lack `RSC: 1`
 * so bots cannot force expensive Worker HTML renders on flight endpoints.
 */
export function middleware(request: NextRequest) {
  const rscDecision = decideRscBotGuard({
    searchParams: request.nextUrl.searchParams,
    headers: request.headers,
  })
  if (rscDecision.action === 'reject') {
    // Cheap 429: no full page render, no redirect follow-up. Real App Router
    // clients always send `RSC: 1` and are unaffected. Pair with a zone WAF
    // rule (see website-performance-workers-guardrails.md) so abusive traffic
    // never reaches the Worker on Cloudflare Free.
    return new NextResponse(
      'RSC flight requests require the RSC header. Use the clean document URL.',
      {
        status: 429,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'private, no-store',
          'Retry-After': '3600',
          'X-ClawQL-Rsc-Guard': rscDecision.reason,
          // Hint cooperative clients at the clean URL without spending a second hop.
          Link: `<${stripRscFlightQuery(request.nextUrl).toString()}>; rel="canonical"`,
        },
      },
    )
  }

  const { pathname: rawPath } = request.nextUrl
  const pathname =
    rawPath.length > 1 && rawPath.endsWith('/') ? rawPath.slice(0, -1) : rawPath

  const accept = request.headers.get('accept') ?? ''
  if (!/\btext\/markdown\b/i.test(accept)) {
    return NextResponse.next()
  }

  if (pathname.startsWith('/_next') || pathname.startsWith('/api/')) {
    return NextResponse.next()
  }
  if (pathname.startsWith('/.well-known')) {
    return NextResponse.next()
  }
  if (pathname.includes('.') && !pathname.endsWith('.mdx')) {
    const base = pathname.split('/').pop() ?? ''
    if (base.includes('.')) {
      return NextResponse.next()
    }
  }

  const path = pathname === '' ? '/' : pathname
  const url = request.nextUrl.clone()
  url.pathname = '/api/agent-markdown'
  url.searchParams.set('path', path)
  return NextResponse.rewrite(url)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
}
