export type DashboardSection =
  | 'agent-chat'
  | 'memory'
  | 'documents'
  | 'tasks'
  | 'activity'
  | 'applications'
  | 'configuration'

export type ChatUserMessage = {
  kind: 'user'
  id: string
  text: string
}

export type ChatToolStep = { label: string; state: 'done' | 'active' | 'pending' }

export type ChatAgentMessage = {
  kind: 'agent'
  id: string
  status: 'running' | 'queued' | 'done'
  intro: string
  steps?: ChatToolStep[]
}

export type ChatMessage = ChatUserMessage | ChatAgentMessage

export type ChatThread = {
  id: string
  title: string
  /** Epoch ms — used for sort order and relative labels */
  updatedAt: number
}
