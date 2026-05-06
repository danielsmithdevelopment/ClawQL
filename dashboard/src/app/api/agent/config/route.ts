import { NextResponse } from 'next/server'

export function GET() {
  const url = process.env.CLAWQL_DASHBOARD_OPENCLAW_CHAT_URL?.trim()
  return NextResponse.json({
    openclawConfigured: Boolean(url && url.length > 0),
  })
}
