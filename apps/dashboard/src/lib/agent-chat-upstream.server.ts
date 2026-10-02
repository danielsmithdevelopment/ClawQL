import { appendAgentChatLog, appendChatActivity, isValidThreadId } from '@/lib/chat-vault-store.server'
import { normalizeAgentChatUpstreamJson } from '@/lib/agent-chat-normalize'

import type { AgentChatApiResponse } from '@/components/dashboard/types'

export type AgentChatRequestBody = {
  message: string
  threadTitle?: string
  threadId: string
}

const DEMO_REPLY =
  'OpenClaw proxy is not configured on this dashboard. Set CLAWQL_DASHBOARD_OPENCLAW_CHAT_URL to your in-cluster OpenClaw HTTP chat endpoint (same namespace DNS is typical, e.g. http://openclaw:8787/v1/chat). Until then, this UI shows static demo bubbles only.'

export function chatStreamEnabled(): boolean {
  return process.env.CLAWQL_DASHBOARD_CHAT_STREAM !== '0'
}

export function openclawChatUrl(): string | undefined {
  const url = process.env.CLAWQL_DASHBOARD_OPENCLAW_CHAT_URL?.trim()
  return url && url.length > 0 ? url : undefined
}

export function openclawStreamUrl(): string | undefined {
  const base = openclawChatUrl()
  if (!base) return undefined
  if (base.endsWith('/v1/chat/stream')) return base
  if (base.endsWith('/v1/chat')) return `${base}/stream`
  return `${base.replace(/\/$/, '')}/v1/chat/stream`
}

export async function fetchAgentChatUpstream(
  body: AgentChatRequestBody,
): Promise<{ ok: boolean; status: number; data: AgentChatApiResponse }> {
  const started = Date.now()
  const { message, threadId, threadTitle } = body

  if (isValidThreadId(threadId)) {
    try {
      await appendChatActivity(threadId, {
        type: 'chat_request',
        threadTitle,
        messagePreview: message.slice(0, 240),
      })
    } catch {
      /* best-effort */
    }
  }

  const upstream = openclawChatUrl()
  if (!upstream) {
    try {
      await appendAgentChatLog({ type: 'chat_demo', threadId, threadTitle })
    } catch {
      /* ignore */
    }
    return { ok: true, status: 200, data: { demo: true, reply: DEMO_REPLY } }
  }

  try {
    const res = await fetch(upstream, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ message, threadTitle, threadId }),
      signal: AbortSignal.timeout(120_000),
    })

    const durationMs = Date.now() - started

    const text = await res.text()
    let parsed: unknown
    try {
      parsed = JSON.parse(text) as unknown
    } catch {
      parsed = { reply: text }
    }

    try {
      if (isValidThreadId(threadId)) {
        await appendChatActivity(threadId, {
          type: 'chat_response',
          ok: res.ok,
          status: res.status,
          durationMs,
          demo: false,
        })
      }
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
      const err =
        typeof parsed === 'object' && parsed && 'error' in parsed
          ? String((parsed as { error: unknown }).error)
          : text || res.statusText
      return { ok: false, status: res.status, data: { error: err } }
    }

    return { ok: true, status: res.status, data: normalizeAgentChatUpstreamJson(parsed, text) }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Upstream request failed'
    try {
      if (isValidThreadId(threadId)) {
        await appendChatActivity(threadId, {
          type: 'chat_error',
          error: msg,
          durationMs: Date.now() - started,
        })
      }
    } catch {
      /* ignore */
    }
    return { ok: false, status: 502, data: { error: msg } }
  }
}

/** Chunk text for simulated/demo SSE when upstream has no stream body. */
export function* chunkTextForStream(text: string, chunkSize = 12): Generator<string> {
  let i = 0
  while (i < text.length) {
    yield text.slice(i, i + chunkSize)
    i += chunkSize
  }
}

export function formatSse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}
