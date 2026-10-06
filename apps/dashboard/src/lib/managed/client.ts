'use client'

import type { ApiKeyItem } from '@/lib/managed/fixtures'
import type { ManagedUsageSnapshot } from '@/lib/managed/live/usage'
import type { ReviewItem } from '@/lib/managed/fixtures-ops'

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`Request failed (${res.status})`)
  }
  return (await res.json()) as T
}

export async function fetchManagedKeys(): Promise<{
  keys: ApiKeyItem[]
  source: 'live' | 'fixture'
}> {
  return getJson('/api/managed/keys')
}

export async function issueManagedKey(input: {
  name: string
  scope?: string[]
  teamId?: string
  expiresAt?: string
}): Promise<{ key: ApiKeyItem; secret: string; source: 'live' }> {
  const res = await fetch('/api/managed/keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const body = (await res.json().catch(() => ({}))) as {
    key?: ApiKeyItem
    secret?: string
    source?: 'live'
    error?: string
  }
  if (!res.ok || !body.key || !body.secret) {
    throw new Error(body.error || `Issue failed (${res.status})`)
  }
  return { key: body.key, secret: body.secret, source: 'live' }
}

export async function fetchManagedUsage(): Promise<{
  usage: ManagedUsageSnapshot
  source: 'live' | 'fixture'
}> {
  return getJson('/api/managed/usage')
}

export async function fetchManagedReview(): Promise<{
  items: ReviewItem[]
  source: 'live' | 'fixture'
}> {
  return getJson('/api/managed/review')
}

export async function decideManagedReview(input: {
  id: string
  kind: 'change' | 'source'
  decision: 'approve' | 'decline'
}): Promise<{ ok: true; id: string; status: string }> {
  const res = await fetch('/api/managed/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const body = (await res.json().catch(() => ({}))) as {
    ok?: true
    id?: string
    status?: string
    error?: string
  }
  if (!res.ok || !body.ok || !body.id || !body.status) {
    throw new Error(body.error || `Decision failed (${res.status})`)
  }
  return { ok: true, id: body.id, status: body.status }
}
