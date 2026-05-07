import { NextResponse } from 'next/server'

type Body = { message?: string; threadTitle?: string; threadId?: string }

export async function POST(req: Request) {
  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (!message) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 })
  }

  const upstream = process.env.CLAWQL_DASHBOARD_OPENCLAW_CHAT_URL?.trim()
  if (!upstream) {
    return NextResponse.json({
      demo: true,
      reply:
        'OpenClaw proxy is not configured on this dashboard. Set CLAWQL_DASHBOARD_OPENCLAW_CHAT_URL to your in-cluster OpenClaw HTTP chat endpoint (same namespace DNS is typical, e.g. http://openclaw:8787/v1/chat). Until then, this UI shows static demo bubbles only.',
    })
  }

  try {
    const res = await fetch(upstream, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        message,
        threadTitle: body.threadTitle,
        threadId: body.threadId,
      }),
      signal: AbortSignal.timeout(120_000),
    })

    const text = await res.text()
    let parsed: unknown
    try {
      parsed = JSON.parse(text) as unknown
    } catch {
      parsed = { reply: text }
    }

    if (!res.ok) {
      return NextResponse.json(
        {
          error: typeof parsed === 'object' && parsed && 'error' in parsed ? String((parsed as { error: unknown }).error) : text || res.statusText,
        },
        { status: res.status },
      )
    }

    if (typeof parsed === 'object' && parsed && 'reply' in parsed) {
      return NextResponse.json(parsed)
    }
    return NextResponse.json({ reply: text })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Upstream request failed'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
