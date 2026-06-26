import type { AgentChatApiResponse } from '@/components/dashboard/types'

export type ChatStreamEvent =
  | { type: 'delta'; text: string }
  | ({ type: 'done' } & AgentChatApiResponse)

export type ParsedSseBlock = {
  event: string
  dataLine: string
}

/** Parse one SSE block (`event:` + `data:` lines). */
export function parseSseBlock(block: string): ParsedSseBlock {
  const lines = block.split('\n')
  let event = 'message'
  let dataLine = ''
  for (const line of lines) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    if (line.startsWith('data:')) dataLine = line.slice(5).trim()
  }
  return { event, dataLine }
}

export function parseChatStreamEvent(dataLine: string): ChatStreamEvent | null {
  if (!dataLine) return null
  try {
    return JSON.parse(dataLine) as ChatStreamEvent
  } catch {
    return null
  }
}

/** Split buffered SSE bytes into complete blocks (trailing partial block returned). */
export function splitSseBuffer(buffer: string): { blocks: string[]; remainder: string } {
  const parts = buffer.split('\n\n')
  const remainder = parts.pop() ?? ''
  return { blocks: parts.filter((p) => p.trim()), remainder }
}
