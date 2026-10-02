'use client'

import { Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatThreadUpdatedAt } from '@/lib/chat-storage'
import { cn } from '@/lib/utils'

import type { ChatThread } from './types'

export function ChatThreadsSidebar({
  threads,
  selectedId,
  onSelect,
  onNewChat,
  filter,
  onFilterChange,
  loading = false,
}: {
  threads: ChatThread[]
  selectedId: string | null
  onSelect: (id: string) => void
  onNewChat: () => void
  filter: string
  onFilterChange: (v: string) => void
  loading?: boolean
}) {
  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-white/10 bg-zinc-900/40">
      <div className="flex shrink-0 gap-2 border-b border-white/10 p-2">
        <Input
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          placeholder="Filter"
          className="h-9 flex-1 text-xs"
          aria-label="Filter threads"
        />
        <Button type="button" size="icon" className="shrink-0 bg-orange-500 text-zinc-950 hover:bg-orange-400" onClick={onNewChat} aria-label="New chat">
          <Plus className="size-4" />
        </Button>
      </div>
      <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
        {loading ? (
          <li className="px-3 py-6 text-center text-xs text-zinc-500">Loading chats from vault…</li>
        ) : threads.length === 0 ? (
          <li className="px-3 py-6 text-center text-xs text-zinc-500">
            No chats yet. Press <span className="font-medium text-zinc-400">+</span> to start one — history is saved under{' '}
            <span className="font-mono text-zinc-400">~/.ClawQL/Dashboard/chats/</span>.
          </li>
        ) : null}
        {threads.map((t) => {
          const sel = t.id === selectedId
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onSelect(t.id)}
                className={cn(
                  'flex w-full flex-col gap-0.5 rounded-lg border border-transparent px-3 py-2.5 text-left text-sm transition-colors',
                  sel ? 'border-l-2 border-l-orange-500 bg-orange-500/10 pl-[10px]' : 'hover:bg-white/5',
                )}
              >
                <span className="font-medium text-zinc-100">{t.title}</span>
                <span className="text-[11px] text-zinc-500">{formatThreadUpdatedAt(t.updatedAt)}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
