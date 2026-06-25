import { access, appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join, resolve, sep } from 'node:path'

import type { ChatAgentMessage, ChatMessage, ChatUserMessage } from '@/components/dashboard/types'

import { getObsidianVaultRoot } from './vault-path.server'

const INDEX_VERSION = 1
const THREAD_ID_RE = /^thread-[0-9]+$/

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

/** Validates and returns a safe thread id for filesystem paths (CodeQL: no traversal). */
export function sanitizeThreadId(threadId: string): string {
  const trimmed = threadId.trim()
  if (!THREAD_ID_RE.test(trimmed)) {
    throw new Error('Invalid thread id')
  }
  return trimmed
}

export function assertValidThreadId(threadId: string): void {
  sanitizeThreadId(threadId)
}

export function isValidThreadId(threadId: string): boolean {
  return THREAD_ID_RE.test(threadId.trim())
}

export function chatsRootPath(vaultRoot: string): string {
  return join(vaultRoot, 'Dashboard', 'chats')
}

export function logsRootPath(vaultRoot: string): string {
  return join(vaultRoot, 'Dashboard', 'logs')
}

function indexFilePath(vaultRoot: string): string {
  return join(chatsRootPath(vaultRoot), 'index.json')
}

function threadsRootDir(vaultRoot: string): string {
  return resolve(chatsRootPath(vaultRoot), 'threads')
}

function threadDir(vaultRoot: string, safeThreadId: string): string {
  const root = threadsRootDir(vaultRoot)
  const dir = resolve(root, safeThreadId)
  if (dir !== root && !dir.startsWith(`${root}${sep}`)) {
    throw new Error('Invalid thread path')
  }
  return dir
}

function metaFilePath(vaultRoot: string, safeThreadId: string): string {
  return join(threadDir(vaultRoot, safeThreadId), 'meta.json')
}

function messagesFilePath(vaultRoot: string, safeThreadId: string): string {
  return join(threadDir(vaultRoot, safeThreadId), 'messages.jsonl')
}

function activityFilePath(vaultRoot: string, safeThreadId: string): string {
  return join(threadDir(vaultRoot, safeThreadId), 'activity.jsonl')
}

function agentChatLogPath(vaultRoot: string): string {
  return join(logsRootPath(vaultRoot), 'agent-chat.jsonl')
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
  await mkdir(logsRootPath(vaultRoot), { recursive: true })
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
  const id = sanitizeThreadId(`thread-${Date.now()}`)
  const meta: ChatThreadMeta = { id, title, createdAt: now, updatedAt: now }
  await mkdir(threadDir(vaultRoot, id), { recursive: true })
  await writeFile(metaFilePath(vaultRoot, id), `${JSON.stringify(meta, null, 2)}\n`, 'utf8')
  await writeFile(messagesFilePath(vaultRoot, id), '', 'utf8')
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
  const safeId = sanitizeThreadId(threadId)
  const metaPath = metaFilePath(vaultRoot, safeId)
  let meta: ChatThreadMeta
  try {
    meta = JSON.parse(await readFile(metaPath, 'utf8')) as ChatThreadMeta
  } catch {
    throw new Error('Thread not found')
  }
  if (patch.title !== undefined) meta.title = patch.title
  meta.updatedAt = patch.updatedAt ?? new Date().toISOString()
  await writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8')
  const index = await readIndex(vaultRoot)
  index.threads = index.threads.map((t) => (t.id === safeId ? meta : t))
  if (!index.threads.some((t) => t.id === safeId)) {
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
  const safeId = sanitizeThreadId(threadId)
  try {
    const raw = await readFile(messagesFilePath(vaultRoot, safeId), 'utf8')
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
  const safeId = sanitizeThreadId(threadId)
  await mkdir(threadDir(vaultRoot, safeId), { recursive: true })
  const lines = messages.map((m) => JSON.stringify({ ...m, at: new Date().toISOString() }))
  await writeFile(messagesFilePath(vaultRoot, safeId), lines.length ? `${lines.join('\n')}\n` : '', 'utf8')
  await updateChatThread(safeId, { updatedAt: new Date().toISOString() })
}

export async function appendChatActivity(
  threadId: string,
  event: Record<string, unknown>,
): Promise<void> {
  const vaultRoot = getObsidianVaultRoot()
  const safeId = sanitizeThreadId(threadId)
  await mkdir(threadDir(vaultRoot, safeId), { recursive: true })
  const row = JSON.stringify({ at: new Date().toISOString(), threadId: safeId, ...event })
  await appendFile(activityFilePath(vaultRoot, safeId), `${row}\n`, 'utf8')
}

export async function appendAgentChatLog(event: Record<string, unknown>): Promise<void> {
  const vaultRoot = getObsidianVaultRoot()
  await ensureChatDirs(vaultRoot)
  const row = JSON.stringify({ at: new Date().toISOString(), ...event })
  await appendFile(agentChatLogPath(vaultRoot), `${row}\n`, 'utf8')
}

export async function importChatThreadsFromLocal(payload: {
  threads: Array<{ id: string; title: string; updatedAt: number }>
  messagesByThreadId: Record<string, ChatMessage[]>
}): Promise<{ imported: number }> {
  const vaultRoot = getObsidianVaultRoot()
  let imported = 0
  for (const t of payload.threads) {
    let safeId: string
    try {
      safeId = sanitizeThreadId(t.id)
    } catch {
      continue
    }
    const existing = await loadChatMessages(safeId)
    if (existing.length > 0) continue
    const createdAt = new Date(t.updatedAt).toISOString()
    const meta: ChatThreadMeta = {
      id: safeId,
      title: t.title,
      createdAt,
      updatedAt: createdAt,
    }
    await mkdir(threadDir(vaultRoot, safeId), { recursive: true })
    await writeFile(metaFilePath(vaultRoot, safeId), `${JSON.stringify(meta, null, 2)}\n`, 'utf8')
    const messages = payload.messagesByThreadId[t.id] ?? []
    if (messages.length > 0) {
      await saveChatMessages(safeId, messages)
    }
    imported += 1
  }
  const index = await readIndex(vaultRoot)
  for (const t of payload.threads) {
    let safeId: string
    try {
      safeId = sanitizeThreadId(t.id)
    } catch {
      continue
    }
    if (index.threads.some((x) => x.id === safeId)) continue
    index.threads.push({
      id: safeId,
      title: t.title,
      createdAt: new Date(t.updatedAt).toISOString(),
      updatedAt: new Date(t.updatedAt).toISOString(),
    })
  }
  await writeIndex(vaultRoot, index)
  return { imported }
}

export type { ChatUserMessage, ChatAgentMessage }
