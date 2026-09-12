import { describe, expect, it } from 'vitest'

import { isValidThreadId, parseThreadId, sanitizeThreadId } from './chat-vault-store.server'

describe('chat-vault-store thread ids', () => {
  it('parseThreadId accepts thread-<digits>', () => {
    expect(parseThreadId('thread-1782327735505')).toEqual({
      id: 'thread-1782327735505',
      storageKey: '1782327735505',
    })
  })

  it('rejects invalid thread ids', () => {
    expect(() => parseThreadId('thread-abc')).toThrow('Invalid thread id')
    expect(() => parseThreadId('not-a-thread')).toThrow('Invalid thread id')
    expect(isValidThreadId('thread-123')).toBe(true)
    expect(isValidThreadId('bad')).toBe(false)
  })

  it('sanitizeThreadId normalizes valid ids', () => {
    expect(sanitizeThreadId('thread-42')).toBe('thread-42')
  })
})
