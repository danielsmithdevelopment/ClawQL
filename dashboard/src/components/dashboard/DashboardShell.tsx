'use client'

import { Group, Panel, Separator } from 'react-resizable-panels'
import { useMemo, useState } from 'react'

import type { EnvCatalog } from '@/lib/env-catalog'
import { EnvForm } from '@/components/EnvForm'

import { AgentChatPanel } from './AgentChatPanel'
import { AppHeader } from './AppHeader'
import { ChatThreadsSidebar } from './ChatThreadsSidebar'
import { PlaceholderPanel } from './PlaceholderPanel'
import { PrimaryNav } from './PrimaryNav'
import type { ChatThread, DashboardSection } from './types'

const INITIAL_THREADS: ChatThread[] = [
  { id: 'thread-1', title: 'Quarterly Reports', updatedAtLabel: '2m ago', dot: 'green' },
  { id: 'thread-2', title: 'New Payment Provider', updatedAtLabel: '18h ago', dot: 'amber' },
  { id: 'thread-3', title: 'Publish New Analysis', updatedAtLabel: '1d ago' },
  { id: 'thread-4', title: 'Incident Post-mortem', updatedAtLabel: '2d ago' },
  { id: 'thread-5', title: 'On-Call Rot', updatedAtLabel: '3d ago', dot: 'zinc' },
  { id: 'thread-6', title: 'Architecture Overview', updatedAtLabel: '4d ago' },
  { id: 'thread-7', title: 'Monitoring', updatedAtLabel: '5d ago' },
  { id: 'thread-8', title: 'Generate OpenAPI', updatedAtLabel: '1w ago' },
  { id: 'thread-9', title: 'Pipeline', updatedAtLabel: '1w ago' },
]

export function DashboardShell({ catalog }: { catalog: EnvCatalog }) {
  const [section, setSection] = useState<DashboardSection>('agent-chat')
  const [threads, setThreads] = useState<ChatThread[]>(INITIAL_THREADS)
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>('thread-1')
  const [threadFilter, setThreadFilter] = useState('')

  const selectedTitle = useMemo(() => {
    const t = threads.find((x) => x.id === selectedThreadId)
    return t?.title ?? 'New chat'
  }, [threads, selectedThreadId])

  const filteredThreads = useMemo(() => {
    const q = threadFilter.trim().toLowerCase()
    if (!q) return threads
    return threads.filter((t) => t.title.toLowerCase().includes(q))
  }, [threads, threadFilter])

  const onNewChat = () => {
    const id = `thread-${Date.now()}`
    setThreads((prev) => [{ id, title: 'New chat', updatedAtLabel: 'now' }, ...prev])
    setSelectedThreadId(id)
    setSection('agent-chat')
  }

  const showChatThreads = section === 'agent-chat'

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-zinc-950 text-zinc-100">
      <AppHeader />
      <Group
        key={showChatThreads ? 'layout-chat-3' : 'layout-main-2'}
        id="dashboard-panels"
        orientation="horizontal"
        className="flex min-h-0 flex-1"
      >
        <Panel id="nav" defaultSize={showChatThreads ? '18%' : '22%'} minSize="12%" className="min-h-0 min-w-0">
          <PrimaryNav active={section} onSelect={setSection} />
        </Panel>
        <Separator
          id="sep-nav"
          className="w-2 shrink-0 bg-transparent outline-none transition-colors hover:bg-orange-500/20 data-[separator]:cursor-col-resize"
        />
        {showChatThreads ? (
          <>
            <Panel id="threads" defaultSize="24%" minSize="16%" className="min-h-0 min-w-0">
              <ChatThreadsSidebar
                threads={filteredThreads}
                selectedId={selectedThreadId}
                onSelect={setSelectedThreadId}
                onNewChat={onNewChat}
                filter={threadFilter}
                onFilterChange={setThreadFilter}
              />
            </Panel>
            <Separator
              id="sep-main"
              className="w-2 shrink-0 bg-transparent outline-none transition-colors hover:bg-orange-500/20 data-[separator]:cursor-col-resize"
            />
          </>
        ) : null}
        <Panel id="main" defaultSize={showChatThreads ? '58%' : '78%'} minSize="36%" className="min-h-0 min-w-0">
          {section === 'agent-chat' && selectedThreadId ? (
            <AgentChatPanel threadId={selectedThreadId} threadTitle={selectedTitle} />
          ) : section === 'configuration' ? (
            <div className="h-full overflow-y-auto bg-zinc-950 px-4 py-6 sm:px-8">
              <div className="mx-auto max-w-5xl">
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-orange-400">Vault & cluster</h2>
                <p className="mb-8 max-w-2xl text-sm text-zinc-500">
                  Map variables from <code className="rounded bg-white/10 px-1">.env.example</code> into Vault, sync the
                  MCP deployment, and restart the rollout.
                </p>
                <EnvForm catalog={catalog} />
              </div>
            </div>
          ) : section === 'memory' ? (
            <PlaceholderPanel
              title="Memory"
              description="Vault-backed memory and recall tooling will surface here. Use Agent Chat to drive memory_ingest / memory_recall via OpenClaw."
            />
          ) : section === 'documents' ? (
            <PlaceholderPanel
              title="Documents"
              description="Document pipeline status and deep links to Paperless, Tika, and related stacks will live here."
            />
          ) : section === 'tasks' ? (
            <PlaceholderPanel title="Tasks" description="Scheduled checks, Ouroboros runs, and operator tasks will appear in this view." />
          ) : section === 'activity' ? (
            <PlaceholderPanel title="Activity" description="Audit stream, deployments, and mesh events will be summarized here." />
          ) : (
            <PlaceholderPanel
              title="Applications"
              description="Bundled UIs and in-cluster services (docs, provider UIs) will be linked from this hub."
            />
          )}
        </Panel>
      </Group>
    </div>
  )
}
