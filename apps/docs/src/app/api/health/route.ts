import { NextResponse } from 'next/server'

/**
 * Lightweight health probe for RFC 9727 API catalog `status` links and load balancers.
 */
export function GET() {
  return NextResponse.json(
    { status: 'ok' },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  )
}
