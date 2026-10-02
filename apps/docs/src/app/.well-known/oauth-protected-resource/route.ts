import { NextResponse } from 'next/server'

import { getOAuthProtectedResourceMetadata } from '@/lib/oauth-discovery-metadata'

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control':
    'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
}

export function GET() {
  const body = JSON.stringify(getOAuthProtectedResourceMetadata())
  return new NextResponse(body, { status: 200, headers: JSON_HEADERS })
}

export function HEAD() {
  return new NextResponse(null, { status: 200, headers: JSON_HEADERS })
}
