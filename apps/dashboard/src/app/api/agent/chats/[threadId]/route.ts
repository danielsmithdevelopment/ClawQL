import { NextResponse } from 'next/server'

import { loadChatMessages, saveChatMessages, updateChatThread } from '@/lib/chat-vault-store.server'
import type { ChatMessage } from '@/components/dashboard/types'

type RouteContext = { params: Promise<{ threadId: string }> }

export async function GET(_req: Request, context: RouteContext) {
  const { threadId } = await context.params
  try {
    const messages = await loadChatMessages(threadId)
    return NextResponse.json({ threadId, messages })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to load messages'
    const status = msg.includes('Invalid') ? 400 : msg.includes('not found') ? 404 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}

export async function PUT(req: Request, context: RouteContext) {
  const { threadId } = await context.params
  try {
    const body = (await req.json()) as { messages?: ChatMessage[] }
    if (!Array.isArray(body.messages)) {
      return NextResponse.json({ error: 'messages array required' }, { status: 400 })
    }
    await saveChatMessages(threadId, body.messages)
    return NextResponse.json({ ok: true, count: body.messages.length })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to save messages'
    const status = msg.includes('Invalid') ? 400 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}

export async function PATCH(req: Request, context: RouteContext) {
  const { threadId } = await context.params
  try {
    const body = (await req.json()) as { title?: string; updatedAt?: number }
    const meta = await updateChatThread(threadId, {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.updatedAt !== undefined ? { updatedAt: new Date(body.updatedAt).toISOString() } : {}),
    })
    return NextResponse.json({
      thread: {
        id: meta.id,
        title: meta.title,
        updatedAt: new Date(meta.updatedAt).getTime(),
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to update thread'
    const status = msg.includes('Invalid') ? 400 : msg.includes('not found') ? 404 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
