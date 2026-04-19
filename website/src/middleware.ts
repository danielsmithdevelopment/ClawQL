import { NextResponse, type NextRequest } from 'next/server'

/**
 * Content negotiation for agents: requests that prefer `text/markdown` receive
 * the generated Markdown document (see scripts/generate-agent-markdown.mjs).
 */
export function middleware(request: NextRequest) {
  const { pathname: rawPath } = request.nextUrl
  const pathname =
    rawPath.length > 1 && rawPath.endsWith('/') ? rawPath.slice(0, -1) : rawPath

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

  const accept = request.headers.get('accept') ?? ''
  if (!/\btext\/markdown\b/i.test(accept)) {
    return NextResponse.next()
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
