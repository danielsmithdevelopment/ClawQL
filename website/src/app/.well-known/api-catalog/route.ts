import { NextResponse } from 'next/server'

import { getApiCatalogLinkset } from '@/lib/api-catalog-linkset'
import { getSiteOrigin } from '@/lib/site-url'

const PROFILE = 'https://www.rfc-editor.org/info/rfc9727'
const CONTENT_TYPE = `application/linkset+json; profile="${PROFILE}"`

/**
 * RFC 9727 /.well-known/api-catalog — Linkset document for automated API discovery.
 * HEAD must include Link headers per RFC 9727 §2.
 */
export function GET() {
  const origin = getSiteOrigin().origin
  const body = JSON.stringify(getApiCatalogLinkset(origin))

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': CONTENT_TYPE,
      'Cache-Control':
        'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}

export function HEAD() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Content-Type': CONTENT_TYPE,
      Link: `</.well-known/api-catalog>; rel="api-catalog"`,
      'Cache-Control':
        'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
