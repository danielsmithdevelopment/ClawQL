'use client'

import clsx from 'clsx'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'

import { Tag } from '@/components/Tag'
import {
  PLUGIN_CATEGORY_LABELS,
  PLUGIN_STATUS_LABELS,
  pluginRegistryEntries,
  type PluginCategory,
  type PluginRegistryEntry,
  type PluginStatus,
} from '@/lib/plugin-registry-data'
import {
  DEFAULT_PAGE_SIZE,
  filterEntries,
  PAGE_SIZE_OPTIONS,
  paginateEntries,
  sortEntries,
  type CategoryFilter,
  type SortDir,
  type SortKey,
  type StatusFilter,
} from '@/lib/plugin-registry-query'

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

function SortHeader({
  label,
  column,
  sortKey,
  sortDir,
  onSort,
  className,
}: {
  label: string
  column: SortKey
  sortKey: SortKey
  sortDir: SortDir
  onSort: (key: SortKey) => void
  className?: string
}) {
  const active = sortKey === column
  return (
    <th
      scope="col"
      className={clsx(
        'px-3 py-2.5 text-left text-xs font-semibold tracking-wide text-zinc-600 uppercase dark:text-zinc-400',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className="inline-flex items-center gap-1 rounded-sm hover:text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-claw-cyan dark:hover:text-white dark:focus-visible:outline-claw-cyan-bright"
        aria-sort={
          active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'
        }
      >
        {label}
        <span className="font-mono text-[0.65rem] text-zinc-400" aria-hidden>
          {active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </button>
    </th>
  )
}

function readUrlState(): {
  query: string
  category: CategoryFilter
  status: StatusFilter
  sortKey: SortKey
  sortDir: SortDir
  page: number
  pageSize: number
} {
  if (typeof window === 'undefined') {
    return {
      query: '',
      category: 'all',
      status: 'all',
      sortKey: 'category',
      sortDir: 'asc',
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
    }
  }
  const params = new URLSearchParams(window.location.search)
  const category = (params.get('kind') ?? 'all') as CategoryFilter
  const status = (params.get('status') ?? 'all') as StatusFilter
  const sortKey = (params.get('sort') ?? 'category') as SortKey
  const sortDir = params.get('dir') === 'desc' ? 'desc' : 'asc'
  const page = Number(params.get('page') ?? '1') || 1
  const rawSize = Number(params.get('pageSize') ?? DEFAULT_PAGE_SIZE)
  const pageSize = (PAGE_SIZE_OPTIONS as readonly number[]).includes(rawSize)
    ? rawSize
    : DEFAULT_PAGE_SIZE
  const knownCategory = CATEGORY_FILTERS.some((c) => c.id === category)
  const knownStatus = STATUS_FILTERS.some((s) => s.id === status)
  const knownSort = ['name', 'category', 'status', 'package'].includes(sortKey)
  return {
    query: params.get('q') ?? '',
    category: knownCategory ? category : 'all',
    status: knownStatus ? status : 'all',
    sortKey: knownSort ? sortKey : 'category',
    sortDir,
    page: Math.max(1, page),
    pageSize,
  }
}

function writeUrlState(state: {
  query: string
  category: CategoryFilter
  status: StatusFilter
  sortKey: SortKey
  sortDir: SortDir
  page: number
  pageSize: number
}) {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams()
  if (state.query.trim()) params.set('q', state.query.trim())
  if (state.category !== 'all') params.set('kind', state.category)
  if (state.status !== 'all') params.set('status', state.status)
  if (state.sortKey !== 'category') params.set('sort', state.sortKey)
  if (state.sortDir !== 'asc') params.set('dir', state.sortDir)
  if (state.page > 1) params.set('page', String(state.page))
  if (state.pageSize !== DEFAULT_PAGE_SIZE) {
    params.set('pageSize', String(state.pageSize))
  }
  const qs = params.toString()
  const next = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash || '#registry'}`
  window.history.replaceState(null, '', next)
}

function truncateTools(tools: string[] | undefined, max = 3): string {
  if (!tools?.length) return '—'
  if (tools.length <= max) return tools.join(', ')
  return `${tools.slice(0, max).join(', ')} +${tools.length - max}`
}

export function PluginRegistryExplorer() {
  const searchId = useId()
  const tableId = useId()
  const searchParams = useSearchParams()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('category')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE)
  const [urlReady, setUrlReady] = useState(false)
  const skipNextWrite = useRef(false)
  const deferredQuery = useDeferredValue(query)
  const searchKey = searchParams.toString()

  useEffect(() => {
    skipNextWrite.current = true
    const initial = readUrlState()
    setQuery(initial.query)
    setCategory(initial.category)
    setStatus(initial.status)
    setSortKey(initial.sortKey)
    setSortDir(initial.sortDir)
    setPage(initial.page)
    setPageSize(initial.pageSize)
    setUrlReady(true)
  }, [searchKey])

  const filtered = filterEntries(pluginRegistryEntries, {
    query: deferredQuery,
    category,
    status,
  })
  const sorted = sortEntries(filtered, sortKey, sortDir)
  const {
    page: safePage,
    pageCount,
    slice,
  } = paginateEntries(sorted, page, pageSize)

  useEffect(() => {
    if (page !== safePage) setPage(safePage)
  }, [page, safePage])

  useEffect(() => {
    if (!urlReady) return
    if (skipNextWrite.current) {
      skipNextWrite.current = false
      return
    }
    writeUrlState({
      query: deferredQuery,
      category,
      status,
      sortKey,
      sortDir,
      page: safePage,
      pageSize,
    })
  }, [
    urlReady,
    deferredQuery,
    category,
    status,
    sortKey,
    sortDir,
    safePage,
    pageSize,
  ])

  function onSort(key: SortKey) {
    startTransition(() => {
      if (sortKey === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
      } else {
        setSortKey(key)
        setSortDir('asc')
      }
      setPage(1)
    })
  }

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
              onChange={(event) => {
                setQuery(event.target.value)
                setPage(1)
              }}
              placeholder="Name, package, tool, domain, composes…"
              autoComplete="off"
              className="mt-2 w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm ring-1 ring-zinc-900/10 placeholder:text-zinc-400 focus:ring-2 focus:ring-claw-cyan focus:outline-none dark:bg-claw-bg dark:text-zinc-100 dark:ring-white/10 dark:placeholder:text-zinc-500 dark:focus:ring-claw-cyan-bright"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
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
                      startTransition(() => {
                        setCategory(item.id)
                        setPage(1)
                      })
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
                      startTransition(() => {
                        setStatus(item.id)
                        setPage(1)
                      })
                    }}
                  >
                    {item.label}
                  </FilterChip>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-600 dark:text-zinc-400">
          <p>
            Showing{' '}
            <span className="font-semibold text-zinc-900 dark:text-zinc-200">
              {sorted.length === 0
                ? 0
                : `${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, sorted.length)}`}
            </span>{' '}
            of{' '}
            <span className="font-semibold text-zinc-900 dark:text-zinc-200">
              {sorted.length}
            </span>{' '}
            match
            {sorted.length === 1 ? '' : 'es'}
            {sorted.length !== pluginRegistryEntries.length ? (
              <> (catalog {pluginRegistryEntries.length})</>
            ) : null}
            {category === 'vertical' ? (
              <>
                {' '}
                · vertical presets compose horizontals + domain{' '}
                <code className="font-mono text-[0.85em]">.cqw</code>
              </>
            ) : null}
            {category === 'horizontal' ? (
              <> · building blocks for vertical presets</>
            ) : null}
            {category === 'all' && status === 'all' && !deferredQuery.trim() ? (
              <> · {verticalCount} domain vertical presets</>
            ) : null}
          </p>
          <label className="flex items-center gap-2 text-xs">
            <span className="text-zinc-500">Rows</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value))
                setPage(1)
              }}
              className="rounded-md border-0 bg-white py-1 pr-8 pl-2 text-xs text-zinc-800 ring-1 ring-zinc-900/10 dark:bg-claw-bg dark:text-zinc-200 dark:ring-white/10"
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="mt-8 text-sm text-zinc-600 dark:text-zinc-400">
          No plugins match. Clear filters or try a broader search.
        </p>
      ) : (
        <>
          <div className="mt-4 overflow-x-auto rounded-xl ring-1 ring-zinc-900/10 dark:ring-white/10">
            <table
              id={tableId}
              className="w-full min-w-[56rem] border-collapse text-left text-sm"
            >
              <thead className="bg-zinc-50 dark:bg-white/[0.04]">
                <tr className="border-b border-zinc-900/10 dark:border-white/10">
                  <SortHeader
                    label="Name"
                    column="name"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                    className="sticky left-0 z-10 min-w-[14rem] bg-zinc-50 dark:bg-claw-bg"
                  />
                  <SortHeader
                    label="Kind"
                    column="category"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                  />
                  <SortHeader
                    label="Status"
                    column="status"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                  />
                  <SortHeader
                    label="Package"
                    column="package"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                  />
                  <th
                    scope="col"
                    className="px-3 py-2.5 text-left text-xs font-semibold tracking-wide text-zinc-600 uppercase dark:text-zinc-400"
                  >
                    Composes
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-2.5 text-left text-xs font-semibold tracking-wide text-zinc-600 uppercase dark:text-zinc-400"
                  >
                    Tools
                  </th>
                </tr>
              </thead>
              <tbody>
                {slice.map((entry) => (
                  <RegistryTableRow key={entry.id} entry={entry} />
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-zinc-500 dark:text-zinc-500">
              Page {safePage} of {pageCount}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-md px-3 py-1.5 text-xs font-medium text-zinc-700 ring-1 ring-zinc-900/10 enabled:hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-300 dark:ring-white/10 dark:enabled:hover:bg-white/5"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={safePage >= pageCount}
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                className="rounded-md px-3 py-1.5 text-xs font-medium text-zinc-700 ring-1 ring-zinc-900/10 enabled:hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-300 dark:ring-white/10 dark:enabled:hover:bg-white/5"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function RegistryTableRow({ entry }: { entry: PluginRegistryEntry }) {
  return (
    <tr className="border-b border-zinc-900/5 last:border-b-0 hover:bg-zinc-50/80 dark:border-white/5 dark:hover:bg-white/[0.03]">
      <td className="sticky left-0 z-[1] bg-white px-3 py-3 align-top dark:bg-claw-bg">
        <Link
          href={entry.href}
          className="group block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-claw-cyan dark:focus-visible:outline-claw-cyan-bright"
        >
          <span className="font-semibold text-zinc-900 group-hover:underline dark:text-white">
            {entry.name}
          </span>
          <span className="mt-0.5 block font-mono text-[0.7rem] text-zinc-500 dark:text-zinc-400">
            {entry.id}
          </span>
          <span className="mt-1 block max-w-xs text-xs text-zinc-600 dark:text-zinc-400">
            {entry.description}
          </span>
          {entry.boilerplate ? (
            <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-500">
              <span className="font-medium text-zinc-600 dark:text-zinc-400">
                Boilerplate
              </span>{' '}
              {entry.boilerplate}
            </span>
          ) : null}
        </Link>
      </td>
      <td className="px-3 py-3 align-top whitespace-nowrap">
        <Tag color={categoryTagColor(entry.category)} variant="medium">
          {PLUGIN_CATEGORY_LABELS[entry.category]}
        </Tag>
      </td>
      <td className="px-3 py-3 align-top whitespace-nowrap">
        <Tag color={statusTagColor(entry.status)} variant="medium">
          {PLUGIN_STATUS_LABELS[entry.status]}
        </Tag>
      </td>
      <td className="px-3 py-3 align-top">
        <code className="font-mono text-xs text-zinc-600 dark:text-zinc-400">
          {entry.package ?? '—'}
        </code>
      </td>
      <td className="px-3 py-3 align-top text-xs text-zinc-600 dark:text-zinc-400">
        {entry.composes?.length ? entry.composes.join(' · ') : '—'}
      </td>
      <td className="px-3 py-3 align-top">
        <code className="font-mono text-xs text-zinc-600 dark:text-zinc-400">
          {truncateTools(entry.tools)}
        </code>
      </td>
    </tr>
  )
}
