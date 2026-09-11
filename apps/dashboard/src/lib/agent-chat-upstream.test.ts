import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  chatStreamEnabled,
  chunkTextForStream,
  fetchAgentChatUpstream,
  formatSse,
  openclawChatUrl,
  openclawStreamUrl,
} from './agent-chat-upstream.server'

vi.mock('@/lib/chat-vault-store.server', () => ({
  appendAgentChatLog: vi.fn(async () => {}),
  appendChatActivity: vi.fn(async () => {}),
  isValidThreadId: vi.fn(() => false),
}))

describe('agent-chat-upstream helpers', () => {
  const env = process.env

  beforeEach(() => {
    process.env = { ...env }
    delete process.env.CLAWQL_DASHBOARD_OPENCLAW_CHAT_URL
    delete process.env.CLAWQL_DASHBOARD_CHAT_STREAM
  })

  afterEach(() => {
    process.env = env
    vi.unstubAllGlobals()
  })

  it('openclawStreamUrl derives stream endpoint from chat base', () => {
    process.env.CLAWQL_DASHBOARD_OPENCLAW_CHAT_URL = 'http://127.0.0.1:8787/v1/chat'
    expect(openclawStreamUrl()).toBe('http://127.0.0.1:8787/v1/chat/stream')
    process.env.CLAWQL_DASHBOARD_OPENCLAW_CHAT_URL = 'http://127.0.0.1:8787/v1/chat/stream'
    expect(openclawStreamUrl()).toBe('http://127.0.0.1:8787/v1/chat/stream')
    process.env.CLAWQL_DASHBOARD_OPENCLAW_CHAT_URL = 'http://127.0.0.1:8787'
    expect(openclawStreamUrl()).toBe('http://127.0.0.1:8787/v1/chat/stream')
  })

  it('chatStreamEnabled is on unless explicitly disabled', () => {
    expect(chatStreamEnabled()).toBe(true)
    process.env.CLAWQL_DASHBOARD_CHAT_STREAM = '0'
    expect(chatStreamEnabled()).toBe(false)
  })

  it('openclawChatUrl returns undefined when unset', () => {
    expect(openclawChatUrl()).toBeUndefined()
    process.env.CLAWQL_DASHBOARD_OPENCLAW_CHAT_URL = '  '
    expect(openclawChatUrl()).toBeUndefined()
  })

  it('chunkTextForStream yields fixed-size chunks', () => {
    expect([...chunkTextForStream('hello world', 5)]).toEqual(['hello', ' worl', 'd'])
  })

  it('formatSse serializes event blocks', () => {
    expect(formatSse('done', { type: 'done', reply: 'ok' })).toBe(
      'event: done\ndata: {"type":"done","reply":"ok"}\n\n',
    )
  })

  it('fetchAgentChatUpstream returns demo payload when URL unset', async () => {
    const result = await fetchAgentChatUpstream({
      message: 'hello',
      threadId: 'clawql-dashboard',
    })
    expect(result.ok).toBe(true)
    expect(result.data.demo).toBe(true)
    expect(result.data.reply).toContain('OpenClaw proxy is not configured')
  })

  it('fetchAgentChatUpstream normalizes rich bridge JSON', async () => {
    process.env.CLAWQL_DASHBOARD_OPENCLAW_CHAT_URL = 'http://127.0.0.1:8787/v1/chat'
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          reply: 'archived',
          steps: [{ label: 'execute paperless::x', state: 'done' }],
          attachments: [{ kind: 'document', id: 'd1', title: 'doc', provider: 'paperless', paperlessId: 9 }],
        }),
      ),
    )

    const result = await fetchAgentChatUpstream({
      message: 'process doc',
      threadId: 'clawql-dashboard',
    })
    expect(result.ok).toBe(true)
    expect(result.data.reply).toBe('archived')
    expect(result.data.steps).toHaveLength(1)
    expect(result.data.attachments?.[0]).toMatchObject({ paperlessId: 9 })
  })

  it('fetchAgentChatUpstream surfaces upstream errors', async () => {
    process.env.CLAWQL_DASHBOARD_OPENCLAW_CHAT_URL = 'http://127.0.0.1:8787/v1/chat'
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ error: 'model timeout' }, { status: 502 })),
    )

    const result = await fetchAgentChatUpstream({
      message: 'hello',
      threadId: 'clawql-dashboard',
    })
    expect(result.ok).toBe(false)
    expect(result.status).toBe(502)
    expect(result.data.error).toBe('model timeout')
  })
})
