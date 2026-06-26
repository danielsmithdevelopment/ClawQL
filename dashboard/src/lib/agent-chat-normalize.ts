import type { AgentChatApiResponse } from '@/components/dashboard/types'

/** Normalize OpenClaw bridge / upstream JSON into dashboard API shape. */
export function normalizeAgentChatUpstreamJson(parsed: unknown, textFallback: string): AgentChatApiResponse {
  if (typeof parsed !== 'object' || parsed === null) {
    return { reply: textFallback }
  }
  const row = parsed as AgentChatApiResponse & Record<string, unknown>
  if (typeof row.error === 'string' && row.error) {
    return { error: row.error }
  }
  const reply =
    typeof row.reply === 'string'
      ? row.reply
      : textFallback || '(empty response)'
  return {
    reply,
    demo: row.demo === true,
    steps: Array.isArray(row.steps) ? row.steps : undefined,
    attachments: Array.isArray(row.attachments) ? row.attachments : undefined,
    citations: Array.isArray(row.citations) ? row.citations : undefined,
    toolCalls: Array.isArray(row.toolCalls) ? row.toolCalls : undefined,
    pipelineStatus:
      row.pipelineStatus && typeof row.pipelineStatus === 'object'
        ? (row.pipelineStatus as AgentChatApiResponse['pipelineStatus'])
        : undefined,
  }
}
