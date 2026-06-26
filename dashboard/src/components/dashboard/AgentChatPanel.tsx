'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { AgentConversation } from '@/components/agent-chat/AgentConversation'
import { ChatComposer } from '@/components/agent-chat/ChatComposer'
import type { AgentChatApiResponse, ChatAgentMessage, ChatMessage } from '@/components/dashboard/types'
import type { ChatThread } from '@/components/dashboard/types'
import {
  fetchChatMessages,
  patchChatThreadApi,
  saveChatMessagesApi,
  titleFromFirstMessage,
} from '@/lib/chat-storage'
import { consumeAgentChatStream, sendAgentChatJson } from '@/lib/chat-stream.client'

function agentMessageFromApi(id: string, data: AgentChatApiResponse, status: ChatAgentMessage['status']): ChatAgentMessage {
  return {
    kind: 'agent',
    id,
    status,
    intro: data.reply ?? data.error ?? '(empty response)',
    steps: data.steps,
    attachments: data.attachments,
    citations: data.citations,
    toolCalls: data.toolCalls,
    pipelineStatus: data.pipelineStatus,
  }
}

export function AgentChatPanel({
  threadId,
  threadTitle,
  onThreadActivity,
  onThreadMetaFromServer,
}: {
  threadId: string
  threadTitle: string
  onThreadActivity?: (patch: { title?: string; updatedAt: number }) => void
  onThreadMetaFromServer?: (thread: ChatThread) => void
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [messagesLoadedFor, setMessagesLoadedFor] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamEnabled, setStreamEnabled] = useState(true)
  const [proxyHint, setProxyHint] = useState<string | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoadError(null)
      try {
        const loaded = await fetchChatMessages(threadId)
        if (cancelled) return
        setMessages(loaded)
        setMessagesLoadedFor(threadId)
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : 'Failed to load messages')
          setMessages([])
          setMessagesLoadedFor(threadId)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [threadId])

  useEffect(() => {
    if (messagesLoadedFor !== threadId) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      void saveChatMessagesApi(threadId, messages).catch(() => {
        setLoadError('Failed to save messages to vault')
      })
    }, 400)
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [threadId, messages, messagesLoadedFor])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const r = await fetch('/api/agent/config')
        const j = (await r.json()) as { openclawConfigured?: boolean; chatStream?: boolean }
        if (!cancelled) {
          if (j.openclawConfigured === false) {
            setProxyHint(
              'OpenClaw proxy URL is not set on this dashboard. Set CLAWQL_DASHBOARD_OPENCLAW_CHAT_URL on the pod to reach your in-cluster OpenClaw agent.',
            )
          } else {
            setProxyHint(null)
          }
          setStreamEnabled(j.chatStream !== false)
        }
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const touchThread = useCallback(
    async (patch?: { title?: string }) => {
      const updatedAt = Date.now()
      onThreadActivity?.({ ...patch, updatedAt })
      try {
        const thread = await patchChatThreadApi(threadId, { ...patch, updatedAt })
        onThreadMetaFromServer?.(thread)
      } catch {
        /* index may still update from activity callback */
      }
    },
    [onThreadActivity, onThreadMetaFromServer, threadId],
  )

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    setSending(true)
    setIsStreaming(false)

    const uid = `u-${Date.now()}`
    const aid = `a-${Date.now()}`
    const isFirstUserMessage = messages.every((b) => b.kind !== 'user')

    setMessages((prev) => [
      ...prev,
      { kind: 'user', id: uid, text },
      { kind: 'agent', id: aid, status: 'running', intro: '' },
    ])
    void touchThread(
      isFirstUserMessage && threadTitle === 'New chat' ? { title: titleFromFirstMessage(text) } : undefined,
    )

    const payload = { message: text, threadTitle, threadId }

    const finalizeAgent = (data: AgentChatApiResponse) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === aid ? agentMessageFromApi(aid, data, 'done') : m)),
      )
      if (data.demo) {
        setProxyHint(
          'Demo mode: configure CLAWQL_DASHBOARD_OPENCLAW_CHAT_URL to stream from your bundled OpenClaw service.',
        )
      }
      void touchThread()
    }

    try {
      if (streamEnabled) {
        setIsStreaming(true)
        await consumeAgentChatStream(payload, {
          onDelta: (chunk) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aid && m.kind === 'agent' ? { ...m, intro: m.intro + chunk, status: 'running' } : m,
              ),
            )
          },
          onDone: (data) => {
            setIsStreaming(false)
            finalizeAgent(data)
          },
          onError: (err) => {
            setIsStreaming(false)
            finalizeAgent({ error: err })
          },
        })
      } else {
        const result = await sendAgentChatJson(payload)
        if (!result.ok) {
          finalizeAgent({ error: result.error ?? 'Request failed' })
        } else {
          finalizeAgent(result)
        }
      }
    } catch (e) {
      setIsStreaming(false)
      finalizeAgent({ error: e instanceof Error ? e.message : 'Request failed' })
    } finally {
      setSending(false)
      setIsStreaming(false)
    }
  }, [input, sending, threadTitle, threadId, messages, touchThread, streamEnabled])

  return (
    <div className="flex h-full min-h-0 flex-col bg-zinc-950">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-white/10 px-4 py-4 sm:px-6">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-white sm:text-xl">{threadTitle}</h1>
          <p className="mt-1 font-mono text-[11px] text-zinc-500">
            thread: <span className="text-zinc-400">{threadId}</span>
            <span className="mx-2 text-zinc-700">·</span>
            agent: <span className="text-zinc-400">claw-main</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center rounded-md border border-white/10 px-2 py-1 text-[10px] uppercase tracking-wide text-zinc-500">
            {streamEnabled ? 'SSE stream' : 'JSON mode'}
          </span>
        </div>
      </div>

      {proxyHint ? (
        <p
          className="shrink-0 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-xs text-amber-200 sm:px-6"
          role="status"
        >
          {proxyHint}
        </p>
      ) : null}
      {loadError ? (
        <p
          className="shrink-0 border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-xs text-red-200 sm:px-6"
          role="alert"
        >
          {loadError}
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col">
        <AgentConversation
          messages={messages}
          isStreaming={isStreaming}
          loading={messagesLoadedFor !== threadId}
        />
      </div>

      <ChatComposer input={input} sending={sending} onInputChange={setInput} onSend={() => void send()} />
    </div>
  )
}
