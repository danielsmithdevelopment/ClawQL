export type DashboardSection =
  | 'agent-chat'
  | 'memory'
  | 'documents'
  | 'tasks'
  | 'activity'
  | 'applications'
  | 'configuration'
  | 'custom-sources'

export type ChatToolStep = { label: string; state: 'done' | 'active' | 'pending' }

export type ChatAttachment =
  | {
      kind: 'document'
      id: string
      title: string
      provider: 'paperless' | 'nextcloud'
      url?: string
      paperlessId?: number
    }
  | {
      kind: 'onyx_citation'
      id: string
      title: string
      snippet?: string
      score?: number
      documentId?: string
    }
  | {
      kind: 'coneshare'
      id: string
      title: string
      roomUrl?: string
      linkId?: string
    }
  | {
      kind: 'pipeline'
      id: string
      title?: string
      stage: string
      status: 'running' | 'done' | 'failed'
      merkleRoot?: string
    }

export type ChatToolCall = {
  name: string
  args?: unknown
  resultPreview?: string
}

export type ChatPipelineStatus = {
  workflowId?: string
  phases?: string[]
}

export type ChatUserMessage = {
  kind: 'user'
  id: string
  text: string
}

export type ChatAgentMessage = {
  kind: 'agent'
  id: string
  status: 'running' | 'queued' | 'done'
  intro: string
  steps?: ChatToolStep[]
  attachments?: ChatAttachment[]
  citations?: ChatAttachment[]
  toolCalls?: ChatToolCall[]
  pipelineStatus?: ChatPipelineStatus
}

export type ChatMessage = ChatUserMessage | ChatAgentMessage

export type ChatThread = {
  id: string
  title: string
  /** Epoch ms — used for sort order and relative labels */
  updatedAt: number
}

/** Wire format from POST /api/agent/chat and SSE `done` events. */
export type AgentChatApiResponse = {
  reply?: string
  demo?: boolean
  error?: string
  steps?: ChatToolStep[]
  attachments?: ChatAttachment[]
  citations?: ChatAttachment[]
  toolCalls?: ChatToolCall[]
  pipelineStatus?: ChatPipelineStatus
}
