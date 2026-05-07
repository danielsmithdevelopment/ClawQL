'use client'

import {
  Activity,
  Brain,
  FileText,
  LayoutGrid,
  ListTodo,
  MessageSquare,
  Settings,
} from 'lucide-react'

import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

import type { DashboardSection } from './types'

const NAV: { id: DashboardSection; label: string; icon: typeof MessageSquare }[] = [
  { id: 'agent-chat', label: 'Agent Chat', icon: MessageSquare },
  { id: 'memory', label: 'Memory', icon: Brain },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'tasks', label: 'Tasks', icon: ListTodo },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'applications', label: 'Applications', icon: LayoutGrid },
  { id: 'configuration', label: 'Configuration', icon: Settings },
]

export function PrimaryNav({
  active,
  onSelect,
}: {
  active: DashboardSection
  onSelect: (id: DashboardSection) => void
}) {
  return (
    <nav className="flex h-full min-h-0 flex-col border-r border-white/10 bg-zinc-950">
      <div className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {NAV.map(({ id, label, icon: Icon }) => {
          const isActive = active === id
          return (
            <button
              key={id}
              type="button"
              data-testid={`nav-${id}`}
              onClick={() => onSelect(id)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors',
                isActive
                  ? 'bg-orange-500/15 text-orange-400'
                  : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200',
              )}
            >
              <Icon className={cn('size-4 shrink-0', isActive ? 'text-orange-500' : 'text-zinc-500')} aria-hidden />
              {label}
            </button>
          )
        })}
      </div>
      <div className="border-t border-white/10 p-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Fleet online</p>
        <p className="mt-1 text-xs text-zinc-300">3 / 10 agents active</p>
        <Progress value={30} className="mt-2 h-1.5" />
        <p className="mt-2 font-mono text-[10px] text-zinc-500">HATS: 24 queued</p>
      </div>
    </nav>
  )
}
