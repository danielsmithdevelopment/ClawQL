import { NextResponse } from 'next/server'

import { fetchAgentChatUpstream } from '@/lib/agent-chat-upstream.server'
import type { AgentChatRequestBody } from '@/lib/agent-chat-upstream.server'

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

export async function POST(req: Request) {
  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = parseBody(body)
  if (parsed instanceof NextResponse) return parsed

  const result = await fetchAgentChatUpstream(parsed)
  if (!result.ok) {
    return NextResponse.json({ error: result.data.error ?? 'Upstream error' }, { status: result.status })
  }
  return NextResponse.json(result.data)
}
