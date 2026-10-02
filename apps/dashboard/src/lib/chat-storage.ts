import type { ChatMessage, ChatThread } from '@/components/dashboard/types'

const THREADS_KEY = 'clawql-dashboard-chat-threads-v1'

function messagesKey(threadId: string): string {
  return `clawql-dashboard-chat-messages-v1:${threadId}`
}

export function formatThreadUpdatedAt(updatedAt: number): string {
  const diffMs = Date.now() - updatedAt
  if (diffMs < 60_000) return 'now'
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  return `${weeks}w ago`
}

export function titleFromFirstMessage(text: string, maxLen = 48): string {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  if (!oneLine) return 'New chat'
  if (oneLine.length <= maxLen) return oneLine
  return `${oneLine.slice(0, maxLen - 1).trimEnd()}…`
}

export type ChatVaultStatus = {
  vaultRoot: string
  chatsRoot?: string
  writable: boolean
  threads: ChatThread[]
}

export async function fetchChatVault(): Promise<ChatVaultStatus> {
  const r = await fetch('/api/agent/chats', { cache: 'no-store' })
  const data = (await r.json()) as ChatVaultStatus & { error?: string }
  if (!r.ok) throw new Error(data.error ?? r.statusText)
  return data
}

export async function createChatThreadApi(title = 'New chat'): Promise<ChatThread> {
  const r = await fetch('/api/agent/chats', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
  const data = (await r.json()) as { thread?: ChatThread; error?: string }
  if (!r.ok || !data.thread) throw new Error(data.error ?? 'Failed to create chat')
  return data.thread
}

export async function fetchChatMessages(threadId: string): Promise<ChatMessage[]> {
  const r = await fetch(`/api/agent/chats/${encodeURIComponent(threadId)}`, { cache: 'no-store' })
  const data = (await r.json()) as { messages?: ChatMessage[]; error?: string }
  if (!r.ok) throw new Error(data.error ?? r.statusText)
  return data.messages ?? []
}

export async function saveChatMessagesApi(threadId: string, messages: ChatMessage[]): Promise<void> {
  const r = await fetch(`/api/agent/chats/${encodeURIComponent(threadId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  })
  const data = (await r.json()) as { error?: string }
  if (!r.ok) throw new Error(data.error ?? 'Failed to save messages')
}

export async function patchChatThreadApi(
  threadId: string,
  patch: { title?: string; updatedAt?: number },
): Promise<ChatThread> {
  const r = await fetch(`/api/agent/chats/${encodeURIComponent(threadId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  const data = (await r.json()) as { thread?: ChatThread; error?: string }
  if (!r.ok || !data.thread) throw new Error(data.error ?? 'Failed to update thread')
  return data.thread
}

/** Legacy browser storage — imported into vault on first load when vault is empty. */
export function loadLegacyLocalThreads(): ChatThread[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(THREADS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (t): t is ChatThread =>
        typeof t === 'object' &&
        t !== null &&
        typeof (t as ChatThread).id === 'string' &&
        typeof (t as ChatThread).title === 'string' &&
        typeof (t as ChatThread).updatedAt === 'number',
    )
  } catch {
    return []
  }
}

export function loadLegacyLocalMessages(threadId: string): ChatMessage[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(messagesKey(threadId))
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as ChatMessage[]) : []
  } catch {
    return []
  }
}

export async function importLegacyLocalChatsToVault(): Promise<number> {
  const threads = loadLegacyLocalThreads()
  if (threads.length === 0) return 0
  const messagesByThreadId: Record<string, ChatMessage[]> = {}
  for (const t of threads) {
    messagesByThreadId[t.id] = loadLegacyLocalMessages(t.id)
  }
  const r = await fetch('/api/agent/chats', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ threads, messagesByThreadId }),
  })
  const data = (await r.json()) as { imported?: number; error?: string }
  if (!r.ok) throw new Error(data.error ?? 'Import failed')
  if ((data.imported ?? 0) > 0) {
    window.localStorage.removeItem(THREADS_KEY)
    for (const t of threads) {
      window.localStorage.removeItem(messagesKey(t.id))
    }
  }
  return data.imported ?? 0
}
