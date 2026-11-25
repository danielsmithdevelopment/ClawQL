import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { k8sSyncAllowed, k8sSyncAuthOk } from './k8s-dashboard-auth'

describe('k8s-dashboard-auth', () => {
  const keys = ['CLAWQL_DASHBOARD_ALLOW_K8S_SYNC', 'CLAWQL_DASHBOARD_SYNC_TOKEN', 'NODE_ENV'] as const
  const prev: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const k of keys) {
      prev[k] = process.env[k]
      delete process.env[k]
    }
  })

  afterEach(() => {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k]
      else process.env[k] = prev[k]
    }
  })

  it('allows sync in non-production by default', () => {
    process.env.NODE_ENV = 'development'
    expect(k8sSyncAllowed()).toBe(true)
  })

  it('requires explicit opt-in in production', () => {
    process.env.NODE_ENV = 'production'
    expect(k8sSyncAllowed()).toBe(false)
    process.env.CLAWQL_DASHBOARD_ALLOW_K8S_SYNC = '1'
    expect(k8sSyncAllowed()).toBe(true)
  })

  it('fails closed when sync token is unset', () => {
    const req = new Request('http://localhost/api/k8s/sync-secret', {
      headers: { authorization: 'Bearer anything' },
    })
    expect(k8sSyncAuthOk(req)).toBe(false)
  })

  it('accepts matching Bearer token', () => {
    process.env.CLAWQL_DASHBOARD_SYNC_TOKEN = 'secret-token'
    const ok = new Request('http://localhost/api/k8s/sync-secret', {
      headers: { authorization: 'Bearer secret-token' },
    })
    const bad = new Request('http://localhost/api/k8s/sync-secret', {
      headers: { authorization: 'Bearer wrong' },
    })
    expect(k8sSyncAuthOk(ok)).toBe(true)
    expect(k8sSyncAuthOk(bad)).toBe(false)
  })
})
