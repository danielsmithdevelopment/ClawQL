'use client'

import clsx from 'clsx'
import Link from 'next/link'
import { startTransition, useDeferredValue, useId, useState } from 'react'

import { Tag } from '@/components/Tag'
import {
  entrySearchText,
  PLUGIN_CATEGORY_LABELS,
  PLUGIN_STATUS_LABELS,
  pluginRegistryEntries,
  SHIPPED_STATUSES,
  type PluginCategory,
  type PluginRegistryEntry,
  type PluginStatus,
} from '@/lib/plugin-registry-data'

type CategoryFilter = 'all' | PluginCategory
type StatusFilter = 'all' | 'available' | 'planned' | 'roadmap'

const CATEGORY_FILTERS: Array<{ id: CategoryFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'horizontal', label: 'Horizontal' },
  { id: 'vertical', label: 'Domain verticals' },
  { id: 'proxy', label: 'MCP proxy' },
  { id: 'core', label: 'Gateway core' },
  { id: 'providers', label: 'Providers' },
  { id: 'third-party', label: 'Third-party' },
]

const STATUS_FILTERS: Array<{ id: StatusFilter; label: string }> = [
  { id: 'all', label: 'Any status' },
  { id: 'available', label: 'Available' },
  { id: 'planned', label: 'Planned' },
  { id: 'roadmap', label: 'Roadmap' },
]

function statusTagColor(
  status: PluginStatus,
): 'claw' | 'sky' | 'amber' | 'zinc' | 'rose' {
  switch (status) {
    case 'always-on':
    case 'default-on':
    case 'shipped':
      return 'claw'
    case 'opt-in':
      return 'sky'
    case 'planned':
      return 'amber'
    case 'roadmap':
      return 'zinc'
    default:
      return 'zinc'
  }
}

function categoryTagColor(
  category: PluginCategory,
): 'claw' | 'sky' | 'amber' | 'zinc' | 'rose' {
  switch (category) {
    case 'vertical':
      return 'amber'
    case 'horizontal':
      return 'claw'
    case 'proxy':
      return 'sky'
    case 'core':
      return 'zinc'
    case 'providers':
      return 'sky'
    case 'third-party':
      return 'rose'
    default:
      return 'zinc'
  }
}

function matchesStatus(entry: PluginRegistryEntry, filter: StatusFilter) {
  if (filter === 'all') return true
  if (filter === 'available') return SHIPPED_STATUSES.has(entry.status)
  return entry.status === filter
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        'rounded-md px-2.5 py-1 text-xs font-medium transition',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-claw-cyan dark:focus-visible:outline-claw-cyan-bright',
        active
          ? 'bg-zinc-900 text-white dark:bg-claw-cyan/15 dark:text-claw-cyan dark:ring-1 dark:ring-claw-cyan/35 dark:ring-inset'
          : 'bg-zinc-100 text-zinc-700 ring-1 ring-zinc-900/10 ring-inset hover:bg-zinc-200/80 dark:bg-white/5 dark:text-zinc-300 dark:ring-white/10 dark:hover:bg-white/10',
      )}
    >
      {children}
    </button>
  )
}

function RegistryRow({ entry }: { entry: PluginRegistryEntry }) {
  return (
    <li className="border-b border-zinc-900/5 last:border-b-0 dark:border-white/5">
      <Link
        href={entry.href}
        aria-label={entry.name}
        className="group block px-1 py-4 transition hover:bg-zinc-50/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-claw-cyan sm:px-3 dark:hover:bg-white/3 dark:focus-visible:outline-claw-cyan-bright"
      >
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
          <h3
            aria-hidden="true"
            className="text-sm font-semibold text-zinc-900 group-hover:text-zinc-950 dark:text-white dark:group-hover:text-white"
          >
            {entry.name}
          </h3>
          <code className="font-mono text-[0.7rem] text-zinc-500 dark:text-zinc-400">
            {entry.id}
          </code>
          <div className="flex flex-wrap gap-1.5">
            <Tag color={categoryTagColor(entry.category)} variant="medium">
              {PLUGIN_CATEGORY_LABELS[entry.category]}
            </Tag>
            <Tag color={statusTagColor(entry.status)} variant="medium">
              {PLUGIN_STATUS_LABELS[entry.status]}
            </Tag>
          </div>
        </div>
        <p className="mt-1.5 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
          {entry.description}
        </p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-500">
          {entry.package ? (
            <span>
              <span className="text-zinc-400 dark:text-zinc-600">Package </span>
              <code className="font-mono text-zinc-600 dark:text-zinc-400">
                {entry.package}
              </code>
            </span>
          ) : null}
          {entry.enable ? (
            <span>
              <span className="text-zinc-400 dark:text-zinc-600">Enable </span>
              <code className="font-mono text-zinc-600 dark:text-zinc-400">
                {entry.enable}
              </code>
            </span>
          ) : null}
          {entry.tools && entry.tools.length > 0 ? (
            <span>
              <span className="text-zinc-400 dark:text-zinc-600">Tools </span>
              <code className="font-mono text-zinc-600 dark:text-zinc-400">
                {entry.tools.join(', ')}
              </code>
            </span>
          ) : null}
        </div>
      </Link>
    </li>
  )
}

export function PluginRegistryExplorer() {
  const searchId = useId()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const deferredQuery = useDeferredValue(query)
  const normalizedQuery = deferredQuery.trim().toLowerCase()

  const filtered = pluginRegistryEntries.filter((entry) => {
    if (category !== 'all' && entry.category !== category) return false
    if (!matchesStatus(entry, status)) return false
    if (!normalizedQuery) return true
    return entrySearchText(entry).includes(normalizedQuery)
  })

  const verticalCount = pluginRegistryEntries.filter(
    (e) => e.category === 'vertical',
  ).length

  return (
    <div className="not-prose">
      <div className="rounded-xl border border-zinc-900/10 bg-zinc-50/60 p-4 sm:p-5 dark:border-white/10 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-4">
          <div>
            <label
              htmlFor={searchId}
              className="block text-xs font-semibold tracking-wide text-zinc-700 uppercase dark:text-zinc-300"
            >
              Search registry
            </label>
            <input
              id={searchId}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter by name, package, tool, domain…"
              autoComplete="off"
              className="mt-2 w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm ring-1 ring-zinc-900/10 placeholder:text-zinc-400 focus:ring-2 focus:ring-claw-cyan focus:outline-none dark:bg-claw-bg dark:text-zinc-100 dark:ring-white/10 dark:placeholder:text-zinc-500 dark:focus:ring-claw-cyan-bright"
            />
          </div>

          <div>
            <p className="text-xs font-semibold tracking-wide text-zinc-700 uppercase dark:text-zinc-300">
              Kind
            </p>
            <div
              className="mt-2 flex flex-wrap gap-2"
              role="group"
              aria-label="Filter by plugin kind"
            >
              {CATEGORY_FILTERS.map((item) => (
                <FilterChip
                  key={item.id}
                  active={category === item.id}
                  onClick={() => {
                    startTransition(() => setCategory(item.id))
                  }}
                >
                  {item.label}
                </FilterChip>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold tracking-wide text-zinc-700 uppercase dark:text-zinc-300">
              Status
            </p>
            <div
              className="mt-2 flex flex-wrap gap-2"
              role="group"
              aria-label="Filter by status"
            >
              {STATUS_FILTERS.map((item) => (
                <FilterChip
                  key={item.id}
                  active={status === item.id}
                  onClick={() => {
                    startTransition(() => setStatus(item.id))
                  }}
                >
                  {item.label}
                </FilterChip>
              ))}
            </div>
          </div>
        </div>

        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          Showing{' '}
          <span className="font-semibold text-zinc-900 dark:text-zinc-200">
            {filtered.length}
          </span>{' '}
          of {pluginRegistryEntries.length} entries
          {category === 'all' && status === 'all' && !normalizedQuery ? (
            <>
              {' '}
              · {verticalCount} domain verticals (same plugin model as
              horizontal packages)
            </>
          ) : null}
        </p>
      </div>

      {filtered.length === 0 ? (
        <p className="mt-8 text-sm text-zinc-600 dark:text-zinc-400">
          No plugins match. Clear filters or try a broader search.
        </p>
      ) : (
        <ul className="mt-2 divide-y-0 border-t border-zinc-900/5 dark:border-white/5">
          {filtered.map((entry) => (
            <RegistryRow key={entry.id} entry={entry} />
          ))}
        </ul>
      )}
    </div>
  )
}
