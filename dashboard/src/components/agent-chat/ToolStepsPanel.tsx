'use client'

import { Loader2 } from 'lucide-react'

import type { ChatToolStep } from '@/components/dashboard/types'
import { cn } from '@/lib/utils'

function StepIcon({ state }: { state: ChatToolStep['state'] }) {
  if (state === 'done') return <span className="text-emerald-500">✓</span>
  if (state === 'active') return <Loader2 className="size-3.5 animate-spin text-orange-500" aria-hidden />
  return <span className="text-zinc-600">⋯</span>
}

export function ToolStepsPanel({
  steps,
  active,
}: {
  steps: ChatToolStep[]
  active?: boolean
}) {
  if (steps.length === 0) return null
  return (
    <div className="rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-zinc-300">
      <div className="mb-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        <span>Tool execution</span>
        <span className={active ? 'text-orange-400' : 'text-zinc-500'}>{active ? '● active' : '○ idle'}</span>
      </div>
      <ul className="space-y-1.5">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-2">
            <span className="shrink-0 pt-0.5">
              <StepIcon state={s.state} />
            </span>
            <span className={cn(s.state === 'pending' && 'text-zinc-600')}>{s.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
