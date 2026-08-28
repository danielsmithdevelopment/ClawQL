import {
  analyticsServerConfigured,
  capturePageview,
  resolveAnalyticsCorsOrigin,
} from 'clawql-analytics/server/pageview'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

type PageviewBody = {
  path?: string
  referrer?: string
  sessionId?: string
  timestamp?: string
  properties?: Record<string, unknown>
}

function corsHeaders(origin: string | null): HeadersInit {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  }
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin
  }
  return headers
}

export function OPTIONS(request: Request) {
  const origin = resolveAnalyticsCorsOrigin(request.headers.get('origin'))
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) })
}

export async function POST(request: Request) {
  const origin = resolveAnalyticsCorsOrigin(request.headers.get('origin'))

  if (!analyticsServerConfigured()) {
    return NextResponse.json(
      { ok: false, reason: 'analytics_disabled' },
      { status: 503, headers: corsHeaders(origin) },
    )
  }

  let body: PageviewBody
  try {
    body = (await request.json()) as PageviewBody
  } catch {
    return NextResponse.json(
      { ok: false, reason: 'invalid_json' },
      { status: 400, headers: corsHeaders(origin) },
    )
  }

  const path = typeof body.path === 'string' ? body.path.trim() : ''
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
  if (!path || !sessionId) {
    return NextResponse.json(
      { ok: false, reason: 'path_and_sessionId_required' },
      { status: 400, headers: corsHeaders(origin) },
    )
  }

  await capturePageview({
    path,
    referrer: typeof body.referrer === 'string' ? body.referrer : undefined,
    sessionId,
    timestamp: typeof body.timestamp === 'string' ? body.timestamp : new Date().toISOString(),
    properties:
      body.properties && typeof body.properties === 'object' ? body.properties : undefined,
  })

  return NextResponse.json({ ok: true }, { status: 202, headers: corsHeaders(origin) })
}
