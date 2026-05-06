export type DashboardSection =
  | 'agent-chat'
  | 'memory'
  | 'documents'
  | 'tasks'
  | 'activity'
  | 'applications'
  | 'configuration'

export type ChatThread = {
  id: string
  title: string
  updatedAtLabel: string
  dot?: 'green' | 'amber' | 'zinc'
}
