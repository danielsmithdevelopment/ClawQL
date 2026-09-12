'use client'

import { Group, Panel, Separator } from 'react-resizable-panels'
import { useCallback, useEffect, useMemo, useState } from 'react'

import type { EnvCatalog } from '@/lib/env-catalog'
import { useDashboardRuntime } from '@/lib/use-dashboard-runtime'
import { ProviderVaultForm } from '@/components/ProviderVaultForm'
import { CustomSourcesForm } from '@/components/CustomSourcesForm'
import {
  createChatThreadApi,
  fetchChatVault,
  formatThreadUpdatedAt,
  importLegacyLocalChatsToVault,
} from '@/lib/chat-storage'

import { AgentChatPanel } from './AgentChatPanel'
import { AppHeader } from './AppHeader'
import { ChatThreadsSidebar } from './ChatThreadsSidebar'
import { PlaceholderPanel } from './PlaceholderPanel'
import { PrimaryNav } from './PrimaryNav'
import type { ChatThread, DashboardSection } from './types'

function sortThreads(threads: ChatThread[]): ChatThread[] {
  return [...threads].sort((a, b) => b.updatedAt - a.updatedAt)
}

export function DashboardShell({ catalog: _catalog }: { catalog: EnvCatalog }) {
  const runtime = useDashboardRuntime()
  const desktopMode = runtime?.desktopMode ?? false
  const [section, setSection] = useState<DashboardSection>('agent-chat')
  const [threads, setThreads] = useState<ChatThread[]>([])
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [threadFilter, setThreadFilter] = useState('')
  const [vaultRoot, setVaultRoot] = useState<string | null>(null)
  const [vaultError, setVaultError] = useState<string | null>(null)
  const [storageReady, setStorageReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        let data = await fetchChatVault()
        if (!cancelled && data.threads.length === 0) {
          await importLegacyLocalChatsToVault()
          data = await fetchChatVault()
        }
        if (cancelled) return
        setVaultRoot(data.vaultRoot)
        setVaultError(data.writable ? null : `Vault path is not writable: ${data.vaultRoot}`)
        const sorted = sortThreads(data.threads)
        setThreads(sorted)
        setSelectedThreadId(sorted[0]?.id ?? null)
      } catch (e) {
        if (!cancelled) {
          setVaultError(e instanceof Error ? e.message : 'Failed to load chats from vault')
        }
      } finally {
        if (!cancelled) setStorageReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

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
    void (async () => {
      try {
        const thread = await createChatThreadApi('New chat')
        setThreads((prev) => sortThreads([thread, ...prev]))
        setSelectedThreadId(thread.id)
        setSection('agent-chat')
        setVaultError(null)
      } catch (e) {
        setVaultError(e instanceof Error ? e.message : 'Failed to create chat')
      }
    })()
  }

  const onThreadActivity = useCallback((threadId: string, patch: { title?: string; updatedAt: number }) => {
    setThreads((prev) =>
      sortThreads(
        prev.map((t) =>
          t.id === threadId
            ? {
                ...t,
                ...(patch.title !== undefined ? { title: patch.title } : {}),
                updatedAt: patch.updatedAt,
              }
            : t,
        ),
      ),
    )
  }, [])

  const onThreadMetaFromServer = useCallback((thread: ChatThread) => {
    setThreads((prev) => sortThreads(prev.map((t) => (t.id === thread.id ? thread : t))))
  }, [])

  const showChatThreads = section === 'agent-chat'

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-zinc-950 text-zinc-100">
      <AppHeader />
      {vaultRoot ? (
        <p className="shrink-0 border-b border-white/5 bg-zinc-900/50 px-4 py-1.5 font-mono text-[10px] text-zinc-500 sm:px-6">
          Chats: <span className="text-zinc-400">{vaultRoot}/Dashboard/chats/</span>
        </p>
      ) : null}
      {vaultError ? (
        <p className="shrink-0 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-xs text-amber-200 sm:px-6" role="alert">
          {vaultError}
        </p>
      ) : null}
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
                loading={!storageReady}
              />
            </Panel>
            <Separator
              id="sep-main"
              className="w-2 shrink-0 bg-transparent outline-none transition-colors hover:bg-orange-500/20 data-[separator]:cursor-col-resize"
            />
          </>
        ) : null}
        <Panel id="main" defaultSize={showChatThreads ? '58%' : '78%'} minSize="36%" className="min-h-0 min-w-0">
          {section === 'agent-chat' && selectedThreadId && storageReady ? (
            <AgentChatPanel
              threadId={selectedThreadId}
              threadTitle={selectedTitle}
              onThreadActivity={(patch) => onThreadActivity(selectedThreadId, patch)}
              onThreadMetaFromServer={onThreadMetaFromServer}
            />
          ) : section === 'agent-chat' ? (
            <PlaceholderPanel
              title="Agent Chat"
              description={
                storageReady
                  ? 'Create a chat with + in the sidebar. History is stored under your ClawQL vault (Dashboard/chats/).'
                  : 'Loading chat history from vault…'
              }
            />
          ) : section === 'custom-sources' ? (
            <div className="h-full overflow-y-auto bg-zinc-950 px-4 py-6 sm:px-8">
              <div className="mx-auto max-w-5xl">
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-orange-400">Custom sources</h2>
                <p className="mb-8 max-w-2xl text-sm text-zinc-500">
                  Add integrations from URL or CLI — OpenAPI, Discovery, GraphQL, gRPC, MCP. Merged into{' '}
                  <code className="rounded bg-white/10 px-1">search</code> /{' '}
                  <code className="rounded bg-white/10 px-1">execute</code> on MCP startup.
                </p>
                <CustomSourcesForm />
              </div>
            </div>
          ) : section === 'configuration' ? (
            <div className="h-full overflow-y-auto bg-zinc-950 px-4 py-6 sm:px-8">
              <div className="mx-auto max-w-5xl">
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-orange-400">Provider secrets</h2>
                <p className="mb-8 max-w-2xl text-sm text-zinc-500">
                  {desktopMode
                    ? 'Configure bundled vendor API keys for local MCP (stdio). Saved to ~/.ClawQL/vault/providers.json — the same KV shape as cluster Vault.'
                    : 'Configure bundled vendor API keys without the Vault CLI. Values are stored in secret/clawql/providers and synced to your cluster.'}
                </p>
                <ProviderVaultForm />
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
