import type { AgentChatApiResponse } from '@/components/dashboard/types'
import { parseChatStreamEvent, parseSseBlock, splitSseBuffer } from '@/lib/chat-sse-parse'

export type { ChatStreamEvent } from '@/lib/chat-sse-parse'

export async function consumeAgentChatStream(
  body: { message: string; threadTitle: string; threadId: string },
  handlers: {
    onDelta: (text: string) => void
    onDone: (payload: AgentChatApiResponse) => void
    onError: (message: string) => void
  },
): Promise<void> {
  const res = await fetch('/api/agent/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    let err = res.statusText
    try {
      const j = (await res.json()) as { error?: string }
      if (j.error) err = j.error
    } catch {
      /* ignore */
    }
    handlers.onError(err)
    return
  }

  const reader = res.body?.getReader()
  if (!reader) {
    handlers.onError('No response stream')
    return
  }

  const decoder = new TextDecoder()
  let buffer = ''

  const dispatchBlock = (block: string) => {
    const { event, dataLine } = parseSseBlock(block)
    if (!dataLine) return
    const payload = parseChatStreamEvent(dataLine)
    if (payload?.type === 'delta' && payload.text) handlers.onDelta(payload.text)
    if (payload?.type === 'done') handlers.onDone(payload)
    if (!payload && event === 'error') handlers.onError(dataLine)
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const { blocks, remainder } = splitSseBuffer(buffer)
    buffer = remainder
    for (const part of blocks) dispatchBlock(part)
  }
  if (buffer.trim()) dispatchBlock(buffer)
}

export async function sendAgentChatJson(body: {
  message: string
  threadTitle: string
  threadId: string
}): Promise<AgentChatApiResponse & { ok: boolean; status: number }> {
  const r = await fetch('/api/agent/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await r.json()) as AgentChatApiResponse
  return { ...data, ok: r.ok, status: r.status }
}
