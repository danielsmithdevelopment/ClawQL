'use client'

import { Loader2, SendHorizontal } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type ToolStep = { label: string; state: 'done' | 'active' | 'pending' }

type AgentBubble = {
  kind: 'agent'
  id: string
  status: 'running' | 'queued' | 'done'
  intro: string
  steps?: ToolStep[]
}

type UserBubble = { kind: 'user'; id: string; text: string }

type Bubble = UserBubble | AgentBubble

const DEMO_BY_THREAD: Record<string, Bubble[]> = {
  'thread-1': [
    {
      kind: 'user',
      id: 'u1',
      text: 'Pull the Q1 revenue data from Snowflake and cross-reference with the Stripe invoice breakdown. Flag accounts with >15% MoM decline.',
    },
    {
      kind: 'agent',
      id: 'a1',
      status: 'running',
      intro: 'On it. Querying Snowflake now…',
      steps: [
        { label: 'Connected to Snowflake…', state: 'done' },
        { label: 'Fetched 2,847 account rows…', state: 'done' },
        { label: 'Joined with Stripe invoice data…', state: 'done' },
        { label: 'Calculating MoM delta per account…', state: 'active' },
        { label: 'Analyzing revenue trends…', state: 'pending' },
      ],
    },
    {
      kind: 'agent',
      id: 'a2',
      status: 'queued',
      intro: 'QUEUED — Waiting on Snowflake result',
      steps: [
        { label: 'Stream results to dashboard…', state: 'pending' },
        { label: 'Compose summary table…', state: 'pending' },
      ],
    },
  ],
}

function StepIcon({ state }: { state: ToolStep['state'] }) {
  if (state === 'done') {
    return <span className="text-emerald-500">✓</span>
  }
  if (state === 'active') {
    return <Loader2 className="size-3.5 animate-spin text-orange-500" aria-hidden />
  }
  return <span className="text-zinc-600">⋯</span>
}

export function AgentChatPanel({ threadId, threadTitle }: { threadId: string; threadTitle: string }) {
  const seed = useMemo(() => DEMO_BY_THREAD[threadId] ?? [], [threadId])
  const [bubbles, setBubbles] = useState<Bubble[]>(seed)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [proxyHint, setProxyHint] = useState<string | null>(null)

  useEffect(() => {
    setBubbles(DEMO_BY_THREAD[threadId] ?? [])
  }, [threadId])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const r = await fetch('/api/agent/config')
        const j = (await r.json()) as { openclawConfigured?: boolean }
        if (!cancelled && j.openclawConfigured === false) {
          setProxyHint(
            'OpenClaw proxy URL is not set on this dashboard. Set CLAWQL_DASHBOARD_OPENCLAW_CHAT_URL on the pod to reach your in-cluster OpenClaw agent.',
          )
        } else if (!cancelled) {
          setProxyHint(null)
        }
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    setSending(true)
    const uid = `u-${Date.now()}`
    setBubbles((prev) => [...prev, { kind: 'user', id: uid, text }])

    try {
      const r = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, threadTitle, threadId }),
      })
      const data = (await r.json()) as {
        reply?: string
        demo?: boolean
        error?: string
        steps?: ToolStep[]
      }
      if (!r.ok) {
        setBubbles((prev) => [
          ...prev,
          {
            kind: 'agent',
            id: `a-${Date.now()}`,
            status: 'done',
            intro: data.error ?? r.statusText,
            steps: [],
          },
        ])
        return
      }
      setBubbles((prev) => [
        ...prev,
        {
          kind: 'agent',
          id: `a-${Date.now()}`,
          status: 'done',
          intro: data.reply ?? '(empty response)',
          steps: data.steps,
        },
      ])
      if (data.demo) {
        setProxyHint(
          'Demo mode: configure CLAWQL_DASHBOARD_OPENCLAW_CHAT_URL to stream from your bundled OpenClaw service.',
        )
      }
    } catch (e) {
      setBubbles((prev) => [
        ...prev,
        {
          kind: 'agent',
          id: `a-${Date.now()}`,
          status: 'done',
          intro: e instanceof Error ? e.message : 'Request failed',
        },
      ])
    } finally {
      setSending(false)
    }
  }, [input, sending, threadTitle, threadId])

  return (
    <div className="flex h-full min-h-0 flex-col bg-zinc-950">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-white/10 px-4 py-4 sm:px-6">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-white sm:text-xl">{threadTitle}</h1>
          <p className="mt-1 font-mono text-[11px] text-zinc-500">
            agent: <span className="text-zinc-400">claw-main</span>
            <span className="mx-2 text-zinc-700">·</span>
            sandbox: <span className="text-zinc-400">docker</span>
            <span className="mx-2 text-zinc-700">·</span>
            <span className="text-zinc-500">2m ago</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" type="button" className="text-xs">
            PR #42
          </Button>
          <Button variant="outline" size="sm" type="button" className="text-xs">
            Sandbox
          </Button>
          <Button variant="outline" size="sm" type="button" className="text-xs">
            Logs
          </Button>
        </div>
      </div>

      {proxyHint ? (
        <p className="shrink-0 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-xs text-amber-200 sm:px-6" role="status">
          {proxyHint}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-6 sm:px-6">
        {bubbles.length === 0 ? (
          <p className="text-center text-sm text-zinc-500">Start the conversation — messages go to the bundled OpenClaw agent when the chat URL is configured.</p>
        ) : null}
        {bubbles.map((b) =>
          b.kind === 'user' ? (
            <div key={b.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-zinc-800 px-4 py-3 text-sm leading-relaxed text-zinc-100">
                {b.text}
              </div>
            </div>
          ) : (
            <div key={b.id} className="flex justify-start">
              <div className="max-w-[min(100%,42rem)] space-y-3">
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <span className="inline-flex size-6 items-center justify-center rounded bg-orange-500/20 text-[10px] font-bold text-orange-400">
                    C
                  </span>
                  <span className="font-medium text-zinc-300">claw — agent</span>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase',
                      b.status === 'running' && 'bg-orange-500/15 text-orange-400',
                      b.status === 'queued' && 'bg-zinc-800 text-zinc-500',
                      b.status === 'done' && 'bg-zinc-800 text-zinc-400',
                    )}
                  >
                    {b.status === 'running' ? (
                      <>
                        <span className="relative flex size-2">
                          <span className="absolute inline-flex size-full animate-ping rounded-full bg-orange-400 opacity-60" />
                          <span className="relative inline-flex size-2 rounded-full bg-orange-500" />
                        </span>
                        running
                      </>
                    ) : b.status === 'queued' ? (
                      'queued'
                    ) : (
                      'done'
                    )}
                  </span>
                </div>
                <p className="text-sm text-zinc-200">{b.intro}</p>
                {b.steps && b.steps.length > 0 ? (
                  <div className="rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-zinc-300">
                    <div className="mb-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                      <span>Tool execution</span>
                      <span className="text-orange-400">{b.status === 'running' ? '● active' : '○ idle'}</span>
                    </div>
                    <ul className="space-y-1.5">
                      {b.steps.map((s, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="shrink-0 pt-0.5">
                            <StepIcon state={s.state} />
                          </span>
                          <span className={cn(s.state === 'pending' && 'text-zinc-600')}>{s.label}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </div>
          ),
        )}
      </div>

      <div className="shrink-0 border-t border-white/10 bg-zinc-950 p-3 sm:p-4">
        <div className="mx-auto flex max-w-4xl flex-col gap-2">
          <div className="flex gap-2 rounded-xl border border-white/10 bg-zinc-900/80 p-2 shadow-inner">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send()
                }
              }}
              placeholder="Message Claw… (@mention tools, /commands)"
              className="h-11 flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0"
              disabled={sending}
            />
            <Button type="button" size="icon" className="shrink-0 bg-orange-500 text-zinc-950 hover:bg-orange-400" disabled={sending} onClick={() => void send()} aria-label="Send">
              {sending ? <Loader2 className="size-4 animate-spin" /> : <SendHorizontal className="size-4" />}
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-zinc-500">
            <span>
              <Button variant="ghost" size="sm" type="button" className="h-7 px-2 text-[11px] text-zinc-400">
                Attach
              </Button>
            </span>
            <span className="flex items-center gap-2">
              <Button variant="ghost" size="sm" type="button" className="h-7 px-2 text-[11px] text-zinc-400">
                Tool
              </Button>
              <Button variant="ghost" size="sm" type="button" className="h-7 px-2 text-[11px] text-zinc-400">
                Tools ▾
              </Button>
            </span>
          </div>
          <p className="px-1 font-mono text-[10px] text-emerald-500/90">✓ HATS: 24 queued</p>
        </div>
      </div>
    </div>
  )
}
