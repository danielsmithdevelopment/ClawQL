import { describe, expect, it, vi } from 'vitest'

import {
  postAnalyticsPageview,
  shouldLogAnalyticsClientFailures,
} from './analytics-pageview-client'

describe('analytics-pageview-client', () => {
  it('logs failures only in development or debug mode', () => {
    const env = process.env as Record<string, string | undefined>
    env.NODE_ENV = 'production'
    delete env.NEXT_PUBLIC_CLAWQL_ANALYTICS_DEBUG
    expect(shouldLogAnalyticsClientFailures()).toBe(false)

    env.NEXT_PUBLIC_CLAWQL_ANALYTICS_DEBUG = '1'
    expect(shouldLogAnalyticsClientFailures()).toBe(true)
  })

  it('warns on non-OK collector responses when debug is on', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const env = process.env as Record<string, string | undefined>
    env.NODE_ENV = 'production'
    env.NEXT_PUBLIC_CLAWQL_ANALYTICS_DEBUG = '1'

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 503,
        json: async () => ({ reason: 'analytics_disabled' }),
      })),
    )

    await postAnalyticsPageview('/api/analytics/pageview', {
      path: '/',
      sessionId: 'sess-1',
      timestamp: new Date().toISOString(),
    })

    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
    vi.unstubAllGlobals()
  })
})
