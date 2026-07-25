/**
 * Pure query helpers for the /plugins registry table.
 *
 * Scale notes:
 * - Today (~25–50 rows): filter + sort in memory is trivial.
 * - Near term (~100–500): keep this path; pagination caps DOM size.
 * - Larger catalogs (1k–10k+): load a generated JSON manifest, swap
 *   `filterEntries` search for a FlexSearch Document index, and consider
 *   windowing (e.g. @tanstack/react-virtual) if page size grows.
 */

import {
  entrySearchText,
  SHIPPED_STATUSES,
  type PluginCategory,
  type PluginRegistryEntry,
  type PluginStatus,
} from '@/lib/plugin-registry-data'

export type CategoryFilter = 'all' | PluginCategory
export type StatusFilter = 'all' | 'available' | 'planned' | 'roadmap'
export type SortKey = 'name' | 'category' | 'status' | 'package'
export type SortDir = 'asc' | 'desc'

export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const
export const DEFAULT_PAGE_SIZE = 25

const STATUS_RANK: Record<PluginStatus, number> = {
  'always-on': 0,
  'default-on': 1,
  shipped: 2,
  'opt-in': 3,
  planned: 4,
  roadmap: 5,
}

const CATEGORY_RANK: Record<PluginCategory, number> = {
  core: 0,
  proxy: 1,
  horizontal: 2,
  providers: 3,
  vertical: 4,
  'third-party': 5,
}

export function matchesStatus(
  entry: PluginRegistryEntry,
  filter: StatusFilter,
): boolean {
  if (filter === 'all') return true
  if (filter === 'available') return SHIPPED_STATUSES.has(entry.status)
  return entry.status === filter
}

export function filterEntries(
  entries: readonly PluginRegistryEntry[],
  opts: {
    query: string
    category: CategoryFilter
    status: StatusFilter
  },
): PluginRegistryEntry[] {
  const q = opts.query.trim().toLowerCase()
  return entries.filter((entry) => {
    if (opts.category !== 'all' && entry.category !== opts.category)
      return false
    if (!matchesStatus(entry, opts.status)) return false
    if (!q) return true
    return entrySearchText(entry).includes(q)
  })
}

export function sortEntries(
  entries: PluginRegistryEntry[],
  sortKey: SortKey,
  sortDir: SortDir,
): PluginRegistryEntry[] {
  const dir = sortDir === 'asc' ? 1 : -1
  return [...entries].sort((a, b) => {
    let cmp = 0
    switch (sortKey) {
      case 'name':
        cmp = a.name.localeCompare(b.name)
        break
      case 'category':
        cmp = CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category]
        if (cmp === 0) cmp = a.name.localeCompare(b.name)
        break
      case 'status':
        cmp = STATUS_RANK[a.status] - STATUS_RANK[b.status]
        if (cmp === 0) cmp = a.name.localeCompare(b.name)
        break
      case 'package':
        cmp = (a.package ?? '').localeCompare(b.package ?? '')
        if (cmp === 0) cmp = a.name.localeCompare(b.name)
        break
    }
    return cmp * dir
  })
}

export function paginateEntries<T>(
  entries: readonly T[],
  page: number,
  pageSize: number,
): { page: number; pageCount: number; slice: T[] } {
  const pageCount = Math.max(1, Math.ceil(entries.length / pageSize))
  const safePage = Math.min(Math.max(1, page), pageCount)
  const start = (safePage - 1) * pageSize
  return {
    page: safePage,
    pageCount,
    slice: entries.slice(start, start + pageSize) as T[],
  }
}
