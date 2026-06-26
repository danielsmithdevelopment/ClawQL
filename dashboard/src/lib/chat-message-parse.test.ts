import { describe, expect, it } from 'vitest'

import { parseChatMessageLine } from './chat-message-parse'

describe('parseChatMessageLine', () => {
  it('parses user messages', () => {
    expect(parseChatMessageLine(JSON.stringify({ kind: 'user', id: 'u1', text: 'hi' }))).toEqual({
      kind: 'user',
      id: 'u1',
      text: 'hi',
    })
  })

  it('parses agent messages with optional IDP fields', () => {
    const line = JSON.stringify({
      kind: 'agent',
      id: 'a1',
      status: 'done',
      intro: 'Summary',
      steps: [{ label: 'execute paperless::x', state: 'done' }],
      attachments: [{ kind: 'document', id: 'd1', title: 'doc', provider: 'paperless', paperlessId: 3 }],
      citations: [{ kind: 'onyx_citation', id: 'c1', title: 'cite' }],
      toolCalls: [{ name: 'clawql__execute' }],
      pipelineStatus: { phases: ['paperless'] },
    })
    const msg = parseChatMessageLine(line)
    expect(msg?.kind).toBe('agent')
    if (msg?.kind === 'agent') {
      expect(msg.steps).toHaveLength(1)
      expect(msg.attachments).toHaveLength(1)
      expect(msg.citations).toHaveLength(1)
      expect(msg.toolCalls).toHaveLength(1)
      expect(msg.pipelineStatus?.phases).toEqual(['paperless'])
    }
  })

  it('rejects invalid agent status', () => {
    expect(
      parseChatMessageLine(JSON.stringify({ kind: 'agent', id: 'a1', status: 'invalid', intro: 'x' })),
    ).toBeNull()
  })

  it('returns null for malformed JSON', () => {
    expect(parseChatMessageLine('{not json')).toBeNull()
    expect(parseChatMessageLine('')).toBeNull()
  })
})
