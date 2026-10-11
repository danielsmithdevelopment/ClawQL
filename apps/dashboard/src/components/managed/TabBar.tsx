'use client'

import { cn } from '@/lib/utils'

export type TabItem<T extends string> = {
  readonly id: T
  readonly label: string
  readonly count?: number
}

export function TabBar<T extends string>({
  tabs,
  value,
  onChange,
  testIdPrefix,
}: {
  tabs: readonly TabItem<T>[]
  value: T
  onChange: (id: T) => void
  testIdPrefix?: string
}) {
  return (
    <div className="mb-5 flex flex-wrap gap-4 border-b border-slate-200 text-sm">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          data-testid={testIdPrefix ? `${testIdPrefix}-${tab.id}` : undefined}
          className={cn(
            'border-b-2 px-0.5 pb-2 font-medium transition-colors',
            value === tab.id
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-800',
          )}
        >
          {tab.label}
          {tab.count != null ? ` ${tab.count}` : ''}
        </button>
      ))}
    </div>
  )
}
