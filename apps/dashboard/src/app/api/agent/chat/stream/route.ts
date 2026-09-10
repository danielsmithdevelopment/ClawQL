import { NextResponse } from 'next/server'

import {
  chunkTextForStream,
  fetchAgentChatUpstream,
  formatSse,
  openclawStreamUrl,
  chatStreamEnabled,
  type AgentChatRequestBody,
} from '@/lib/agent-chat-upstream.server'

type Body = { message?: string; threadTitle?: string; threadId?: string }

function parseBody(body: Body): AgentChatRequestBody | NextResponse {
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (!message) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 })
  }
  const threadId =
    typeof body.threadId === 'string' && body.threadId.trim() ? body.threadId.trim() : 'clawql-dashboard'
  return { message, threadTitle: body.threadTitle, threadId }
}

async function proxyUpstreamSse(body: AgentChatRequestBody): Promise<Response | null> {
  const upstream = openclawStreamUrl()
  if (!upstream) return null

  const res = await fetch(upstream, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  })

  if (!res.ok || !res.body) return null
  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.includes('text/event-stream')) return null

  return new Response(res.body, {
    status: res.status,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}

function simulatedSseStream(data: Awaited<ReturnType<typeof fetchAgentChatUpstream>>['data']): ReadableStream {
  const encoder = new TextEncoder()
  const reply = data.reply ?? data.error ?? '(empty response)'

  return new ReadableStream({
    start(controller) {
      const push = (event: string, payload: unknown) => {
        controller.enqueue(encoder.encode(formatSse(event, payload)))
      }

      for (const chunk of chunkTextForStream(reply)) {
        push('delta', { type: 'delta', text: chunk })
      }

      push('done', {
        type: 'done',
        reply,
        demo: data.demo,
        error: data.error,
        steps: data.steps,
        attachments: data.attachments,
        citations: data.citations,
        toolCalls: data.toolCalls,
        pipelineStatus: data.pipelineStatus,
      })
      controller.close()
    },
  })
}

export async function POST(req: Request) {
  if (!chatStreamEnabled()) {
    return NextResponse.json({ error: 'Streaming disabled (CLAWQL_DASHBOARD_CHAT_STREAM=0)' }, { status: 404 })
  }

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = parseBody(body)
  if (parsed instanceof NextResponse) return parsed

  const proxied = await proxyUpstreamSse(parsed)
  if (proxied) return proxied

  const result = await fetchAgentChatUpstream(parsed)
  const stream = simulatedSseStream(result.data)

  return new Response(stream, {
    status: result.ok ? 200 : result.status,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
