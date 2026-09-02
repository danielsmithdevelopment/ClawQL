'use client'

import { create } from 'zustand'

const STORAGE_KEY = 'clawql-webmcp-agent-lab'

type Persisted = {
  unlocked: boolean
  claimedAt: string | null
}

function readPersisted(): Persisted {
  if (typeof window === 'undefined') {
    return { unlocked: false, claimedAt: null }
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { unlocked: false, claimedAt: null }
    const parsed = JSON.parse(raw) as Persisted
    return {
      unlocked: Boolean(parsed.unlocked),
      claimedAt: parsed.claimedAt ?? null,
    }
  } catch {
    return { unlocked: false, claimedAt: null }
  }
}

function writePersisted(state: Persisted) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

type AgentLabState = {
  open: boolean
  unlocked: boolean
  claimedAt: string | null
  hydrate: () => void
  reveal: () => { ok: true; unlocked: true; open: true }
  close: () => void
  markClaimed: () => { ok: true; claimedAt: string }
}

/**
 * Agent-only lab surface (Cloudflare-style unlock):
 * hidden until a WebMCP tool reveals it; then persisted in localStorage.
 */
export const useAgentLabStore = create<AgentLabState>((set, get) => ({
  open: false,
  unlocked: false,
  claimedAt: null,
  hydrate() {
    const persisted = readPersisted()
    set({
      unlocked: persisted.unlocked,
      claimedAt: persisted.claimedAt,
      open: persisted.unlocked ? get().open : false,
    })
  },
  reveal() {
    writePersisted({
      unlocked: true,
      claimedAt: get().claimedAt,
    })
    set({ unlocked: true, open: true })
    return { ok: true as const, unlocked: true as const, open: true as const }
  },
  close() {
    set({ open: false })
  },
  markClaimed() {
    const claimedAt = new Date().toISOString()
    writePersisted({ unlocked: true, claimedAt })
    set({ unlocked: true, open: true, claimedAt })
    return { ok: true as const, claimedAt }
  },
}))
