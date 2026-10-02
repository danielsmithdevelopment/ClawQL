import { describe, expect, it } from 'vitest'

import { normalizeAgentChatUpstreamJson } from './agent-chat-normalize'

describe('normalizeAgentChatUpstreamJson', () => {
  it('passes through rich IDP fields', () => {
    const out = normalizeAgentChatUpstreamJson(
      {
        reply: 'done',
        steps: [{ label: 'execute paperless::x', state: 'done' }],
        attachments: [{ kind: 'document', id: 'd1', title: 'x', provider: 'paperless', paperlessId: 1 }],
        citations: [{ kind: 'onyx_citation', id: 'c1', title: 'cite' }],
        toolCalls: [{ name: 'clawql__execute' }],
        pipelineStatus: { phases: ['paperless'] },
      },
      '',
    )
    expect(out.reply).toBe('done')
    expect(out.steps).toHaveLength(1)
    expect(out.attachments).toHaveLength(1)
    expect(out.citations).toHaveLength(1)
    expect(out.toolCalls).toHaveLength(1)
    expect(out.pipelineStatus?.phases).toEqual(['paperless'])
  })

  it('returns error envelope when upstream reports error', () => {
    expect(normalizeAgentChatUpstreamJson({ error: 'upstream failed' }, '')).toEqual({
      error: 'upstream failed',
    })
  })

  it('falls back to text when reply missing', () => {
    expect(normalizeAgentChatUpstreamJson({}, 'raw text')).toMatchObject({ reply: 'raw text' })
  })

  it('ignores non-array optional fields', () => {
    const out = normalizeAgentChatUpstreamJson({ reply: 'x', steps: 'bad' }, '')
    expect(out.steps).toBeUndefined()
  })
})
