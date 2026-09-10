import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { replyFromAgentJson } from './openclaw-reply-from-json.mjs'

describe('replyFromAgentJson', () => {
  it('extracts reply field', () => {
    assert.equal(replyFromAgentJson({ reply: 'hello' }), 'hello')
  })

  it('joins payloads text', () => {
    assert.equal(
      replyFromAgentJson({ payloads: [{ text: 'part one' }, { text: 'part two' }] }),
      'part one\n\npart two',
    )
  })

  it('uses meta.finalAssistantVisibleText', () => {
    assert.equal(
      replyFromAgentJson({ meta: { finalAssistantVisibleText: ' visible ' } }),
      'visible',
    )
  })

  it('falls back to JSON stringify for unknown shapes', () => {
    const out = replyFromAgentJson({ foo: 'bar' })
    assert.match(out, /"foo"/)
  })
})
