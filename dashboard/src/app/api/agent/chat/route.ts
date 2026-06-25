import { NextResponse } from 'next/server'

import { appendAgentChatLog, appendChatActivity } from '@/lib/chat-vault-store.server'

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

  const threadId =
    typeof body.threadId === 'string' && body.threadId.trim() ? body.threadId.trim() : 'clawql-dashboard'

  const started = Date.now()
  try {
    await appendChatActivity(threadId, {
      type: 'chat_request',
      threadTitle: body.threadTitle,
      messagePreview: message.slice(0, 240),
    })
  } catch {
    /* vault logging is best-effort */
  }

  const upstream = process.env.CLAWQL_DASHBOARD_OPENCLAW_CHAT_URL?.trim()
  if (!upstream) {
    try {
      await appendAgentChatLog({
        type: 'chat_demo',
        threadId,
        threadTitle: body.threadTitle,
      })
    } catch {
      /* ignore */
    }
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
        threadId,
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

    const durationMs = Date.now() - started

    try {
      await appendChatActivity(threadId, {
        type: 'chat_response',
        ok: res.ok,
        status: res.status,
        durationMs,
        demo: false,
      })
      await appendAgentChatLog({
        type: 'chat_response',
        threadId,
        ok: res.ok,
        status: res.status,
        durationMs,
      })
    } catch {
      /* ignore */
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
    try {
      await appendChatActivity(threadId, {
        type: 'chat_error',
        error: msg,
        durationMs: Date.now() - started,
      })
    } catch {
      /* ignore */
    }
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
