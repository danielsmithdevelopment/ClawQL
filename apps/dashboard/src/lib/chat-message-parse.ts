import type { ChatMessage } from '@/components/dashboard/types'

/** Parse one JSONL line from vault `messages.jsonl` (exported for unit tests). */
export function parseChatMessageLine(line: string): ChatMessage | null {
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
        attachments: row.attachments,
        citations: row.citations,
        toolCalls: row.toolCalls,
        pipelineStatus: row.pipelineStatus,
      }
    }
  } catch {
    return null
  }
  return null
}
