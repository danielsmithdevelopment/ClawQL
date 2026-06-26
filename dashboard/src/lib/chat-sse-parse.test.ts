import { describe, expect, it } from 'vitest'

import { parseChatStreamEvent, parseSseBlock, splitSseBuffer } from './chat-sse-parse'

describe('parseSseBlock', () => {
  it('extracts event and data lines', () => {
    expect(parseSseBlock('event: delta\ndata: {"type":"delta","text":"hi"}')).toEqual({
      event: 'delta',
      dataLine: '{"type":"delta","text":"hi"}',
    })
  })
})

describe('parseChatStreamEvent', () => {
  it('parses delta and done payloads', () => {
    expect(parseChatStreamEvent('{"type":"delta","text":"chunk"}')).toEqual({
      type: 'delta',
      text: 'chunk',
    })
    const done = parseChatStreamEvent(
      '{"type":"done","reply":"ok","steps":[{"label":"x","state":"done"}]}',
    )
    expect(done?.type).toBe('done')
    if (done?.type === 'done') {
      expect(done.reply).toBe('ok')
      expect(done.steps).toHaveLength(1)
    }
  })

  it('returns null for invalid JSON', () => {
    expect(parseChatStreamEvent('not-json')).toBeNull()
    expect(parseChatStreamEvent('')).toBeNull()
  })
})

describe('splitSseBuffer', () => {
  it('splits complete blocks and keeps remainder', () => {
    const input = 'event: delta\ndata: {"type":"delta","text":"a"}\n\nevent: delta\ndata: {"type":"delta","text":"b"}\n\nevent: del'
    const { blocks, remainder } = splitSseBuffer(input)
    expect(blocks).toHaveLength(2)
    expect(remainder).toBe('event: del')
  })
})
