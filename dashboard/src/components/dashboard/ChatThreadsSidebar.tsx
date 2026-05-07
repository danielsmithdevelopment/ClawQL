'use client'

import { Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

import type { ChatThread } from './types'

export function ChatThreadsSidebar({
  threads,
  selectedId,
  onSelect,
  onNewChat,
  filter,
  onFilterChange,
}: {
  threads: ChatThread[]
  selectedId: string | null
  onSelect: (id: string) => void
  onNewChat: () => void
  filter: string
  onFilterChange: (v: string) => void
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
                <span className="flex items-center gap-2 font-medium text-zinc-100">
                  {t.dot ? (
                    <span
                      className={cn(
                        'size-1.5 shrink-0 rounded-full',
                        t.dot === 'green' && 'bg-emerald-500',
                        t.dot === 'amber' && 'bg-amber-500',
                        t.dot === 'zinc' && 'bg-zinc-600',
                      )}
                    />
                  ) : null}
                  {t.title}
                </span>
                <span className="text-[11px] text-zinc-500">{t.updatedAtLabel}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
