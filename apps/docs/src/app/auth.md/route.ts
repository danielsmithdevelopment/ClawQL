import { NextResponse } from 'next/server'

import { getAuthMdContent } from '@/lib/auth-md-content'

const MARKDOWN_HEADERS = {
  'Content-Type': 'text/markdown; charset=utf-8',
  'Cache-Control':
    'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
}

export function GET() {
  return new NextResponse(getAuthMdContent(), {
    status: 200,
    headers: MARKDOWN_HEADERS,
  })
}

export function HEAD() {
  return new NextResponse(null, { status: 200, headers: MARKDOWN_HEADERS })
}
