import { access, appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname } from 'node:path'

import type { ChatAgentMessage, ChatMessage, ChatUserMessage } from '@/components/dashboard/types'

import { getObsidianVaultRoot, resolveVaultPath } from './vault-path.server'

const INDEX_VERSION = 1
const THREAD_ID_RE = /^thread-([0-9]+)$/
const STORAGE_KEY_RE = /^[0-9]+$/

const CHAT_INDEX_REL = 'Dashboard/chats/index.json'
const CHAT_THREADS_REL = 'Dashboard/chats/threads'
const AGENT_CHAT_LOG_REL = 'Dashboard/logs/agent-chat.jsonl'

export type ChatThreadMeta = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

type ChatIndexFile = {
  version: number
  threads: ChatThreadMeta[]
}

export type ChatVaultInfo = {
  vaultRoot: string
  chatsRoot: string
  writable: boolean
}

/** Parsed thread id — storageKey is digits-only for vault-relative paths. */
export type ParsedThreadId = { id: string; storageKey: string }

export function parseThreadId(threadId: string): ParsedThreadId {
  const match = THREAD_ID_RE.exec(threadId.trim())
  if (!match?.[1] || !STORAGE_KEY_RE.test(match[1])) {
    throw new Error('Invalid thread id')
  }
  return { id: `thread-${match[1]}`, storageKey: match[1] }
}

export function sanitizeThreadId(threadId: string): string {
  return parseThreadId(threadId).id
}

export function assertValidThreadId(threadId: string): void {
  parseThreadId(threadId)
}

export function isValidThreadId(threadId: string): boolean {
  try {
    parseThreadId(threadId)
    return true
  } catch {
    return false
  }
}

function chatsRootPath(vaultRoot: string): string {
  return resolveVaultPath(vaultRoot, 'Dashboard/chats')
}

function indexFilePath(vaultRoot: string): string {
  return resolveVaultPath(vaultRoot, CHAT_INDEX_REL)
}

function threadDirRel(storageKey: string): string {
  if (!STORAGE_KEY_RE.test(storageKey)) {
    throw new Error('Invalid thread storage key')
  }
  return `${CHAT_THREADS_REL}/${storageKey}`
}

function metaFilePath(vaultRoot: string, storageKey: string): string {
  return resolveVaultPath(vaultRoot, `${threadDirRel(storageKey)}/meta.json`)
}

function messagesFilePath(vaultRoot: string, storageKey: string): string {
  return resolveVaultPath(vaultRoot, `${threadDirRel(storageKey)}/messages.jsonl`)
}

function activityFilePath(vaultRoot: string, storageKey: string): string {
  return resolveVaultPath(vaultRoot, `${threadDirRel(storageKey)}/activity.jsonl`)
}

function agentChatLogPath(vaultRoot: string): string {
  return resolveVaultPath(vaultRoot, AGENT_CHAT_LOG_REL)
}

export async function getChatVaultInfo(): Promise<ChatVaultInfo> {
  const vaultRoot = getObsidianVaultRoot()
  const chatsRoot = chatsRootPath(vaultRoot)
  let writable = false
  try {
    await mkdir(chatsRoot, { recursive: true })
    await access(vaultRoot, constants.W_OK)
    writable = true
  } catch {
    writable = false
  }
  return { vaultRoot, chatsRoot, writable }
}

async function ensureChatDirs(vaultRoot: string): Promise<void> {
  await mkdir(chatsRootPath(vaultRoot), { recursive: true })
  await mkdir(resolveVaultPath(vaultRoot, 'Dashboard/logs'), { recursive: true })
}

async function readIndex(vaultRoot: string): Promise<ChatIndexFile> {
  await ensureChatDirs(vaultRoot)
  try {
    const raw = await readFile(indexFilePath(vaultRoot), 'utf8')
    const parsed = JSON.parse(raw) as ChatIndexFile
    if (parsed?.version === INDEX_VERSION && Array.isArray(parsed.threads)) {
      return parsed
    }
  } catch {
    /* missing or corrupt — rebuild below */
  }
  return { version: INDEX_VERSION, threads: [] }
}

async function writeIndex(vaultRoot: string, index: ChatIndexFile): Promise<void> {
  await ensureChatDirs(vaultRoot)
  const sorted = [...index.threads].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )
  await writeFile(indexFilePath(vaultRoot), `${JSON.stringify({ version: INDEX_VERSION, threads: sorted }, null, 2)}\n`, 'utf8')
}

function metaToThread(meta: ChatThreadMeta): { id: string; title: string; updatedAt: number } {
  return {
    id: meta.id,
    title: meta.title,
    updatedAt: new Date(meta.updatedAt).getTime(),
  }
}

export async function listChatThreads(): Promise<{
  vaultRoot: string
  threads: Array<{ id: string; title: string; updatedAt: number }>
}> {
  const vaultRoot = getObsidianVaultRoot()
  const index = await readIndex(vaultRoot)
  return {
    vaultRoot,
    threads: index.threads.map(metaToThread),
  }
}

export async function createChatThread(title = 'New chat'): Promise<ChatThreadMeta> {
  const vaultRoot = getObsidianVaultRoot()
  const now = new Date().toISOString()
  const { id, storageKey } = parseThreadId(`thread-${Date.now()}`)
  const meta: ChatThreadMeta = { id, title, createdAt: now, updatedAt: now }
  const threadDir = resolveVaultPath(vaultRoot, threadDirRel(storageKey))
  await mkdir(threadDir, { recursive: true })
  await writeFile(metaFilePath(vaultRoot, storageKey), `${JSON.stringify(meta, null, 2)}\n`, 'utf8')
  await writeFile(messagesFilePath(vaultRoot, storageKey), '', 'utf8')
  const index = await readIndex(vaultRoot)
  index.threads = [meta, ...index.threads.filter((t) => t.id !== id)]
  await writeIndex(vaultRoot, index)
  return meta
}

export async function updateChatThread(
  threadId: string,
  patch: { title?: string; updatedAt?: string },
): Promise<ChatThreadMeta> {
  const vaultRoot = getObsidianVaultRoot()
  const { id, storageKey } = parseThreadId(threadId)
  const metaPath = metaFilePath(vaultRoot, storageKey)
  let meta: ChatThreadMeta
  try {
    meta = JSON.parse(await readFile(metaPath, 'utf8')) as ChatThreadMeta
  } catch {
    throw new Error('Thread not found')
  }
  if (patch.title !== undefined) meta.title = patch.title
  meta.updatedAt = patch.updatedAt ?? new Date().toISOString()
  meta.id = id
  await writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8')
  const index = await readIndex(vaultRoot)
  index.threads = index.threads.map((t) => (t.id === id ? meta : t))
  if (!index.threads.some((t) => t.id === id)) {
    index.threads.unshift(meta)
  }
  await writeIndex(vaultRoot, index)
  return meta
}

function parseMessageLine(line: string): ChatMessage | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  try {
    const row = JSON.parse(trimmed) as ChatMessage & { at?: string }
    if (row.kind === 'user' && typeof row.id === 'string' && typeof row.text === 'string') {
      return { kind: 'user', id: row.id, text: row.text }
    }
    if (
      row.kind === 'agent' &&
      typeof row.id === 'string' &&
      typeof row.intro === 'string' &&
      (row.status === 'running' || row.status === 'queued' || row.status === 'done')
    ) {
      return {
        kind: 'agent',
        id: row.id,
        status: row.status,
        intro: row.intro,
        steps: row.steps,
      }
    }
  } catch {
    return null
  }
  return null
}

export async function loadChatMessages(threadId: string): Promise<ChatMessage[]> {
  const vaultRoot = getObsidianVaultRoot()
  const { storageKey } = parseThreadId(threadId)
  try {
    const raw = await readFile(messagesFilePath(vaultRoot, storageKey), 'utf8')
    return raw
      .split('\n')
      .map(parseMessageLine)
      .filter((m): m is ChatMessage => m !== null)
  } catch {
    return []
  }
}

export async function saveChatMessages(threadId: string, messages: ChatMessage[]): Promise<void> {
  const vaultRoot = getObsidianVaultRoot()
  const { id, storageKey } = parseThreadId(threadId)
  const threadDir = resolveVaultPath(vaultRoot, threadDirRel(storageKey))
  await mkdir(threadDir, { recursive: true })
  const lines = messages.map((m) => JSON.stringify({ ...m, at: new Date().toISOString() }))
  await writeFile(messagesFilePath(vaultRoot, storageKey), lines.length ? `${lines.join('\n')}\n` : '', 'utf8')
  await updateChatThread(id, { updatedAt: new Date().toISOString() })
}

export async function appendChatActivity(
  threadId: string,
  event: Record<string, unknown>,
): Promise<void> {
  const vaultRoot = getObsidianVaultRoot()
  const { id, storageKey } = parseThreadId(threadId)
  const threadDir = resolveVaultPath(vaultRoot, threadDirRel(storageKey))
  await mkdir(threadDir, { recursive: true })
  const row = JSON.stringify({ at: new Date().toISOString(), threadId: id, ...event })
  await appendFile(activityFilePath(vaultRoot, storageKey), `${row}\n`, 'utf8')
}

export async function appendAgentChatLog(event: Record<string, unknown>): Promise<void> {
  const vaultRoot = getObsidianVaultRoot()
  await ensureChatDirs(vaultRoot)
  const logPath = agentChatLogPath(vaultRoot)
  await mkdir(dirname(logPath), { recursive: true })
  const row = JSON.stringify({ at: new Date().toISOString(), ...event })
  await appendFile(logPath, `${row}\n`, 'utf8')
}

export async function importChatThreadsFromLocal(payload: {
  threads: Array<{ id: string; title: string; updatedAt: number }>
  messagesByThreadId: Record<string, ChatMessage[]>
}): Promise<{ imported: number }> {
  const vaultRoot = getObsidianVaultRoot()
  let imported = 0
  for (const t of payload.threads) {
    let parsed: ParsedThreadId
    try {
      parsed = parseThreadId(t.id)
    } catch {
      continue
    }
    const existing = await loadChatMessages(parsed.id)
    if (existing.length > 0) continue
    const createdAt = new Date(t.updatedAt).toISOString()
    const meta: ChatThreadMeta = {
      id: parsed.id,
      title: t.title,
      createdAt,
      updatedAt: createdAt,
    }
    const threadDir = resolveVaultPath(vaultRoot, threadDirRel(parsed.storageKey))
    await mkdir(threadDir, { recursive: true })
    await writeFile(metaFilePath(vaultRoot, parsed.storageKey), `${JSON.stringify(meta, null, 2)}\n`, 'utf8')
    const messages = payload.messagesByThreadId[t.id] ?? []
    if (messages.length > 0) {
      await saveChatMessages(parsed.id, messages)
    }
    imported += 1
  }
  const index = await readIndex(vaultRoot)
  for (const t of payload.threads) {
    let parsed: ParsedThreadId
    try {
      parsed = parseThreadId(t.id)
    } catch {
      continue
    }
    if (index.threads.some((x) => x.id === parsed.id)) continue
    index.threads.push({
      id: parsed.id,
      title: t.title,
      createdAt: new Date(t.updatedAt).toISOString(),
      updatedAt: new Date(t.updatedAt).toISOString(),
    })
  }
  await writeIndex(vaultRoot, index)
  return { imported }
}

export type { ChatUserMessage, ChatAgentMessage }
